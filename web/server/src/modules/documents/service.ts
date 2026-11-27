import type { AppContext } from '../../context.js';
import { errors } from '../../lib/errors.js';
import { newId, nowIso } from '../../lib/ids.js';
import { byteLength, nameKey, validateDocumentName } from '../../lib/names.js';
import { toDocMeta, type Actor, type DocumentFull, type DocumentRow } from '../../lib/models.js';
import { assertNameFree } from '../tree/siblings.js';

export class DocumentService {
  constructor(private ctx: AppContext) {}

  requireRow(companyId: string, id: string): DocumentRow {
    const d = this.ctx.db.get<DocumentRow>('SELECT * FROM documents WHERE id = ? AND company_id = ?', id, companyId);
    if (!d) throw errors.notFound('Document not found');
    return d;
  }

  private requireFolder(companyId: string, folderId: string | null): void {
    if (!folderId) return;
    if (!this.ctx.db.get('SELECT 1 AS x FROM folders WHERE id = ? AND company_id = ?', folderId, companyId)) throw errors.notFound('Folder not found');
  }

  toFull(row: DocumentRow): DocumentFull {
    const live = this.ctx.rooms.liveContent(row.id);
    const content = live ?? row.content;
    return {
      ...toDocMeta(row),
      size: live === undefined ? row.size : byteLength(content),
      path: this.ctx.mirror.displayPath(row.folder_id, row.name),
      content,
    };
  }

  get(companyId: string, id: string): DocumentFull {
    return this.toFull(this.requireRow(companyId, id));
  }

  storageUsed(companyId: string): number {
    return this.ctx.db.get<{ n: number | null }>('SELECT SUM(size) AS n FROM documents WHERE company_id = ?', companyId)?.n ?? 0;
  }

  assertContentAllowed(companyId: string, content: string, replacingBytes = 0): number {
    const { quotas } = this.ctx.config;
    const bytes = byteLength(content);
    if (bytes > quotas.maxDocBytes) throw errors.tooLarge(`Document exceeds ${Math.floor(quotas.maxDocBytes / 1024 / 1024)} MB limit`, { quota: 'document_size' });
    if (this.storageUsed(companyId) - replacingBytes + bytes > quotas.maxCompanyStorageBytes) {
      throw errors.tooLarge('Company storage quota exceeded', { quota: 'storage' });
    }
    return bytes;
  }

  create(companyId: string, actor: Actor, input: { folderId: string | null; name: string; content?: string }): DocumentFull {
    const { db, config, mirror, bus } = this.ctx;
    const name = validateDocumentName(input.name);
    const content = input.content ?? '';
    this.requireFolder(companyId, input.folderId);
    const size = this.assertContentAllowed(companyId, content);
    const id = newId();
    const ts = nowIso();
    db.tx(() => {
      const count = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM documents WHERE company_id = ?', companyId)!.n;
      if (count >= config.quotas.maxDocuments) throw errors.tooLarge('Document quota exceeded', { quota: 'documents' });
      assertNameFree(db, companyId, input.folderId, nameKey(name), name);
      db.run(
        'INSERT INTO documents (id, company_id, folder_id, name, name_key, content, size, created_at, updated_at, updated_by, updated_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        companyId,
        input.folderId,
        name,
        nameKey(name),
        content,
        size,
        ts,
        ts,
        actor.id,
        actor.name,
      );
    });
    mirror.writeDocument(id);
    bus.emit(companyId, 'tree');
    return this.get(companyId, id);
  }

  update(companyId: string, id: string, input: { name?: string; folderId?: string | null }): DocumentFull {
    const { db, mirror, bus } = this.ctx;
    const current = this.requireRow(companyId, id);
    const name = input.name !== undefined ? validateDocumentName(input.name) : current.name;
    const folderId = input.folderId !== undefined ? input.folderId : current.folder_id;
    if (name === current.name && folderId === current.folder_id) return this.toFull(current);
    this.requireFolder(companyId, folderId);
    const from = mirror.documentSegments(id)!;
    db.tx(() => {
      assertNameFree(db, companyId, folderId, nameKey(name), name, { docId: id });
      db.run('UPDATE documents SET name = ?, name_key = ?, folder_id = ? WHERE id = ?', name, nameKey(name), folderId, id);
    });
    mirror.move(companyId, from, mirror.documentSegments(id)!);
    bus.emit(companyId, 'tree');
    return this.get(companyId, id);
  }

  putContent(companyId: string, id: string, actor: Actor, content: string): DocumentFull {
    const row = this.requireRow(companyId, id);
    this.assertContentAllowed(companyId, content, row.size);
    this.ctx.rooms.applyContent(id, content, actor);
    return this.get(companyId, id);
  }

  remove(companyId: string, id: string): void {
    const { db, mirror, rooms, bus } = this.ctx;
    this.requireRow(companyId, id);
    const segs = mirror.documentSegments(id)!;
    rooms.closeDocument(id, 4404);
    db.run('DELETE FROM documents WHERE id = ? AND company_id = ?', id, companyId);
    mirror.remove(companyId, segs);
    bus.emit(companyId, 'tree');
  }
}
