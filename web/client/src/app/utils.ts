const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '-_.!@#%+=';

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % max;
}

/** Cryptographically random password without look-alike characters; always satisfies the >= 10 chars policy. */
export function generatePassword(length = 16): string {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const chars = [LOWER, UPPER, DIGITS, SYMBOLS].map((set) => set[randomInt(set.length)]);
  while (chars.length < Math.max(length, 12)) {
    chars.push(all[randomInt(all.length)]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;

export interface Strength { score: 0 | 1 | 2 | 3 | 4; label: string }

export function passwordStrength(pw: string): Strength {
  if (!pw) {
    return { score: 0, label: '' };
  }

  if (pw.length < MIN_PASSWORD) {
    return { score: 1, label: 'Too short' };
  }

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const points = classes + (pw.length >= 14 ? 1 : 0) + (pw.length >= 20 ? 1 : 0);
  if (points <= 2) {
    return { score: 2, label: 'Okay' };
  }

  return points <= 4 ? { score: 3, label: 'Good' } : { score: 4, label: 'Strong' };
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/[\s._@-]+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }

  const first = parts[0][0];
  const second = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] ?? '');
  return (first + second).toUpperCase();
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return '–';
  }

  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
}

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
