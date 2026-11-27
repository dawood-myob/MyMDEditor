export interface UserColors { color: string; colorLight: string }

function hash(id: string): number {
  // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }

  return h >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Deterministic presence colour for a user id: same id => same colours on every client. */
export function colorFromId(id: string): UserColors {
  const hue = hash(id) % 360;
  const color = hslToHex(hue, 0.68, 0.42);
  return { color, colorLight: `${color}40` };
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s._@-]+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }

  const first = parts[0][0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? '';
  return (first + second).toUpperCase();
}
