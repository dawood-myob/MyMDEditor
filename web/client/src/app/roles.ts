import type { Role } from '../api/types';
import type { BadgeTone } from './ui/Badge';

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Platform admin',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const ROLE_TONE: Record<Role, BadgeTone> = {
  superadmin: 'danger',
  admin: 'accent',
  editor: 'success',
  viewer: 'neutral',
};

export const ROLE_DESCRIPTION: Record<'admin' | 'editor' | 'viewer', string> = {
  admin: 'Everything an editor can do, plus manage the users of the company.',
  editor: 'Create, edit, move, delete and version documents and folders.',
  viewer: 'Read-only: browse, search, view history and export documents.',
};
