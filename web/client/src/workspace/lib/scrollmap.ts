/** One entry of the editor/preview source map: a 0-based source line and the vertical offset (px) of its block. */
export interface LineAnchor { line: number; top: number }

/** Reads `data-line` anchors from rendered preview HTML (offsets are relative to `container`'s scrollable content). */
export function collectAnchors(container: HTMLElement): LineAnchor[] {
  const base = container.getBoundingClientRect().top - container.scrollTop;
  const anchors: LineAnchor[] = [];
  container.querySelectorAll<HTMLElement>('[data-line]').forEach((el) => {
    const line = Number(el.dataset.line);
    if (Number.isFinite(line)) {
      anchors.push({ line, top: el.getBoundingClientRect().top - base });
    }
  });

  anchors.sort((a, b) => a.line - b.line || a.top - b.top);
  // keep one anchor per line, and enforce monotonic offsets so interpolation is well defined
  const out: LineAnchor[] = [];
  for (const a of anchors) {
    const last = out[out.length - 1];
    if (last && last.line === a.line) {
      continue;
    }

    out.push(last && a.top < last.top ? { line: a.line, top: last.top } : a);
  }

  return out;
}

/** Fractional source line -> preview scrollTop (linear interpolation between neighbouring anchors). */
export function lineToTop(anchors: readonly LineAnchor[], line: number): number {
  if (anchors.length === 0) {
    return 0;
  }

  if (line <= anchors[0].line) {
    return anchors[0].line > 0 ? anchors[0].top * (Math.max(0, line) / anchors[0].line) : anchors[0].top;
  }

  const last = anchors[anchors.length - 1];
  if (line >= last.line) {
    return last.top;
  }

  let lo = 0;
  let hi = anchors.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].line <= line) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = anchors[lo];
  const b = anchors[hi];
  const t = (line - a.line) / (b.line - a.line);
  return a.top + (b.top - a.top) * t;
}

/** Preview scrollTop -> fractional source line. Inverse of {@link lineToTop}. */
export function topToLine(anchors: readonly LineAnchor[], top: number): number {
  if (anchors.length === 0) {
    return 0;
  }

  const first = anchors[0];
  if (top <= first.top) {
    return first.top > 0 ? first.line * Math.max(0, top / first.top) : first.line;
  }

  const last = anchors[anchors.length - 1];
  if (top >= last.top) {
    return last.line;
  }

  let lo = 0;
  let hi = anchors.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].top <= top) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = anchors[lo];
  const b = anchors[hi];
  const span = b.top - a.top;
  return span <= 0 ? a.line : a.line + ((top - a.top) / span) * (b.line - a.line);
}

/** Closest anchor at or before a line; used for click-to-jump from the preview. */
export function lineOfElement(el: Element | null): number | null {
  for (let cur: Element | null = el; cur; cur = cur.parentElement) {
    const v = (cur as HTMLElement).dataset?.line;
    if (v !== undefined) {
      const n = Number(v);
      if (Number.isFinite(n)) {
        return n;
      }
    }
  }

  return null;
}
