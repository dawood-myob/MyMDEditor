import type { Db } from '../../db/connection.js';
import { errors } from '../../lib/errors.js';

/** True if a sibling (folder or document) with this case-insensitive name already exists under parentId. */
export function siblingNameTaken(
  db: Db,
  companyId: string,
  parentId: string | null,
  key: string,
  exclude: { folderId?: string; docId?: string } = {},
): boolean {
  const f = db.get('SELECT 1 AS x FROM folders WHERE company_id = ? AND parent_id IS ? AND name_key = ? AND id <> ?', companyId, parentId, key, exclude.folderId ?? '');
  if (f) return true;
  const d = db.get('SELECT 1 AS x FROM documents WHERE company_id = ? AND folder_id IS ? AND name_key = ? AND id <> ?', companyId, parentId, key, exclude.docId ?? '');
  return !!d;
}

export function assertNameFree(
  db: Db,
  companyId: string,
  parentId: string | null,
  key: string,
  name: string,
  exclude: { folderId?: string; docId?: string } = {},
): void {
  if (siblingNameTaken(db, companyId, parentId, key, exclude)) {
    throw errors.conflict(`An item named "${name}" already exists in this location`, { field: 'name' });
  }
}

/** Picks "name (2).ext" style alternatives until the sibling name is free. */
export function uniqueName(db: Db, companyId: string, parentId: string | null, name: string, ext: string, nameKeyFn: (n: string) => string, taken?: Set<string>): string {
  const stem = ext && name.toLowerCase().endsWith(ext) ? name.slice(0, -ext.length) : name;
  let candidate = name;
  let i = 2;
  const keyOf = (n: string) => `${parentId ?? ''}|${nameKeyFn(n)}`;
  while (siblingNameTaken(db, companyId, parentId, nameKeyFn(candidate)) || taken?.has(keyOf(candidate))) {
    const suffix = ` (${i++})`;
    candidate = `${stem.slice(0, Math.max(1, 120 - ext.length - suffix.length)).replace(/[. ]+$/g, '')}${suffix}${ext}`;
  }
  taken?.add(keyOf(candidate));
  return candidate;
}
