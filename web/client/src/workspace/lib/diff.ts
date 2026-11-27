export type DiffKind = 'same' | 'add' | 'del';

export interface DiffLine {
  kind: DiffKind;
  text: string;
  /** 1-based line number in the old text (undefined for additions) */
  oldNo?: number;
  /** 1-based line number in the new text (undefined for deletions) */
  newNo?: number;
}

export interface DiffStats { added: number; removed: number; unchanged: number }

const MAX_CELLS = 6_000_000;

function splitLines(text: string): string[] {
  if (text === '') {
    return [];
  }

  const lines = text.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}

/**
 * Line diff based on the longest common subsequence. Common prefix/suffix are trimmed first; when the remaining
 * problem would be too large for the DP table, the middle is reported as one removed + one added block.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const out: DiffLine[] = [];
  for (let i = 0; i < start; i++) {
    out.push({ kind: 'same', text: a[i], oldNo: i + 1, newNo: i + 1 });
  }

  const n = endA - start;
  const m = endB - start;
  const midOps: DiffLine[] = [];

  if (n === 0 || m === 0 || (n + 1) * (m + 1) > MAX_CELLS) {
    for (let i = start; i < endA; i++) {
      midOps.push({ kind: 'del', text: a[i], oldNo: i + 1 });
    }

    for (let j = start; j < endB; j++) {
      midOps.push({ kind: 'add', text: b[j], newNo: j + 1 });
    }
  } else {
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] =
          a[start + i] === b[start + j]
            ? table[(i + 1) * width + j + 1] + 1
            : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }

    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) {
        midOps.push({ kind: 'same', text: a[start + i], oldNo: start + i + 1, newNo: start + j + 1 });
        i++;
        j++;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        midOps.push({ kind: 'del', text: a[start + i], oldNo: start + i + 1 });
        i++;
      } else {
        midOps.push({ kind: 'add', text: b[start + j], newNo: start + j + 1 });
        j++;
      }
    }

    for (; i < n; i++) {
      midOps.push({ kind: 'del', text: a[start + i], oldNo: start + i + 1 });
    }

    for (; j < m; j++) {
      midOps.push({ kind: 'add', text: b[start + j], newNo: start + j + 1 });
    }
  }

  out.push(...midOps);
  for (let k = 0; k < a.length - endA; k++) {
    out.push({ kind: 'same', text: a[endA + k], oldNo: endA + k + 1, newNo: endB + k + 1 });
  }

  return out;
}

export function diffStats(lines: readonly DiffLine[]): DiffStats {
  const stats: DiffStats = { added: 0, removed: 0, unchanged: 0 };
  for (const l of lines) {
    if (l.kind === 'add') {
      stats.added++;
    } else if (l.kind === 'del') {
      stats.removed++;
    } else {
      stats.unchanged++;
    }
  }

  return stats;
}

export type DiffRow = DiffLine | { kind: 'gap'; hidden: number };

/** Collapses long runs of unchanged lines, keeping `context` lines around each change. */
export function collapseUnchanged(lines: readonly DiffLine[], context = 3): DiffRow[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind !== 'same') {
      for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) {
        keep[k] = true;
      }
    }
  });

  const rows: DiffRow[] = [];
  let hidden = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (hidden) {
        rows.push({ kind: 'gap', hidden });
        hidden = 0;
      }

      rows.push(l);
    } else {
      hidden++;
    }
  });

  if (hidden) {
    rows.push({ kind: 'gap', hidden });
  }

  return rows;
}
