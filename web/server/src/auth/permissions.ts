import type { Role } from '../lib/models.js';

export type Permission = 'workspace.read' | 'workspace.write' | 'users.manage' | 'platform.manage';

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  superadmin: new Set<Permission>(['platform.manage', 'users.manage']),
  admin: new Set<Permission>(['workspace.read', 'workspace.write', 'users.manage']),
  editor: new Set<Permission>(['workspace.read', 'workspace.write']),
  viewer: new Set<Permission>(['workspace.read']),
};

export const can = (role: Role, permission: Permission): boolean => MATRIX[role].has(permission);
export const canWriteDocuments = (role: Role): boolean => can(role, 'workspace.write');
