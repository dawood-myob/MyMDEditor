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

export interface Folder { id: string; parentId: string | null; name: string; createdAt: string }

export interface DocumentMeta {
  id: string;
  folderId: string | null;
  name: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  updatedByName: string | null;
}

export interface DocumentFull extends DocumentMeta { path: string; content: string }

export interface VersionMeta {
  id: string;
  documentId: string;
  createdAt: string;
  authorName: string | null;
  label: string | null;
  kind: 'auto' | 'manual' | 'restore' | 'import';
  size: number;
}

export interface VersionFull extends VersionMeta { content: string }

export interface SearchHit { documentId: string; name: string; path: string; snippet: string }

export interface TreeResponse { folders: Folder[]; documents: DocumentMeta[] }

/** Snippet match markers (private-use characters) */
export const MATCH_START = '\uE000';
export const MATCH_END = '\uE001';
