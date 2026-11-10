import { randomUUID } from 'node:crypto';

const quote = value => `'${String(value ?? '').replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
const parse = (output, keys) => String(output).trim().split(/\r?\n/).filter(Boolean).map(line => Object.fromEntries(line.split('\t').map((value, index) => [keys[index], value === 'NULL' ? '' : value])));
const sources = { regular: ['billhistory', 'master'], individual: ['billhistory_bi', 'master_bi'] };
const readyCount = rows => rows.filter(row => row.status === 'ready').length;

export function createLifelinePosting({ databases, sql, auditDb, invalidate }) {
  const previews = new Map();
  const offices = new Map(databases.map(office => [office.database, office]));

  function normalize(input) {
    const billMonth = String(input.billMonth ?? ''), paidDate = String(input.paidDate ?? ''), reference = String(input.reference ?? '').trim();
    const items = Array.isArray(input.items) ? input.items : [];
    if (!/^(0[1-9]|1[0-2])\d{2}$/.test(billMonth) || !/^\d{4}-\d{2}-\d{2}$/.test(paidDate) || !Number.isFinite(Date.parse(paidDate)) || new Date(paidDate).toISOString().slice(0, 10) !== paidDate || !/^[A-Za-z0-9._\/-]{1,80}$/.test(reference) || items.length < 1 || items.length > 5000) throw new Error('Choose a valid bill month, paid date, OR (up to 80 letters, numbers, period, underscore, slash or hyphen), and 1–5,000 records.');
    const seen = new Set();
    const normalized = items.map(item => {
      const database = String(item.database ?? ''), source = String(item.source ?? ''), entry = Number(item.entry), key = `${database}|${source}|${entry}`;
      if (!offices.has(database) || !Object.hasOwn(sources, source) || !Number.isSafeInteger(entry) || entry < 1 || seen.has(key)) throw new Error('The selection contains an invalid or duplicate billing record.');
      seen.add(key);
      return { database, source, entry, office: offices.get(database).label };
    });
    const tellerAccounts = Object.fromEntries([...new Set(normalized.map(item => item.database))].map(database => [database, String(input.tellerAccounts?.[database] ?? '').trim()]));
    if (Object.values(tellerAccounts).some(value => !/^[A-Za-z0-9_.-]{1,64}$/.test(value))) throw new Error('Select a teller account for every included office.');
    return { billMonth, paidDate, reference, tellerAccounts, items: normalized };
  }

  async function tellersFor(value) {
    const tellers = {};
    for (const [database, userid] of Object.entries(value.tellerAccounts)) {
      const rows = parse(await sql(database, `SELECT CAST(userid AS CHAR),COALESCE(username,''),COALESCE(fullname,'') FROM tblusers WHERE CAST(userid AS CHAR)=${quote(userid)} LIMIT 2`), ['userid', 'username', 'fullname']);
      if (rows.length !== 1) throw new Error(`The selected teller was not found exactly once in ${offices.get(database).label}.`);
      tellers[database] = rows[0];
    }
    return tellers;
  }

  function groupsFor(items) {
    const groups = new Map();
    for (const item of items) {
      const key = `${item.database}|${item.source}`, group = groups.get(key) ?? { database: item.database, source: item.source, items: [] };
      group.items.push(item); groups.set(key, group);
    }
    return [...groups.values()];
  }

  async function preview(input) {
    const value = normalize(input), tellers = await tellersFor(value), found = new Map();
    for (const group of groupsFor(value.items)) {
      const [history, master] = sources[group.source];
      const output = await sql(group.database, `SELECT bh.Entry,COALESCE(bh.AccountNumber,''),COALESCE(bh.Name,''),bh.BillMonth,COALESCE(bh.flag_paid,''),COALESCE(DATE_FORMAT(bh.date_paid,'%Y-%m-%d'),''),COALESCE(bh.ORCollection,''),COALESCE(CAST(bh.collector_code AS CHAR),''),bh.TotalBill,bh.LifelineDiscSubs,COALESCE(m.flagLifeline,0),COALESCE(bh.Grid,0),COALESCE(bh.Code,'') FROM ${history} bh LEFT JOIN ${master} m ON m.Code=bh.Code WHERE bh.Entry IN (${group.items.map(item => item.entry).join(',')})`);
      for (const row of parse(output, ['entry', 'accountNumber', 'name', 'billMonth', 'flagPaid', 'datePaid', 'orCollection', 'collectorCode', 'totalBill', 'lifelineDiscSubs', 'lifelineFlag', 'grid', 'code'])) {
        const key = `${group.database}|${group.source}|${row.entry}`;
        if (found.has(key)) throw new Error('A selected billing entry has multiple master matches. Resolve the duplicate before posting.');
        found.set(key, row);
      }
    }
    const rows = value.items.map(item => {
      const live = found.get(`${item.database}|${item.source}|${item.entry}`);
      let status = 'ready', reason = 'Ready to post';
      if (!live) { status = 'blocked'; reason = 'Billing entry not found'; }
      else if (live.billMonth !== value.billMonth) { status = 'blocked'; reason = 'Bill month differs from the selected batch'; }
      else if (live.flagPaid.trim().toUpperCase() === 'Y') { status = 'skipped'; reason = 'Already paid; existing payment will be kept'; }
      else if (!(Number(live.totalBill) === 0 && Number(live.lifelineDiscSubs) < 0 && [1, 2].includes(Number(live.lifelineFlag)) && Number(live.grid) !== 0)) { status = 'blocked'; reason = 'No longer an eligible zero-bill lifeline record'; }
      return { ...item, ...live, entry: item.entry, status, reason, newDate: value.paidDate, newOr: value.reference, teller: tellers[item.database] };
    });
    const now = Date.now();
    for (const [token, pending] of previews) if (pending.expiresAt <= now) previews.delete(token);
    if (previews.size >= 100) previews.delete(previews.keys().next().value);
    const token = randomUUID(), expiresAt = now + 10 * 60 * 1000;
    previews.set(token, { value, rows, expiresAt });
    return { token, expiresAt: new Date(expiresAt).toISOString(), billMonth: value.billMonth, paidDate: value.paidDate, reference: value.reference, requestedCount: rows.length, readyCount: readyCount(rows), skippedCount: rows.filter(row => row.status === 'skipped').length, blockedCount: rows.filter(row => row.status === 'blocked').length, rows };
  }

  async function execute(token) {
    const pending = previews.get(token);
    if (!pending || pending.expiresAt <= Date.now()) { previews.delete(token); throw new Error('The posting preview has expired or was used. Preview the selection again.'); }
    const { value, rows } = pending;
    if (!readyCount(rows)) throw new Error('The preview has no eligible records to post.');
    await tellersFor(value);
    // Consume before the first update so a double click cannot repeat this batch.
    if (previews.get(token) !== pending) throw new Error('This posting preview is already being executed.');
    previews.delete(token);
    const batchId = `LFP-${randomUUID()}`, createdAt = new Date().toISOString();
    const results = rows.map(row => ({ ...row, status: row.status === 'ready' ? 'failed' : row.status === 'blocked' ? 'failed' : row.status, reason: row.status === 'ready' ? 'Posting not completed' : row.reason, updated: 0 }));
    const audit = auditDb.prepare('INSERT INTO lifeline_paid_batch(batch_id,bill_month,paid_date,reference,requested_count,affected_count,created_at,details) VALUES(?,?,?,?,?,?,?,?)');
    audit.run(batchId, value.billMonth, value.paidDate, value.reference, rows.length, 0, createdAt, JSON.stringify({ status: 'posting', tellerAccounts: value.tellerAccounts, results }));
    for (const group of groupsFor(rows.filter(row => row.status === 'ready'))) {
      const [history, master] = sources[group.source], statements = ['START TRANSACTION;'];
      for (const row of group.items) {
        const index = rows.indexOf(row), teller = value.tellerAccounts[row.database];
        statements.push(`UPDATE ${history} bh INNER JOIN ${master} m ON m.Code=bh.Code SET bh.flag_paid='Y',bh.date_paid=${quote(value.paidDate)},bh.ORCollection=${quote(value.reference)},bh.collector_code=${quote(teller)} WHERE bh.Entry=${row.entry} AND bh.BillMonth=${quote(value.billMonth)} AND bh.AccountNumber=${quote(row.accountNumber)} AND bh.Code=${quote(row.code)} AND bh.TotalBill=0 AND bh.LifelineDiscSubs=${Number(row.lifelineDiscSubs)} AND bh.LifelineDiscSubs<0 AND m.flagLifeline=${Number(row.lifelineFlag)} AND m.flagLifeline IN (1,2) AND COALESCE(bh.Grid,0)<>0 AND UPPER(TRIM(COALESCE(bh.flag_paid,'')))<>'Y' AND COALESCE(DATE_FORMAT(bh.date_paid,'%Y-%m-%d'),'')=${quote(row.datePaid)} AND COALESCE(bh.ORCollection,'')=${quote(row.orCollection)} AND COALESCE(CAST(bh.collector_code AS CHAR),'')=${quote(row.collectorCode)};`);
        statements.push(`SELECT ${index},ROW_COUNT();`);
      }
      statements.push('COMMIT;');
      try {
        const changed = new Map(parse(await sql(group.database, statements.join('\n')), ['index', 'updated']).map(row => [Number(row.index), Number(row.updated)]));
        for (const row of group.items) {
          const index = rows.indexOf(row), updated = changed.get(index);
          results[index] = { ...results[index], updated: updated === 1 ? 1 : 0, status: updated === 1 ? 'success' : updated === 0 ? 'skipped' : 'failed', reason: updated === 1 ? 'Posted as paid' : updated === 0 ? 'Record changed or was paid after preview; no update made' : 'No confirmed update result; check the live bill before retrying' };
        }
      } catch (error) {
        for (const row of group.items) results[rows.indexOf(row)].reason = `Database execution failed; check live payment status before retrying. ${String(error.message).slice(0, 180)}`;
      }
    }
    const affectedCount = results.reduce((sum, row) => sum + row.updated, 0), failedCount = results.filter(row => row.status === 'failed').length, skippedCount = results.filter(row => row.status === 'skipped').length;
    let auditSaved = true;
    try { auditDb.prepare('UPDATE lifeline_paid_batch SET affected_count=?,details=? WHERE batch_id=?').run(affectedCount, JSON.stringify({ status: 'complete', tellerAccounts: value.tellerAccounts, results }), batchId); }
    catch (error) { auditSaved = false; console.error('Unable to finalize Lifeline posting audit:', error); }
    let cacheCleared = true;
    try { await invalidate(); } catch (error) { cacheCleared = false; console.error('Unable to clear Lifeline caches:', error); }
    return { ok: true, batchId, createdAt, billMonth: value.billMonth, paidDate: value.paidDate, reference: value.reference, requestedCount: rows.length, affectedCount, failedCount, skippedCount, auditSaved, cacheCleared, results };
  }

  function history() {
    return { batches: auditDb.prepare('SELECT * FROM lifeline_paid_batch ORDER BY created_at DESC LIMIT 30').all().map(row => {
      const details = JSON.parse(row.details), results = Array.isArray(details.results) ? details.results : [];
      const modern = details.status !== undefined;
      return { batchId: row.batch_id, createdAt: row.created_at, billMonth: row.bill_month, paidDate: row.paid_date, reference: row.reference, requestedCount: row.requested_count, affectedCount: row.affected_count, status: details.status ?? 'legacy', skippedCount: modern ? results.filter(item => item.status === 'skipped').length : null, failedCount: modern ? results.filter(item => item.status === 'failed').length : null, results, legacy: !modern };
    }) };
  }

  return { preview, execute, history };
}
