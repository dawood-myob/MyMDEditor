import type { Db } from '../../db/connection.js';
import type { Config } from '../../config.js';
import { newId, nowIso } from '../../lib/ids.js';
import { byteLength } from '../../lib/names.js';
import { errors } from '../../lib/errors.js';
import type { Actor, VersionFull, VersionMeta } from '../../lib/models.js';

interface VersionRow {
  id: string;
  document_id: string;
  created_at: string;
  author_name: string | null;
  label: string | null;
  kind: VersionMeta['kind'];
  size: number;
  content?: string;
}

const META = 'id, document_id, created_at, author_name, label, kind, size';

const toMeta = (r: VersionRow): VersionMeta => ({
  id: r.id,
  documentId: r.document_id,
  createdAt: r.created_at,
  authorName: r.author_name,
  label: r.label,
  kind: r.kind,
  size: r.size,
});

export interface CreateVersionOptions {
  kind: VersionMeta['kind'];
  label?: string | null;
  author?: Actor | null;
  skipIfIdentical?: boolean;
}

export class VersionService {
  constructor(
    private db: Db,
    private config: Config,
  ) {}

  private docOwned(companyId: string, docId: string): boolean {
    return !!this.db.get('SELECT 1 AS x FROM documents WHERE id = ? AND company_id = ?', docId, companyId);
  }

  list(companyId: string, docId: string): VersionMeta[] {
    if (!this.docOwned(companyId, docId)) throw errors.notFound('Document not found');
    return this.db.all<VersionRow>(`SELECT ${META} FROM versions WHERE document_id = ? AND company_id = ? ORDER BY seq DESC`, docId, companyId).map(toMeta);
  }

  get(companyId: string, docId: string, versionId: string): VersionFull {
    const r = this.db.get<VersionRow>(`SELECT ${META}, content FROM versions WHERE id = ? AND document_id = ? AND company_id = ?`, versionId, docId, companyId);
    if (!r) throw errors.notFound('Version not found');
    return { ...toMeta(r), content: r.content ?? '' };
  }

  latestContent(docId: string): string | null {
    const r = this.db.get<{ content: string }>('SELECT content FROM versions WHERE document_id = ? ORDER BY seq DESC LIMIT 1', docId);
    return r ? r.content : null;
  }

  count(docId: string): number {
    return this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM versions WHERE document_id = ?', docId)?.n ?? 0;
  }

  create(companyId: string, docId: string, content: string, opts: CreateVersionOptions): VersionMeta | null {
    if (opts.skipIfIdentical && this.latestContent(docId) === content) return null;
    const row: VersionRow = {
      id: newId(),
      document_id: docId,
      created_at: nowIso(),
      author_name: opts.author?.name ?? null,
      label: opts.label ?? null,
      kind: opts.kind,
      size: byteLength(content),
    };
    this.db.run(
      'INSERT INTO versions (id, document_id, company_id, created_at, author_id, author_name, label, kind, content, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      row.id,
      docId,
      companyId,
      row.created_at,
      opts.author?.id ?? null,
      row.author_name,
      row.label,
      row.kind,
      content,
      row.size,
    );
    this.prune(docId);
    return toMeta(row);
  }

  /** Keeps at most maxPerDocument versions; manual versions are never removed. */
  prune(docId: string): void {
    const max = this.config.versions.maxPerDocument;
    const total = this.count(docId);
    if (total <= max) return;
    this.db.run(
      `DELETE FROM versions WHERE id IN (
         SELECT id FROM versions WHERE document_id = ? AND kind <> 'manual' ORDER BY seq ASC LIMIT ?)`,
      docId,
      total - max,
    );
  }
}
