import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const maxBytes = 512 * 1024 * 1024;
const knownTables = ['reading', 'reading_pay', 'billhistory', 'billhistory_bm', 'billhistory_bi', 'billhistory_net', 'billhistory_arrears'];

export function inspectFubcsDatabase(filePath) {
  let source;
  try {
    source = new DatabaseSync(filePath, { readOnly: true });
    const result = source.prepare('PRAGMA quick_check').get();
    if (Object.values(result)[0] !== 'ok') throw new Error('SQLite integrity check failed.');
    const tables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    if (!tables.has('reading') || !knownTables.slice(2).some(name => tables.has(name))) throw new Error('This is not a FUBCS transfer database: reading and billhistory tables are required.');
    const counts = Object.fromEntries(knownTables.filter(name => tables.has(name)).map(name => [name, Number(source.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count)]));
    return { integrity: 'ok', userVersion: Number(source.prepare('PRAGMA user_version').get().user_version), counts, tableCount: tables.size };
  } finally { source?.close(); }
}

export function createMobileTransferStore(database) {
  database.exec('CREATE TABLE IF NOT EXISTS mobile_transfer_file (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, source TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, summary_json TEXT NOT NULL)');
  return {
    list() { return database.prepare('SELECT id,created_at,source,size_bytes,sha256,summary_json FROM mobile_transfer_file ORDER BY created_at DESC LIMIT 30').all().map(row => ({ id: row.id, createdAt: row.created_at, source: row.source, sizeBytes: row.size_bytes, sha256: row.sha256, summary: JSON.parse(row.summary_json) })); },
    get(id) { if (!/^[0-9a-f-]{36}$/.test(id)) return null; const row = database.prepare('SELECT id,created_at,source,size_bytes,sha256,summary_json FROM mobile_transfer_file WHERE id=?').get(id); return row ? { id: row.id, createdAt: row.created_at, source: row.source, sizeBytes: row.size_bytes, sha256: row.sha256, summary: JSON.parse(row.summary_json) } : null; },
    async receive(readable, folder, source = 'browser upload') {
      await fs.mkdir(folder, { recursive: true });
      const id = randomUUID(), temp = path.join(folder, `${id}.part`), final = path.join(folder, `${id}.db`), hash = createHash('sha256');
      let handle, sizeBytes = 0, renamed = false;
      try {
        handle = await fs.open(temp, 'wx');
        for await (const chunk of readable) {
          sizeBytes += chunk.length;
          if (sizeBytes > maxBytes) throw new Error('database.db exceeds the 512 MB transfer limit.');
          hash.update(chunk);
          await handle.writeFile(chunk);
        }
        await handle.close(); handle = null;
        if (sizeBytes < 100) throw new Error('The selected file is empty or incomplete.');
        const summary = inspectFubcsDatabase(temp), sha256 = hash.digest('hex'), createdAt = new Date().toISOString();
        await fs.rename(temp, final); renamed = true;
        database.prepare('INSERT INTO mobile_transfer_file(id,created_at,source,size_bytes,sha256,summary_json) VALUES(?,?,?,?,?,?)').run(id, createdAt, source, sizeBytes, sha256, JSON.stringify(summary));
        return { id, createdAt, source, sizeBytes, sha256, summary };
      } catch (error) {
        if (handle) await handle.close().catch(() => {});
        await fs.unlink(renamed ? final : temp).catch(() => {});
        throw error;
      }
    },
  };
}
