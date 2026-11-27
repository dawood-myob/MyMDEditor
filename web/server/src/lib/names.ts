import { errors } from './errors.js';

const FORBIDDEN_CHARS = /[/\\:*?"<>|\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const RESERVED = /^(con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])$/i;
export const MAX_NAME_LENGTH = 120;
export const DOC_EXT = '.md';

export function nameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

function checkSegment(raw: unknown, label: string): string {
  if (typeof raw !== 'string') throw errors.validation(`${label} must be a string`, { field: 'name' });
  const name = raw.normalize('NFC').trim();
  return name;
}

function checkCommon(name: string, label: string, stemForReserved: string): void {
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    throw errors.validation(`${label} must be 1-${MAX_NAME_LENGTH} characters`, { field: 'name' });
  }
  if (FORBIDDEN_CHARS.test(name)) {
    throw errors.validation(`${label} contains forbidden characters (/ \\ : * ? " < > | or control characters)`, { field: 'name' });
  }
  if (name === '.' || name === '..') throw errors.validation(`${label} is not allowed`, { field: 'name' });
  if (/[. ]$/.test(name)) throw errors.validation(`${label} must not end with a dot or space`, { field: 'name' });
  const base = stemForReserved.split('.')[0]!.trim();
  if (RESERVED.test(base)) throw errors.validation(`${label} is a reserved name`, { field: 'name' });
}

export function validateFolderName(raw: unknown): string {
  const name = checkSegment(raw, 'Folder name');
  checkCommon(name, 'Folder name', name);
  return name;
}

export function validateDocumentName(raw: unknown): string {
  let name = checkSegment(raw, 'Document name');
  if (name.toLowerCase().endsWith(DOC_EXT)) name = name.slice(0, -DOC_EXT.length) + DOC_EXT;
  else name += DOC_EXT;
  const stem = name.slice(0, -DOC_EXT.length);
  if (stem.trim().length === 0 || stem === '.' || stem === '..') throw errors.validation('Document name is not allowed', { field: 'name' });
  checkCommon(name, 'Document name', stem);
  return name;
}

export function validatePassword(pw: unknown, field = 'password'): string {
  if (typeof pw !== 'string' || pw.length < 10 || pw.length > 200) {
    throw errors.validation('Password must be 10-200 characters', { field });
  }
  return pw;
}

const USERNAME_RE = /^[A-Za-z0-9._@-]{3,40}$/;
export function validateUsername(u: unknown): string {
  if (typeof u !== 'string' || !USERNAME_RE.test(u)) {
    throw errors.validation('Username must be 3-40 characters of A-Z a-z 0-9 . _ @ -', { field: 'username' });
  }
  return u;
}

const SLUG_RE = /^[a-z0-9-]{2,40}$/;
export function validateSlug(s: unknown): string {
  if (typeof s !== 'string' || !SLUG_RE.test(s)) {
    throw errors.validation('Slug must be 2-40 characters of a-z 0-9 -', { field: 'slug' });
  }
  return s;
}

export function slugify(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s.length >= 2 ? s : 'company';
}

/** Lenient sanitiser for names coming from imported files (never throws). */
const FORBIDDEN_GLOBAL = new RegExp(FORBIDDEN_CHARS.source, 'g');

export function sanitizeImportSegment(raw: string, isDoc: boolean): string {
  let s = raw.normalize('NFC').replace(FORBIDDEN_GLOBAL, '_').trim();
  if (isDoc) {
    s = s.toLowerCase().endsWith(DOC_EXT) ? s.slice(0, -DOC_EXT.length) : s;
  }
  s = s.replace(/[. ]+$/g, '');
  if (s === '' || s === '.' || s === '..') s = 'untitled';
  if (RESERVED.test(s.split('.')[0]!.trim())) s = '_' + s;
  const max = isDoc ? MAX_NAME_LENGTH - DOC_EXT.length : MAX_NAME_LENGTH;
  if (s.length > max) s = s.slice(0, max).replace(/[. ]+$/g, '') || 'untitled';
  return isDoc ? s + DOC_EXT : s;
}

export function byteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}
