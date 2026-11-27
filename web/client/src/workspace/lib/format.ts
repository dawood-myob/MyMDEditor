export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return '';
  }

  const s = Math.round((now - t) / 1000);
  if (s < 45) {
    return 'just now';
  }

  const units: Array<[number, string]> = [[60, 'min'], [3600, 'h'], [86400, 'd'], [604800, 'w']];
  if (s < 3600) {
    return `${Math.max(1, Math.round(s / 60))} min ago`;
  }

  if (s < 86400) {
    return `${Math.round(s / 3600)} h ago`;
  }

  if (s < 604800) {
    return `${Math.round(s / 86400)} d ago`;
  }

  void units;
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }

  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }

  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function countWords(text: string): number {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** File name from a Content-Disposition header (supports RFC 5987 `filename*`). */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) {
    return fallback;
  }

  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through */
    }
  }

  const plain = /filename\s*=\s*("([^"]+)"|[^;]+)/i.exec(header);
  return plain ? (plain[2] ?? plain[1]).trim() : fallback;
}
