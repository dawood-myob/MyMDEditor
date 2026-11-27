import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Zip, ZipDeflate } from 'fflate';

export interface BackupResult {
  dir: string;
  database: string;
  archive: string;
}

const stamp = (): string => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');

function* walk(dir: string, rel = ''): Generator<{ abs: string; rel: string }> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(abs, r);
    else if (e.isFile() && !e.name.startsWith('.tmp-')) yield { abs, rel: r };
  }
}

/** Streams a directory into a zip file without holding the whole archive in memory. */
function zipDirectory(sourceDir: string, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(target);
    out.on('error', reject);
    out.on('close', () => resolve());
    const zip = new Zip((err, chunk, final) => {
      if (err) return reject(err);
      out.write(chunk);
      if (final) out.end();
    });
    try {
      if (fs.existsSync(sourceDir)) {
        for (const f of walk(sourceDir)) {
          const entry = new ZipDeflate(f.rel, { level: 6 });
          zip.add(entry);
          entry.push(fs.readFileSync(f.abs), true);
        }
      }
      zip.end();
    } catch (e) {
      reject(e);
    }
  });
}

/** Consistent online backup: SQLite via VACUUM INTO plus a zip of the companies mirror. */
export async function runBackup(dataDir: string): Promise<BackupResult> {
  const dbFile = path.join(dataDir, 'mdhub.sqlite');
  if (!fs.existsSync(dbFile)) throw new Error(`Database not found: ${dbFile}`);
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const ts = stamp();
  const database = path.join(dir, `mdhub-${ts}.sqlite`);
  const archive = path.join(dir, `companies-${ts}.zip`);

  const db = new DatabaseSync(dbFile);
  try {
    db.exec('PRAGMA busy_timeout = 10000');
    db.exec(`VACUUM INTO '${database.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }
  await zipDirectory(path.join(dataDir, 'companies'), archive);
  return { dir, database, archive };
}
