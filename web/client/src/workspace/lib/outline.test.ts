import { describe, expect, it } from 'vitest';
import { activeHeadingIndex, extractOutline, visibleOutline } from './outline';

describe('extractOutline', () => {
  it('extracts ATX headings with levels, lines and parents', () => {
    const items = extractOutline('# A\ntext\n## B\n### C\n## D\n# E');
    expect(items.map((i) => [i.level, i.text, i.line, i.parent])).toEqual([
      [1, 'A', 0, -1],
      [2, 'B', 2, 0],
      [3, 'C', 3, 1],
      [2, 'D', 4, 0],
      [1, 'E', 5, -1],
    ]);
    expect(items[0].hasChildren).toBe(true);
    expect(items[2].hasChildren).toBe(false);
  });

  it('ignores headings inside fenced code blocks', () => {
    const src = '# Real\n```md\n# Not a heading\n```\n~~~\n## nope\n~~~\n## After';
    expect(extractOutline(src).map((i) => i.text)).toEqual(['Real', 'After']);
  });

  it('respects fence length', () => {
    const src = '````\n```\n# inside\n```\n````\n# out';
    expect(extractOutline(src).map((i) => i.text)).toEqual(['out']);
  });

  it('supports setext headings, closing hashes and inline markup', () => {
    const src = 'Title\n=====\n\nSub *em* `code` [link](http://x)\n---\n\n## Closed ##\n#nospace';
    expect(extractOutline(src).map((i) => [i.level, i.text])).toEqual([
      [1, 'Title'],
      [2, 'Sub em code link'],
      [2, 'Closed'],
    ]);
  });

  it('skips front matter and does not treat list items followed by --- as setext', () => {
    const src = '---\ntitle: x\n# not heading\n---\n# Real\n- item\n---\n';
    expect(extractOutline(src).map((i) => i.text)).toEqual(['Real']);
  });

  it('handles CRLF', () => {
    expect(extractOutline('# A\r\n## B\r\n').map((i) => i.text)).toEqual(['A', 'B']);
  });

  it('gives duplicate headings distinct keys', () => {
    const items = extractOutline('# A\n# A');
    expect(items[0].key).not.toBe(items[1].key);
  });
});

describe('outline navigation', () => {
  const items = extractOutline('intro\n# A\n\n## B\n\n# C');
  it('finds the active heading for a line', () => {
    expect(activeHeadingIndex(items, 0)).toBe(-1);
    expect(activeHeadingIndex(items, 1)).toBe(0);
    expect(activeHeadingIndex(items, 4)).toBe(1);
    expect(activeHeadingIndex(items, 99)).toBe(2);
  });

  it('hides children of collapsed sections', () => {
    expect(visibleOutline(items, new Set([items[0].key])).map((i) => i.text)).toEqual(['A', 'C']);
    expect(visibleOutline(items, new Set()).length).toBe(3);
  });
});
