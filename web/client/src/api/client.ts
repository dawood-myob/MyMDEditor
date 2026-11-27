import type { Role } from './types';

export interface ApiErrorBody { code: string; message: string; details?: unknown }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** Fired on any 401 from a non-auth endpoint so the shell can drop the session and show the login page. */
export const UNAUTHORIZED_EVENT = 'mdhub:unauthorized';

async function request<T>(method: string, url: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'mdhub', ...(init.headers as Record<string, string> | undefined) };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(url, { method, credentials: 'same-origin', ...init, headers, body: payload });
  if (res.status === 204) {
    return undefined as T;
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : undefined;
  if (!res.ok) {
    const err: ApiErrorBody = data?.error ?? { code: 'internal', message: res.statusText || 'Request failed' };
    if (res.status === 401 && !url.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(res.status, err.code, err.message, err.details);
  }

  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T = void>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) => request<T>('POST', url, form),
};

export const canWrite = (role: Role | undefined) => role === 'admin' || role === 'editor';
export const isAdmin = (role: Role | undefined) => role === 'admin' || role === 'superadmin';

/** Same-origin WebSocket base for y-websocket, e.g. ws://host/ws */
export function wsBaseUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}
