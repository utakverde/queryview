import fs from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sqlModule from 'mssql';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const settings = JSON.parse(await fs.readFile(path.join(rootDir, 'connection.settings.json'), 'utf8'));
const source = settings.sqlServer;
const target = settings.membershipReplica;
if (!source?.enabled || !target?.enabled) throw new Error('Enable the SQL Server and Membership replica connections first.');
const sourceDb = source.databases.find(item => item.database.toLowerCase() === 'membership')?.database;
if (!sourceDb) throw new Error('The configured SQL Server database named Membership was not found.');
const quoteId = value => `\`${String(value).replaceAll('`', '``')}\``;
const targetTable = 'payment_membership_replica';
const quoteSqlServer = value => `[${String(value).replaceAll(']', ']]')}]`;
const typeToMysql = column => {
  const type = column.DATA_TYPE.toLowerCase();
  if (type === 'int') return 'INT';
  if (type === 'numeric' || type === 'decimal' || type === 'money') return `DECIMAL(${column.NUMERIC_PRECISION || 19},${column.NUMERIC_SCALE || 0})`;
  if (type === 'date') return 'DATE';
  if (type === 'datetime' || type === 'datetime2' || type === 'smalldatetime') return 'DATETIME(3)';
  if (type === 'image' || type === 'varbinary' || type === 'binary') return 'LONGBLOB';
  if (type === 'varchar' || type === 'nvarchar' || type === 'char' || type === 'nchar') {
    const length = Number(column.CHARACTER_MAXIMUM_LENGTH);
    return !Number.isFinite(length) || length < 1 || length > 16000 ? 'TEXT' : `VARCHAR(${length})`;
  }
  throw new Error(`Unsupported MembershipDetails SQL Server type: ${column.DATA_TYPE}`);
};

const sql = sqlModule.default ?? sqlModule;
const pool = await new sql.ConnectionPool({
  server: source.host,
  ...(!source.instanceName ? { port: Number(source.port || 1433) } : {}),
  user: source.user,
  password: source.password,
  database: sourceDb,
  connectionTimeout: 15000,
  requestTimeout: 0,
  options: { encrypt: source.encrypt === true, trustServerCertificate: true, ...(source.instanceName ? { instanceName: source.instanceName } : {}) }
}).connect();

