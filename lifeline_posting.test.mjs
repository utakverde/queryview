import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createLifelinePosting } from './lifeline_posting.mjs';

const input = { billMonth: '0726', paidDate: '2026-10-16', reference: 'LF-101626', tellerAccounts: { office: '17' }, items: [{ database: 'office', source: 'regular', entry: 1 }] };
function live(entry = 1, overrides = {}) {
  return Object.values({ entry, account: '0001234567', name: 'Test consumer', month: '0726', paid: '', date: '', or: '', collector: '', total: 0, subsidy: -25.5, flag: 1, grid: 1, code: '000123', ...overrides }).join('\t');
}
function fixture(t, { records = live(), changed = '0\t1', fail = false } = {}) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('CREATE TABLE lifeline_paid_batch(batch_id TEXT PRIMARY KEY,bill_month TEXT,paid_date TEXT,reference TEXT,requested_count INTEGER,affected_count INTEGER,created_at TEXT,details TEXT)');
  const writes = [];
  const service = createLifelinePosting({ databases: [{ database: 'office', label: 'Office' }], auditDb: db, invalidate() {}, async sql(database, query) {
    assert.equal(database, 'office');
    if (query.startsWith('SELECT CAST(userid')) return '17\tteller\tTest Teller';
    if (query.startsWith('SELECT bh.Entry')) return records;
    if (query.startsWith('START TRANSACTION')) { writes.push(query); if (fail) throw new Error('connection lost'); return changed; }
    throw new Error('Unexpected SQL');
  } });
  return { service, db, writes };
}

test('preview classifies live bills and never updates them', async t => {
  const { service, writes } = fixture(t, { records: [live(), live(2, { paid: 'Y', or: 'EXISTING' }), live(3, { total: 20 }), live(4, { month: '0626' }), live(5, { grid: 0 })].join('\n') });
  const result = await service.preview({ ...input, items: [1, 2, 3, 4, 5, 6].map(entry => ({ database: 'office', source: 'regular', entry })) });
  assert.deepEqual(result.rows.map(row => row.status), ['ready', 'skipped', 'blocked', 'blocked', 'blocked', 'blocked']);
  assert.equal(result.readyCount, 1); assert.equal(result.skippedCount, 1); assert.equal(result.blockedCount, 4);
  assert.equal(result.rows[1].orCollection, 'EXISTING'); assert.equal(result.rows[0].newOr, input.reference);
  assert.equal(writes.length, 0);
});

test('invalid date, duplicate entries and unknown source cannot be previewed', async t => {
  const { service, writes } = fixture(t);
  await assert.rejects(service.preview({ ...input, paidDate: '2026-02-30' }), /valid/);
  await assert.rejects(service.preview({ ...input, items: [...input.items, ...input.items] }), /duplicate/);
  await assert.rejects(service.preview({ ...input, items: [{ ...input.items[0], source: '__proto__' }] }), /invalid/);
  assert.equal(writes.length, 0);
});

test('posting uses reviewed values, guards changed rows, and saves per-bill history', async t => {
  const { service, writes, db } = fixture(t, { records: [live(), live(2)].join('\n'), changed: '0\t1\n1\t0' });
  const preview = await service.preview({ ...input, items: [...input.items, { ...input.items[0], entry: 2 }] });
  const result = await service.execute(preview.token);
  assert.equal(result.affectedCount, 1); assert.equal(result.skippedCount, 1); assert.equal(result.failedCount, 0);
  assert.deepEqual(result.results.map(row => row.status), ['success', 'skipped']);
  assert.match(writes[0], /bh\.TotalBill=0/); assert.match(writes[0], /bh\.LifelineDiscSubs=-25\.5/);
  assert.match(writes[0], /bh\.ORCollection='LF-101626'/); assert.match(writes[0], /bh\.collector_code='17'/);
  assert.match(writes[0], /bh\.AccountNumber='0001234567'/);
  assert.equal(service.history().batches[0].results[1].status, 'skipped');
  assert.equal(db.prepare('SELECT affected_count FROM lifeline_paid_batch').get().affected_count, 1);
  await assert.rejects(service.execute(preview.token), /expired or was used/);
});

test('concurrent execution of one preview produces only one database batch', async t => {
  const { service, writes } = fixture(t);
  const { token } = await service.preview(input);
  const results = await Promise.allSettled([service.execute(token), service.execute(token)]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(writes.length, 1);
});

test('individual BAPA bills use their own history and master tables', async t => {
  const { service, writes } = fixture(t);
  const { token } = await service.preview({ ...input, items: [{ ...input.items[0], source: 'individual' }] });
  await service.execute(token);
  assert.match(writes[0], /UPDATE billhistory_bi bh INNER JOIN master_bi/);
});

test('database execution errors remain visible in the batch audit', async t => {
  const { service } = fixture(t, { fail: true });
  const { token } = await service.preview(input);
  const result = await service.execute(token);
  assert.equal(result.failedCount, 1); assert.equal(result.affectedCount, 0);
  assert.match(result.results[0].reason, /check live payment status/);
  assert.equal(service.history().batches[0].failedCount, 1);
});

test('older group-only batch audits remain readable', t => {
  const { service, db } = fixture(t);
  db.prepare('INSERT INTO lifeline_paid_batch VALUES(?,?,?,?,?,?,?,?)').run('OLD', '0726', '2026-10-16', 'OLD-OR', 3, 2, '2026-10-16T00:00:00Z', JSON.stringify({ results: [{ database: 'office', table: 'billhistory', affected: 2 }] }));
  const batch = service.history().batches[0];
  assert.equal(batch.legacy, true); assert.equal(batch.affectedCount, 2); assert.equal(batch.skippedCount, null);
});
