import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const settings = JSON.parse(await fs.readFile(path.join(root, 'connection.settings.json'), 'utf8'));
const database = 'queryviews';
const tables = ['billhistory', 'billhistory_bi', 'billhistory_bm'];

if (!settings.host || !settings.user) throw new Error('The primary MySQL connection is not configured.');
const quoteId = value => `\`${String(value).replaceAll('`', '``')}\``;
const sql = [];

for (const table of tables) {
  for (const suffix of ['latebill', 'adjustment']) {
    const replicaTable = `${table}_${suffix}`;
    sql.push(`CREATE TABLE IF NOT EXISTS ${quoteId(database)}.${quoteId(replicaTable)} LIKE ${quoteId(database)}.${quoteId(table)};`);
  }
}

sql.push(`CREATE TABLE IF NOT EXISTS ${quoteId(database)}.${quoteId('replication_months')} (
  source_database VARCHAR(64) NOT NULL,
  source_table VARCHAR(64) NOT NULL,
  bill_month VARCHAR(4) NOT NULL,
  completed_at DATETIME NOT NULL,
  records_replicated BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (source_database, source_table, bill_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;`);

const adjustmentColumns = [
  ['live_TotalBill', 'DOUBLE NULL'],
  ['adjustment_amount', 'DOUBLE NULL'],
  ['diff_fields', 'TEXT NULL']
];
for (const table of tables) {
  const replicaTable = `${table}_adjustment`;
  for (const [column, type] of adjustmentColumns) {
    const check = `SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='${database}' AND table_name='${replicaTable}' AND column_name='${column}';`;
    const result = spawnSync(settings.executable || 'mysql', [
      '-h', settings.host, '-P', String(settings.port || 3306), '-u', settings.user,
      '-N', '-B'
    ], {
      input: check,
      encoding: 'utf8',
      env: { ...process.env, MYSQL_PWD: settings.password || '' },
      timeout: 30000
    });
    if (result.error || result.status !== 0) {
      throw new Error(String(result.stderr || result.error?.message || `Unable to inspect ${replicaTable}.`).trim());
    }
    if (Number(result.stdout.trim()) === 0) {
      sql.push(`ALTER TABLE ${quoteId(database)}.${quoteId(replicaTable)} ADD COLUMN ${quoteId(column)} ${type};`);
    }
  }
}

const result = spawnSync(settings.executable || 'mysql', [
  '-h', settings.host, '-P', String(settings.port || 3306), '-u', settings.user,
  '-N', '-B'
], {
  input: sql.join('\n'),
  encoding: 'utf8',
  env: { ...process.env, MYSQL_PWD: settings.password || '' },
  timeout: 120000
});
if (result.error || result.status !== 0) {
  throw new Error(String(result.stderr || result.error?.message || 'QueryViews BillHistory table setup failed.').trim());
}

console.log(JSON.stringify({
  ok: true,
  host: settings.host,
  database,
  createdTables: tables.flatMap(table => [`${table}_latebill`, `${table}_adjustment`]),
  trackingTable: 'replication_months',
  adjustmentColumns: adjustmentColumns.map(([column]) => column)
}, null, 2));
