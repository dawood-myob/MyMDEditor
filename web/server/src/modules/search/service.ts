import type { AppContext } from '../../context.js';
import type { SearchHit } from '../../lib/models.js';

const TERM_RE = /[\p{L}\p{N}]+/gu;

/** Builds a safe FTS5 MATCH expression: quoted terms, prefix match on the last one. */
export function buildMatchQuery(q: string): string | null {
  const terms = (q.normalize('NFC').match(TERM_RE) ?? []).slice(0, 10);
  if (terms.length === 0) return null;
  return terms.map((t, i) => `"${t}"${i === terms.length - 1 ? '*' : ''}`).join(' ');
}

export class SearchService {
  constructor(private ctx: AppContext) {}

  search(companyId: string, q: string, limit: number): SearchHit[] {
    const match = buildMatchQuery(q);
    if (!match) return [];
    const { db, mirror } = this.ctx;
    const rows = db.all<{ id: string; name: string; folder_id: string | null; snippet: string }>(
      `SELECT d.id, d.name, d.folder_id,
              snippet(documents_fts, -1, char(57344), char(57345), '…', 24) AS snippet
         FROM documents_fts
         JOIN documents d ON d.seq = documents_fts.rowid
        WHERE documents_fts MATCH ? AND d.company_id = ?
        ORDER BY rank
        LIMIT ?`,
      match,
      companyId,
      limit,
    );
    return rows.map((r) => ({
      documentId: r.id,
      name: r.name,
      path: mirror.displayPath(r.folder_id, r.name),
      snippet: r.snippet,
    }));
  }
}
