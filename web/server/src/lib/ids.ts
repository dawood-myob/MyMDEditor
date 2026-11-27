import { randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();
export const nowIso = (): string => new Date().toISOString();
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
