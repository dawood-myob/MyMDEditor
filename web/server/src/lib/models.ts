export type Role = 'superadmin' | 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  companyId: string | null;
  companyName: string | null;
  companySlug: string | null;
  mustChangePassword: boolean;
  disabled: boolean;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  disabled: boolean;
  userCount: number;
  documentCount: number;
  createdAt: string;
}

export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: string;
}

export interface DocumentMeta {
  id: string;
  folderId: string | null;
  name: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  updatedByName: string | null;
}

export interface DocumentFull extends DocumentMeta {
  path: string;
  content: string;
}

export interface VersionMeta {
  id: string;
  documentId: string;
  createdAt: string;
  authorName: string | null;
  label: string | null;
  kind: 'auto' | 'manual' | 'restore' | 'import';
  size: number;
}

export interface VersionFull extends VersionMeta {
  content: string;
}

export interface SearchHit {
  documentId: string;
  name: string;
  path: string;
  snippet: string;
}

export interface UserRow {
  id: string;
  company_id: string | null;
  username: string;
  username_key: string;
  display_name: string;
  role: Role;
  password_hash: string;
  must_change_password: number;
  disabled: number;
  failed_logins: number;
  locked_until: string | null;
  created_at: string;
  company_name: string | null;
  company_slug: string | null;
  company_disabled: number | null;
}

export const USER_SELECT = `SELECT u.*, c.name AS company_name, c.slug AS company_slug, c.disabled AS company_disabled
  FROM users u LEFT JOIN companies c ON c.id = u.company_id`;

export function toUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    companyId: r.company_id,
    companyName: r.company_name,
    companySlug: r.company_slug,
    mustChangePassword: !!r.must_change_password,
    disabled: !!r.disabled,
    createdAt: r.created_at,
  };
}

export interface FolderRow {
  id: string;
  company_id: string;
  parent_id: string | null;
  name: string;
  name_key: string;
  created_at: string;
  updated_at: string;
}

export const toFolder = (r: FolderRow): Folder => ({ id: r.id, parentId: r.parent_id, name: r.name, createdAt: r.created_at });

export interface DocumentRow {
  seq: number;
  id: string;
  company_id: string;
  folder_id: string | null;
  name: string;
  name_key: string;
  content: string;
  size: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
}

export const DOC_META_COLS = 'id, folder_id, name, size, created_at, updated_at, updated_by_name';

export const toDocMeta = (r: Pick<DocumentRow, 'id' | 'folder_id' | 'name' | 'size' | 'created_at' | 'updated_at' | 'updated_by_name'>): DocumentMeta => ({
  id: r.id,
  folderId: r.folder_id,
  name: r.name,
  size: r.size,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  updatedByName: r.updated_by_name,
});

export interface Actor {
  id: string;
  name: string;
}