let mysqlEnv = { ...process.env, MYSQL_PWD: target.password || '' };
function mysqlCli(input) {
  const result = spawnSync('mysql', ['-h', target.host, '-P', String(target.port || 3306), '-u', target.user, '-D', target.database, '-N', '-B'], {
    input, encoding: 'utf8', env: mysqlEnv, maxBuffer: 16 * 1024 * 1024, timeout: 120000
  });
  if (result.error || result.status !== 0) throw new Error(String(result.stderr || result.error?.message || 'MySQL command failed.').slice(0, 1000));
  return result.stdout.trim();
}
function mysqlAdmin(input) {
  const result = spawnSync('sudo', ['mysql', '--protocol=socket', '-uroot', '-N', '-B'], { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error(String(result.stderr || result.error?.message || 'MySQL schema setup failed.').slice(0, 1000));
}
function sqlValue(value, column, dateOnlyColumns) {
  if (value == null) return 'NULL';
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`;
  if (value instanceof Date) {
    const iso = value.toISOString();
    return dateOnlyColumns.has(column)
      ? `'${iso.slice(0, 10)}'` : `'${iso.slice(0, 23).replace('T', ' ')}'`;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  const bytes = Buffer.from(String(value), 'utf8').toString('hex');
  return `CONVERT(X'${bytes}' USING utf8mb4)`;
}

try {
  const meta = await pool.request().query("SELECT COLUMN_NAME,DATA_TYPE,IS_NULLABLE,CHARACTER_MAXIMUM_LENGTH,NUMERIC_PRECISION,NUMERIC_SCALE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='MembershipDetails' ORDER BY ORDINAL_POSITION");
  const detailColumns = meta.recordset;
  if (!detailColumns.some(column => column.COLUMN_NAME === 'ApplyID')) throw new Error('MembershipDetails is missing ApplyID.');
  const detailOnly = detailColumns.filter(column => column.COLUMN_NAME.toLowerCase() !== 'applyid');
  const paymentColumns = [
    { name: 'ApplyID', type: 'INT NULL' },
    { name: 'SDeposit', type: 'DECIMAL(19,4) NULL' },
    { name: 'SDepositDate', type: 'DATE NULL' },
    { name: 'SDepositOR', type: 'VARCHAR(50) NULL' },
    { name: 'DetailApplyID', type: 'INT NULL' }
  ];
  const allColumns = [...paymentColumns.map(column => ({ name: column.name, ddl: column.type })), ...detailOnly.map(column => ({ name: column.COLUMN_NAME, ddl: `${typeToMysql(column)}${column.IS_NULLABLE === 'YES' ? ' NULL' : ' NOT NULL'}` }))];
  const createSql = `CREATE TABLE IF NOT EXISTS ${quoteId(targetTable)} (\n  replica_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,\n  ${allColumns.map(column => `${quoteId(column.name)} ${column.ddl}`).join(',\n  ')},\n  source VARCHAR(32) NOT NULL DEFAULT 'main',\n  INDEX idx_payment_membership_apply_id (ApplyID),\n  INDEX idx_payment_membership_deposit_date (SDepositDate)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`;
  mysqlAdmin(`USE ${quoteId(target.database)};\n${createSql}\n`);
  const targetColumns = allColumns.map(column => column.name);
  mysqlCli(`DELETE FROM ${quoteId(targetTable)};`);

  const selectDetails = detailColumns.map(column => `m.${quoteSqlServer(column.COLUMN_NAME)} AS ${quoteSqlServer(`detail_${column.COLUMN_NAME}`)}`).join(',');
  const query = `SELECT p.ApplyID AS PaymentApplyID,p.SDeposit,p.SDepositDate,p.SDepositOR,${selectDetails} FROM dbo.Payments p LEFT JOIN dbo.MembershipDetails m ON p.ApplyID=m.ApplyID ORDER BY p.ApplyID`;
  const insertPrefix = `INSERT INTO ${quoteId(targetTable)} (${targetColumns.map(quoteId).join(',')}) VALUES `;
  const child = spawn('mysql', ['-h', target.host, '-P', String(target.port || 3306), '-u', target.user, '-D', target.database, '-N', '-B'], { env: mysqlEnv, stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 8000) stderr = stderr.slice(-8000); });
  const childExit = new Promise((resolve, reject) => child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.slice(-1000) || `MySQL insert process exited with ${code}.`))));
  const request = pool.request();
  request.stream = true;
  let rows = 0, batch = [], streamError;
  function flush() {
    if (!batch.length) return true;
    const statement = `${insertPrefix}${batch.join(',')} ;\n`;
    batch = [];
    return child.stdin.write(statement);
  }
  const dateOnlyColumns = new Set(['SDepositDate', ...detailColumns.filter(column => column.DATA_TYPE.toLowerCase() === 'date').map(column => column.COLUMN_NAME)]);
  request.on('row', row => {
    if (streamError) return;
    try {
      const detailApply = detailColumns.find(column => column.COLUMN_NAME.toLowerCase() === 'applyid');
      const values = [row.PaymentApplyID, row.SDeposit, row.SDepositDate, row.SDepositOR, detailApply ? row[`detail_${detailApply.COLUMN_NAME}`] : null,
        ...detailOnly.map(column => row[`detail_${column.COLUMN_NAME}`])];
      const valueSql = values.map((value, index) => sqlValue(value, allColumns[index].name, dateOnlyColumns));
      batch.push(`(${valueSql.join(',')})`);
      rows++;
      if (batch.length >= 50 && !flush()) {
        request.pause();
        child.stdin.once('drain', () => request.resume());
      }
    } catch (error) { streamError = error; request.cancel(); child.kill(); }
  });
  request.on('error', error => { streamError = error; child.kill(); });
  const requestDone = new Promise((resolve, reject) => request.on('done', () => {
    try { if (streamError) throw streamError; flush(); child.stdin.end(); resolve(); }
    catch (error) { child.kill(); reject(error); }
  }));
  request.query(query);
  await requestDone;
  await childExit;
  const verified = mysqlCli(`SELECT COUNT(*) FROM ${quoteId(targetTable)}; SELECT COUNT(*) FROM ${quoteId(targetTable)} WHERE source='main';`)
    .split(/\r?\n/).map(value => Number(value));
  if (verified[0] !== rows || verified[1] !== rows) throw new Error(`Row verification failed: streamed ${rows}, MySQL counts ${verified.join(', ')}.`);
  console.log(JSON.stringify({ ok: true, database: target.database, table: targetTable, sourceDefault: 'main', rows: verified[0], columns: allColumns.length + 2 }));
} finally {
  await pool.close();
}
