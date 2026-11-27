import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Db } from '../db/connection.js';
import { UUID_RE } from '../lib/ids.js';

export interface MirrorLogger {
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
}

const noopLog: MirrorLogger = { warn: () => undefined, info: () => undefined };
const TMP_RE = /\.tmp-[0-9a-f]{8,}$/;

/** Cleans a name so it can never escape its parent directory or hit a Windows-reserved name. */
export function safeSegment(name: string): string {
  let s = name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '');
  if (s === '' || s === '.' || s === '..') s = '_';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i.test(s)) s = '_' + s;
  return s.slice(0, 200);
}

export class Mirror {
  constructor(
    private db: Db,
    private dataDir: string,
    private log: MirrorLogger = noopLog,
  ) {}

  get companiesDir(): string {
    return path.join(this.dataDir, 'companies');
  }

  companyRoot(companyId: string): string {
    if (!UUID_RE.test(companyId)) throw new Error('invalid company id');
    return path.join(this.companiesDir, companyId, 'workspace');
  }

  companyDir(companyId: string): string {
    if (!UUID_RE.test(companyId)) throw new Error('invalid company id');
    return path.join(this.companiesDir, companyId);
  }

  /** Resolves segments below the company workspace and guarantees the result stays inside it. */
  resolve(companyId: string, segments: string[]): string {
    const root = this.companyRoot(companyId);
    const parts = segments.map(safeSegment);
    const abs = path.resolve(root, ...parts);
    if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('path escapes company root');
    return abs;
  }

  ensureCompany(companyId: string): void {
    fs.mkdirSync(this.companyRoot(companyId), { recursive: true });
  }

  removeCompany(companyId: string): void {
    this.safe('removeCompany', () => fs.rmSync(this.companyDir(companyId), { recursive: true, force: true }));
  }

  folderSegments(folderId: string | null): string[] {
    const segs: string[] = [];
    let cur = folderId;
    let guard = 0;
    while (cur && guard++ < 200) {
      const f = this.db.get<{ name: string; parent_id: string | null }>('SELECT name, parent_id FROM folders WHERE id = ?', cur);
      if (!f) break;
      segs.unshift(f.name);
      cur = f.parent_id;
    }
    return segs;
  }

  documentSegments(docId: string): string[] | null {
    const d = this.db.get<{ name: string; folder_id: string | null }>('SELECT name, folder_id FROM documents WHERE id = ?', docId);
    if (!d) return null;
    return [...this.folderSegments(d.folder_id), d.name];
  }

  displayPath(folderId: string | null, name: string): string {
    return [...this.folderSegments(folderId), name].join('/');
  }

  private safe(op: string, fn: () => void): boolean {
    try {
      fn();
      return true;
    } catch (err) {
      this.log.warn({ err, op }, 'mirror operation failed');
      return false;
    }
  }

  writeFileAtomic(abs: string, content: string): void {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp-${crypto.randomBytes(6).toString('hex')}`;
    try {
      fs.writeFileSync(tmp, content, 'utf8');
      try {
        fs.renameSync(tmp, abs);
      } catch {
        fs.writeFileSync(abs, content, 'utf8');
        fs.rmSync(tmp, { force: true });
      }
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw err;
    }
  }

  writeDocument(docId: string): void {
    this.safe('writeDocument', () => {
      const d = this.db.get<{ company_id: string; content: string }>('SELECT company_id, content FROM documents WHERE id = ?', docId);
      const segs = this.documentSegments(docId);
      if (!d || !segs) return;
      this.writeFileAtomic(this.resolve(d.company_id, segs), d.content);
    });
  }

  mkdirFolder(companyId: string, segments: string[]): void {
    this.safe('mkdirFolder', () => fs.mkdirSync(this.resolve(companyId, segments), { recursive: true }));
  }

  remove(companyId: string, segments: string[]): void {
    if (segments.length === 0) return;
    this.safe('remove', () => fs.rmSync(this.resolve(companyId, segments), { recursive: true, force: true }));
  }

  /** Renames/moves a file or folder; falls back to a full reconcile of the company if the disk drifted. */
  move(companyId: string, from: string[], to: string[]): void {
    if (from.length === 0 || to.length === 0) return;
    const ok = this.safe('move', () => {
      const src = this.resolve(companyId, from);
      const dst = this.resolve(companyId, to);
      if (src === dst) return;
      if (!fs.existsSync(src)) throw new Error('source missing');
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      const sameIgnoringCase = src.toLowerCase() === dst.toLowerCase();
      if (!sameIgnoringCase && fs.existsSync(dst)) throw new Error('destination exists');
      fs.renameSync(src, dst);
    });
    if (!ok) this.reconcileCompany(companyId);
  }

  /** Makes the disk tree equal to the database for one company (DB wins). */
  reconcileCompany(companyId: string): { removed: number; written: number } {
    const stats = { removed: 0, written: 0 };
    this.safe('reconcileCompany', () => {
      const root = this.companyRoot(companyId);
      fs.mkdirSync(root, { recursive: true });
      const folders = this.db.all<{ id: string; parent_id: string | null; name: string }>('SELECT id, parent_id, name FROM folders WHERE company_id = ?', companyId);
      const docs = this.db.all<{ id: string; folder_id: string | null; name: string; content: string }>(
        'SELECT id, folder_id, name, content FROM documents WHERE company_id = ?',
        companyId,
      );
      const byId = new Map(folders.map((f) => [f.id, f]));
      const folderRel = new Map<string, string[]>();
      const relOf = (id: string): string[] => {
        const cached = folderRel.get(id);
        if (cached) return cached;
        const f = byId.get(id)!;
        const r = [...(f.parent_id && byId.has(f.parent_id) ? relOf(f.parent_id) : []), safeSegment(f.name)];
        folderRel.set(id, r);
        return r;
      };
      const expectedDirs = new Set<string>();
      for (const f of folders) expectedDirs.add(relOf(f.id).join('/'));
      const expectedFiles = new Map<string, string>();
      for (const d of docs) {
        const rel = [...(d.folder_id && byId.has(d.folder_id) ? relOf(d.folder_id) : []), safeSegment(d.name)].join('/');
        expectedFiles.set(rel, d.content);
      }

      const walk = (abs: string, rel: string): void => {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(abs, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          const childRel = rel ? `${rel}/${e.name}` : e.name;
          const childAbs = path.join(abs, e.name);
          if (e.isDirectory() && expectedDirs.has(childRel)) walk(childAbs, childRel);
          else if (e.isFile() && expectedFiles.has(childRel) && !TMP_RE.test(e.name)) continue;
          else {
            fs.rmSync(childAbs, { recursive: true, force: true });
            stats.removed++;
          }
        }
      };
      walk(root, '');

      for (const rel of [...expectedDirs].sort()) fs.mkdirSync(path.join(root, ...rel.split('/')), { recursive: true });
      for (const [rel, content] of expectedFiles) {
        const abs = path.join(root, ...rel.split('/'));
        let same = false;
        try {
          same = fs.existsSync(abs) && fs.readFileSync(abs, 'utf8') === content;
        } catch {
          same = false;
        }
        if (!same) {
          this.writeFileAtomic(abs, content);
          stats.written++;
        }
      }
    });
    return stats;
  }

  reconcileAll(): void {
    const companies = this.db.all<{ id: string }>('SELECT id FROM companies');
    let removed = 0;
    let written = 0;
    for (const c of companies) {
      const r = this.reconcileCompany(c.id);
      removed += r.removed;
      written += r.written;
    }
    this.log.info({ companies: companies.length, removed, written }, 'workspace mirror reconciled');
  }
}
