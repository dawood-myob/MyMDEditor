import { unzipSync, zipSync, type Zippable } from 'fflate';
import type { AppContext } from '../../context.js';
import { errors } from '../../lib/errors.js';
import { newId, nowIso } from '../../lib/ids.js';
import { byteLength, DOC_EXT, nameKey, sanitizeImportSegment } from '../../lib/names.js';
import { safeSegment } from '../../storage/mirror.js';
import type { Actor } from '../../lib/models.js';
import { siblingNameTaken, uniqueName } from '../tree/siblings.js';
import type { DocumentService } from '../documents/service.js';
import type { TreeService } from '../tree/service.js';

export interface ImportFile {
  filename: string;
  data: Buffer;
}

interface PlannedDoc {
  dir: string[];
  name: string;
  content: string;
}

interface Plan {
  dirs: string[][];
  docs: PlannedDoc[];
  skipped: string[];
}

const MAX_SKIPPED_LISTED = 200;
const decoder = new TextDecoder('utf-8', { fatal: false });

function baseName(filename: string): string {
  const n = filename.replace(/\\/g, '/');
  return n.slice(n.lastIndexOf('/') + 1);
}

/** Returns path segments or throws for absolute/traversing paths (zip-slip). */
export function safeZipPath(name: string): string[] {
  if (name.includes('\0')) throw errors.validation('Archive contains an invalid entry name');
  const n = name.replace(/\\/g, '/');
  if (n.startsWith('/') || /^[A-Za-z]:/.test(n) || n.startsWith('//')) throw errors.validation('Archive contains an absolute path', { entry: name });
  const parts = n.split('/').filter((p) => p !== '' && p !== '.');
  if (parts.some((p) => p === '..')) throw errors.validation('Archive contains a path traversal entry', { entry: name });
  return parts;
}

function decodeText(data: Uint8Array): string | null {
  const text = decoder.decode(data).replace(/^\uFEFF/, '');
  return text.includes('\u0000') ? null : text;
}

export class ImportExportService {
  constructor(
    private ctx: AppContext,
    private tree: TreeService,
    private docs: DocumentService,
  ) {}

  // ---------------------------------------------------------------- import

  private planZip(data: Buffer, plan: Plan, label: string): void {
    const { quotas } = this.ctx.config;
    let entries = 0;
    let declaredTotal = 0;
    const wanted = new Map<string, string[]>();
    const skip = (n: string): void => {
      if (plan.skipped.length < MAX_SKIPPED_LISTED) plan.skipped.push(n);
    };
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), {
        filter: (f) => {
          if (++entries > quotas.maxZipEntries) throw errors.tooLarge(`Archive has more than ${quotas.maxZipEntries} entries`, { quota: 'zip_entries' });
          const segs = safeZipPath(f.name);
          const isDir = f.name.endsWith('/') || f.name.endsWith('\\');
          if (segs.length === 0) return false;
          if (isDir) {
            if (!segs.some((s) => s.startsWith('.') || s === '__MACOSX')) plan.dirs.push(segs.map((s) => sanitizeImportSegment(s, false)));
            return false;
          }
          const leaf = segs[segs.length - 1]!;
          const hidden = segs.some((s) => s.startsWith('.') || s === '__MACOSX');
          if (hidden || !leaf.toLowerCase().endsWith(DOC_EXT)) {
            skip(f.name);
            return false;
          }
          if (f.originalSize > quotas.maxDocBytes) {
            skip(`${f.name} (too large)`);
            return false;
          }
          declaredTotal += f.originalSize;
          if (declaredTotal > quotas.maxZipUncompressedBytes) throw errors.tooLarge('Archive is too large when uncompressed', { quota: 'zip_size' });
          wanted.set(f.name, segs);
          return true;
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AppError') throw err;
      throw errors.validation(`"${label}" is not a valid zip archive`);
    }
    for (const [name, segs] of wanted) {
      const data = files[name];
      if (!data) continue;
      const text = decodeText(data);
      if (text === null) {
        skip(`${name} (binary)`);
        continue;
      }
      plan.docs.push({
        dir: segs.slice(0, -1).map((s) => sanitizeImportSegment(s, false)),
        name: sanitizeImportSegment(segs[segs.length - 1]!, true),
        content: text,
      });
    }
  }

