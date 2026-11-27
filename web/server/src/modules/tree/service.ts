import type { AppContext } from '../../context.js';
import { errors } from '../../lib/errors.js';
import { newId, nowIso } from '../../lib/ids.js';
import { nameKey, validateFolderName } from '../../lib/names.js';
import { toDocMeta, toFolder, DOC_META_COLS, type DocumentMeta, type Folder, type FolderRow } from '../../lib/models.js';
import { assertNameFree } from './siblings.js';

export class TreeService {
  constructor(private ctx: AppContext) {}

  tree(companyId: string): { folders: Folder[]; documents: DocumentMeta[] } {
    const { db } = this.ctx;
    const folders = db.all<FolderRow>('SELECT * FROM folders WHERE company_id = ? ORDER BY name_key', companyId).map(toFolder);
    const documents = db
      .all<Parameters<typeof toDocMeta>[0]>(`SELECT ${DOC_META_COLS} FROM documents WHERE company_id = ? ORDER BY name_key`, companyId)
      .map(toDocMeta);
    return { folders, documents };
  }

  requireFolder(companyId: string, id: string): FolderRow {
    const f = this.ctx.db.get<FolderRow>('SELECT * FROM folders WHERE id = ? AND company_id = ?', id, companyId);
    if (!f) throw errors.notFound('Folder not found');
    return f;
  }

  folderDepth(folderId: string | null): number {
    return this.ctx.mirror.folderSegments(folderId).length;
  }

  private subtreeHeight(folderId: string): number {
    const r = this.ctx.db.get<{ h: number | null }>(
      `WITH RECURSIVE sub(id, lvl) AS (
         SELECT id, 0 FROM folders WHERE id = ?
         UNION ALL SELECT f.id, s.lvl + 1 FROM folders f JOIN sub s ON f.parent_id = s.id)
       SELECT MAX(lvl) AS h FROM sub`,
      folderId,
    );
    return r?.h ?? 0;
  }

  subtreeFolderIds(companyId: string, folderId: string): string[] {
    return this.ctx.db
      .all<{ id: string }>(
        `WITH RECURSIVE sub(id) AS (
           SELECT id FROM folders WHERE id = ? AND company_id = ?
           UNION ALL SELECT f.id FROM folders f JOIN sub s ON f.parent_id = s.id)
         SELECT id FROM sub`,
        folderId,
        companyId,
      )
      .map((r) => r.id);
  }

  subtreeDocumentIds(companyId: string, folderId: string): string[] {
    return this.ctx.db
      .all<{ id: string }>(
        `WITH RECURSIVE sub(id) AS (
           SELECT id FROM folders WHERE id = ? AND company_id = ?
           UNION ALL SELECT f.id FROM folders f JOIN sub s ON f.parent_id = s.id)
         SELECT d.id FROM documents d WHERE d.folder_id IN (SELECT id FROM sub)`,
        folderId,
        companyId,
      )
      .map((r) => r.id);
  }

  createFolder(companyId: string, input: { parentId: string | null; name: string }): Folder {
    const { db, config, mirror, bus } = this.ctx;
    const name = validateFolderName(input.name);
    const parentId = input.parentId;
    if (parentId) this.requireFolder(companyId, parentId);
    if (this.folderDepth(parentId) + 1 > config.quotas.maxFolderDepth) {
      throw errors.validation(`Folders can be nested at most ${config.quotas.maxFolderDepth} levels deep`);
    }
    const id = newId();
    const ts = nowIso();
    db.tx(() => {
      const count = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM folders WHERE company_id = ?', companyId)!.n;
      if (count >= config.quotas.maxFolders) throw errors.tooLarge('Folder quota exceeded', { quota: 'folders' });
      assertNameFree(db, companyId, parentId, nameKey(name), name);
      db.run('INSERT INTO folders (id, company_id, parent_id, name, name_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, companyId, parentId, name, nameKey(name), ts, ts);
    });
    mirror.mkdirFolder(companyId, mirror.folderSegments(id));
    bus.emit(companyId, 'tree');
    return { id, parentId, name, createdAt: ts };
  }

  updateFolder(companyId: string, id: string, input: { name?: string; parentId?: string | null }): Folder {
    const { db, config, mirror, bus } = this.ctx;
    const current = this.requireFolder(companyId, id);
    const name = input.name !== undefined ? validateFolderName(input.name) : current.name;
    const parentId = input.parentId !== undefined ? input.parentId : current.parent_id;
    if (name === current.name && parentId === current.parent_id) return toFolder(current);
    if (parentId !== current.parent_id && parentId) {
      this.requireFolder(companyId, parentId);
      if (this.subtreeFolderIds(companyId, id).includes(parentId)) {
        throw errors.conflict('A folder cannot be moved into itself or one of its descendants');
      }
      if (this.folderDepth(parentId) + 1 + this.subtreeHeight(id) > config.quotas.maxFolderDepth) {
        throw errors.validation(`Folders can be nested at most ${config.quotas.maxFolderDepth} levels deep`);
      }
    }
    const from = mirror.folderSegments(id);
    db.tx(() => {
      assertNameFree(db, companyId, parentId, nameKey(name), name, { folderId: id });
      db.run('UPDATE folders SET name = ?, name_key = ?, parent_id = ?, updated_at = ? WHERE id = ?', name, nameKey(name), parentId, nowIso(), id);
    });
    mirror.move(companyId, from, mirror.folderSegments(id));
    bus.emit(companyId, 'tree');
    return toFolder(this.requireFolder(companyId, id));
  }

  deleteFolder(companyId: string, id: string): void {
    const { db, mirror, rooms, bus } = this.ctx;
    this.requireFolder(companyId, id);
    const docIds = this.subtreeDocumentIds(companyId, id);
    const segs = mirror.folderSegments(id);
    db.tx(() => {
      db.run('DELETE FROM folders WHERE id = ? AND company_id = ?', id, companyId);
    });
    for (const d of docIds) rooms.closeDocument(d, 4404);
    mirror.remove(companyId, segs);
    bus.emit(companyId, 'tree');
  }
}
