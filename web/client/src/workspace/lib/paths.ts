/** Resolves a relative link (`../other.md`, `sub/a.md#h`) against the path of the current document. Returns null for external/absolute URLs. */
export function resolveRelativePath(currentPath: string, href: string): string | null {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith('//')) {
    return null;
  }

  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* keep raw */
  }

  const base = currentPath.split('/').slice(0, -1);
  const parts = decoded.startsWith('/') ? [] : base;
  for (const seg of decoded.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(seg);
    }
  }

  return parts.length ? parts.join('/') : null;
}