  async importFiles(companyId: string, actor: Actor, folderId: string | null, files: ImportFile[]): Promise<{ imported: { folders: number; documents: number }; skipped: string[] }> {
    const { db, config, mirror, bus } = this.ctx;
    if (folderId) this.tree.requireFolder(companyId, folderId);
    if (files.length === 0) throw errors.validation('No files uploaded (use multipart field "files")');
    const plan: Plan = { dirs: [], docs: [], skipped: [] };
    for (const f of files) {
      const lower = f.filename.toLowerCase();
      if (lower.endsWith('.zip')) this.planZip(f.data, plan, f.filename);
      else if (lower.endsWith(DOC_EXT)) {
        if (f.data.length > config.quotas.maxDocBytes) {
          plan.skipped.push(`${f.filename} (too large)`);
          continue;
        }
        const text = decodeText(f.data);
        if (text === null) plan.skipped.push(`${f.filename} (binary)`);
        else plan.docs.push({ dir: [], name: sanitizeImportSegment(baseName(f.filename), true), content: text });
      } else plan.skipped.push(f.filename);
    }

    const createdFolders: string[] = [];
    const createdDocs: string[] = [];
    const taken = new Set<string>();
    const folderCache = new Map<string, string>();
    let storage = this.docs.storageUsed(companyId);

    db.tx(() => {
      const ensureChain = (segs: string[]): string | null => {
        let parent: string | null = folderId;
        for (const seg of segs) {
          const cacheKey = `${parent ?? ''}|${nameKey(seg)}`;
          const cached = folderCache.get(cacheKey);
          if (cached) {
            parent = cached;
            continue;
          }
          const existing: { id: string } | undefined = db.get<{ id: string }>('SELECT id FROM folders WHERE company_id = ? AND parent_id IS ? AND name_key = ?', companyId, parent, nameKey(seg));
          let id: string;
          if (existing) id = existing.id;
          else {
            const count = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM folders WHERE company_id = ?', companyId)!.n;
            if (count >= config.quotas.maxFolders) throw errors.tooLarge('Folder quota exceeded', { quota: 'folders' });
            if (this.tree.folderDepth(parent) + 1 > config.quotas.maxFolderDepth) throw errors.validation(`Folders can be nested at most ${config.quotas.maxFolderDepth} levels deep`);
            const name = siblingNameTaken(db, companyId, parent, nameKey(seg)) ? uniqueName(db, companyId, parent, seg, '', nameKey) : seg;
            id = newId();
            const ts = nowIso();
            db.run('INSERT INTO folders (id, company_id, parent_id, name, name_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, companyId, parent, name, nameKey(name), ts, ts);
            createdFolders.push(id);
          }
          folderCache.set(cacheKey, id);
          parent = id;
        }
        return parent;
      };

      for (const dir of plan.dirs) ensureChain(dir);
      for (const d of plan.docs) {
        const parent = ensureChain(d.dir);
        const count = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM documents WHERE company_id = ?', companyId)!.n;
        if (count >= config.quotas.maxDocuments) throw errors.tooLarge('Document quota exceeded', { quota: 'documents' });
        const size = byteLength(d.content);
        storage += size;
        if (storage > config.quotas.maxCompanyStorageBytes) throw errors.tooLarge('Company storage quota exceeded', { quota: 'storage' });
        const name = uniqueName(db, companyId, parent, d.name, DOC_EXT, nameKey, taken);
        const id = newId();
        const ts = nowIso();
        db.run(
          'INSERT INTO documents (id, company_id, folder_id, name, name_key, content, size, created_at, updated_at, updated_by, updated_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          id,
          companyId,
          parent,
          name,
          nameKey(name),
          d.content,
          size,
          ts,
          ts,
          actor.id,
          actor.name,
        );
        this.ctx.versions.create(companyId, id, d.content, { kind: 'import', author: actor });
        createdDocs.push(id);
      }
    });

    for (const f of createdFolders) mirror.mkdirFolder(companyId, mirror.folderSegments(f));
    for (const d of createdDocs) mirror.writeDocument(d);
    if (createdFolders.length || createdDocs.length) bus.emit(companyId, 'tree');
    return { imported: { folders: createdFolders.length, documents: createdDocs.length }, skipped: plan.skipped };
  }

  // ---------------------------------------------------------------- export

  /** ZIP of the whole workspace (folderId null) or of one folder subtree (folder included as top directory). */
  exportZip(companyId: string, folderId: string | null): { filename: string; data: Buffer } {
    const { db, rooms } = this.ctx;
    const folders = db.all<{ id: string; parent_id: string | null; name: string }>('SELECT id, parent_id, name FROM folders WHERE company_id = ?', companyId);
    const docs = db.all<{ id: string; folder_id: string | null; name: string; content: string }>('SELECT id, folder_id, name, content FROM documents WHERE company_id = ?', companyId);
    const byId = new Map(folders.map((f) => [f.id, f]));
    let rootName = '';
    let inScope: (id: string | null) => boolean = () => true;
    if (folderId) {
      const root = this.tree.requireFolder(companyId, folderId);
      rootName = safeSegment(root.name);
      const scope = new Set(this.tree.subtreeFolderIds(companyId, folderId));
      inScope = (id) => !!id && scope.has(id);
    }
    const pathOf = (id: string | null): string[] => {
      const segs: string[] = [];
      let cur = id;
      let guard = 0;
      while (cur && guard++ < 200) {
        const f = byId.get(cur);
        if (!f) break;
        segs.unshift(safeSegment(f.name));
        if (folderId && cur === folderId) break;
        cur = f.parent_id;
      }
      return segs;
    };
    const files: Zippable = {};
    const mtime = new Date();
    for (const f of folders) {
      if (!inScope(f.id)) continue;
      files[`${pathOf(f.id).join('/')}/`] = [new Uint8Array(0), { level: 0, mtime }];
    }
    for (const d of docs) {
      if (!inScope(d.folder_id)) continue;
      const content = rooms.liveContent(d.id) ?? d.content;
      files[[...pathOf(d.folder_id), safeSegment(d.name)].join('/')] = [new TextEncoder().encode(content), { level: 6, mtime }];
    }
    const company = db.get<{ slug: string }>('SELECT slug FROM companies WHERE id = ?', companyId);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = folderId ? `${rootName}.zip` : `${company?.slug ?? 'workspace'}-workspace-${stamp}.zip`;
    return { filename, data: Buffer.from(zipSync(files)) };
  }
}
