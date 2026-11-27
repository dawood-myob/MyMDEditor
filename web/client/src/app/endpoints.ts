import { api } from '../api/client';
import type { Company, User } from '../api/types';

export type ManagedRole = 'admin' | 'editor' | 'viewer';

export interface NewCompanyInput {
  name: string;
  slug?: string;
  adminUsername: string;
  adminPassword: string;
  adminDisplayName?: string;
}

export interface NewUserInput { username: string; displayName?: string; password: string; role: ManagedRole }
export interface UserPatch { displayName?: string; role?: ManagedRole; disabled?: boolean; password?: string }

export const platformApi = {
  list: () => api.get<{ companies: Company[] }>('/api/platform/companies').then((r) => r.companies),
  create: (input: NewCompanyInput) => api.post<{ company: Company }>('/api/platform/companies', input).then((r) => r.company),
  update: (id: string, patch: { name?: string; disabled?: boolean }) =>
    api.patch<{ company: Company }>(`/api/platform/companies/${encodeURIComponent(id)}`, patch).then((r) => r.company),
  remove: (id: string, slug: string) =>
    api.del(`/api/platform/companies/${encodeURIComponent(id)}?confirm=${encodeURIComponent(slug)}`),
};

const usersUrl = (companyId: string) => `/api/companies/${encodeURIComponent(companyId)}/users`;

export const usersApi = {
  list: (companyId: string) => api.get<{ users: User[] }>(usersUrl(companyId)).then((r) => r.users),
  create: (companyId: string, input: NewUserInput) => api.post<{ user: User }>(usersUrl(companyId), input).then((r) => r.user),
  update: (companyId: string, userId: string, patch: UserPatch) =>
    api.patch<{ user: User }>(`${usersUrl(companyId)}/${encodeURIComponent(userId)}`, patch).then((r) => r.user),
  remove: (companyId: string, userId: string) => api.del(`${usersUrl(companyId)}/${encodeURIComponent(userId)}`),
};
