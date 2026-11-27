export interface OutlineItem {
  index: number;
  /** 0-based source line of the heading text */
  line: number;
  level: number;
  text: string;
  /** index of the parent heading in the same array, or -1 */
  parent: number;
  hasChildren: boolean;
  /** stable-ish key (level + text + occurrence) used to remember collapsed sections across edits */
  key: string;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;

/** Strips the most common inline markdown so the outline shows readable text. */
export function cleanHeadingText(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!~])/g, '$1')
    .trim();
}

/** Extracts ATX and setext headings from markdown source, ignoring fenced code blocks and YAML front matter. */
export function extractOutline(source: string): OutlineItem[] {
  const lines = source.split(/\r\n|\r|\n/);
  const raw: Array<{ line: number; level: number; text: string }> = [];

  let i = 0;
  if (lines[0]?.trim() === '---') {
    for (let j = 1; j < lines.length; j++) {
      if (/^(---|\.\.\.)\s*$/.test(lines[j])) {
        i = j + 1;
        break;
      }
    }
  }

  let fence: { char: string; length: number } | null = null;
  let prevParagraph = false;
  for (; i < lines.length; i++) {
    const text = lines[i];

    if (fence) {
      const close = new RegExp(`^ {0,3}\\${fence.char}{${fence.length},}[ \\t]*$`);
      if (close.test(text)) {
        fence = null;
      }

      prevParagraph = false;
      continue;
    }

    const open = FENCE_OPEN.exec(text);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
      fence = { char: open[1][0], length: open[1].length };
      prevParagraph = false;
      continue;
    }

    const atx = ATX.exec(text);
    if (atx) {
      const cleaned = cleanHeadingText(atx[2] ?? '');
      if (cleaned) {
        raw.push({ line: i, level: atx[1].length, text: cleaned });
      }

      prevParagraph = false;
      continue;
    }

    const setext = SETEXT.exec(text);
    if (setext && prevParagraph) {
      const cleaned = cleanHeadingText(lines[i - 1]);
      if (cleaned) {
        raw.push({ line: i - 1, level: setext[1][0] === '=' ? 1 : 2, text: cleaned });
      }

      prevParagraph = false;
      continue;
    }

    prevParagraph = text.trim() !== '' && !/^ {0,3}([-*+]|\d+[.)])[ \t]/.test(text) && !/^ {0,3}>/.test(text) && !/^( {4,}|\t)/.test(text);
  }

  const items: OutlineItem[] = [];
  const stack: number[] = [];
  const seen = new Map<string, number>();
  for (const h of raw) {
    while (stack.length && items[stack[stack.length - 1]].level >= h.level) {
      stack.pop();
    }

    const parent = stack.length ? stack[stack.length - 1] : -1;
    const base = `${h.level}:${h.text}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const item: OutlineItem = { index: items.length, line: h.line, level: h.level, text: h.text, parent, hasChildren: false, key: `${base}:${n}` };
    if (parent >= 0) {
      items[parent].hasChildren = true;
    }

    items.push(item);
    stack.push(item.index);
  }

  return items;
}

/** Index of the heading whose section contains `line` (0-based), or -1 before the first heading. */
export function activeHeadingIndex(items: readonly OutlineItem[], line: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].line <= line) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return found;
}

/** Items whose ancestors are not collapsed. */
export function visibleOutline(items: readonly OutlineItem[], collapsed: ReadonlySet<string>): OutlineItem[] {
  return items.filter((item) => {
    for (let p = item.parent; p >= 0; p = items[p].parent) {
      if (collapsed.has(items[p].key)) {
        return false;
      }
    }

    return true;
  });
}
