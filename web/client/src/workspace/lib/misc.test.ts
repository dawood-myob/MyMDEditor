import { describe, expect, it } from 'vitest';
import { MATCH_END, MATCH_START } from '../../api/types';
import { collapseUnchanged, diffLines, diffStats } from './diff';
import { colorFromId, initials } from './color';
import { firstMatch, parseSnippet, snippetText } from './snippet';
import { filenameFromDisposition, relativeTime } from './format';
import { lineToTop, topToLine, type LineAnchor } from './scrollmap';
import { normalizeZipPath } from './zip';

describe('parseSnippet', () => {
  it('splits on markers', () => {
    const s = `a ${MATCH_START}hit${MATCH_END} b ${MATCH_START}two${MATCH_END}`;
    expect(parseSnippet(s)).toEqual([
      { text: 'a ', match: false },
      { text: 'hit', match: true },
      { text: ' b ', match: false },
      { text: 'two', match: true },
    ]);
    expect(snippetText(s)).toBe('a hit b two');
    expect(firstMatch(s)).toBe('hit');
  });

  it('handles unbalanced markers and never produces HTML', () => {
    expect(parseSnippet(`x${MATCH_END}y`)).toEqual([{ text: 'x', match: false }, { text: 'y', match: false }]);
    expect(parseSnippet(`${MATCH_START}open`)).toEqual([{ text: 'open', match: true }]);
    expect(parseSnippet('<b>raw</b>')).toEqual([{ text: '<b>raw</b>', match: false }]);
    expect(parseSnippet('')).toEqual([]);
    expect(firstMatch('none')).toBeNull();
  });
});

describe('diffLines', () => {
  it('reports identical text as unchanged', () => {
    const d = diffLines('a\nb', 'a\nb');
    expect(diffStats(d)).toEqual({ added: 0, removed: 0, unchanged: 2 });
  });

  it('detects additions, deletions and replacements', () => {
    const d = diffLines('a\nb\nc', 'a\nx\nc\nd');
    expect(d.map((l) => `${l.kind[0]}:${l.text}`)).toEqual(['s:a', 'd:b', 'a:x', 's:c', 'a:d']);
    expect(diffStats(d)).toEqual({ added: 2, removed: 1, unchanged: 2 });
  });

  it('numbers lines', () => {
    const d = diffLines('a\nb', 'a\nc');
    expect(d[1]).toMatchObject({ kind: 'del', oldNo: 2 });
    expect(d[2]).toMatchObject({ kind: 'add', newNo: 2 });
  });

  it('handles empty inputs and CRLF', () => {
    expect(diffLines('', 'a\nb').every((l) => l.kind === 'add')).toBe(true);
    expect(diffLines('a\nb', '').every((l) => l.kind === 'del')).toBe(true);
    expect(diffLines('', '')).toEqual([]);
    expect(diffStats(diffLines('a\r\nb', 'a\nb')).added).toBe(0);
  });

  it('finds an LCS rather than a naive replace', () => {
    const d = diffLines('1\n2\n3\n4\n5', '2\n3\n9\n5');
    expect(diffStats(d)).toEqual({ added: 1, removed: 2, unchanged: 3 });
  });

  it('collapses long unchanged runs', () => {
    const base = Array.from({ length: 30 }, (_, i) => `l${i}`);
    const changed = [...base];
    changed[15] = 'X';
    const rows = collapseUnchanged(diffLines(base.join('\n'), changed.join('\n')), 2);
    expect(rows.filter((r) => r.kind === 'gap').length).toBe(2);
    expect(rows.length).toBeLessThan(15);
  });

  it('copes with large inputs without blowing up', () => {
    const a = Array.from({ length: 4000 }, (_, i) => `a${i}`).join('\n');
    const b = Array.from({ length: 4000 }, (_, i) => `b${i}`).join('\n');
    const stats = diffStats(diffLines(a, b));
    expect(stats.added + stats.removed).toBe(8000);
  });
});

describe('colorFromId', () => {
  it('is deterministic and distinguishes ids', () => {
    expect(colorFromId('user-1')).toEqual(colorFromId('user-1'));
    expect(colorFromId('user-1').color).not.toBe(colorFromId('user-2').color);
  });

  it('returns valid hex colours', () => {
    const c = colorFromId('abc');
    expect(c.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(c.colorLight).toMatch(/^#[0-9a-f]{8}$/);
  });

  it('builds initials', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('acme-admin')).toBe('AA');
    expect(initials('x')).toBe('X');
    expect(initials('')).toBe('?');
  });
});

describe('format helpers', () => {
  it('relativeTime', () => {
    const now = Date.parse('2025-01-10T12:00:00Z');
    expect(relativeTime('2025-01-10T11:59:50Z', now)).toBe('just now');
    expect(relativeTime('2025-01-10T11:50:00Z', now)).toBe('10 min ago');
    expect(relativeTime('2025-01-10T09:00:00Z', now)).toBe('3 h ago');
    expect(relativeTime('2025-01-08T12:00:00Z', now)).toBe('2 d ago');
    expect(relativeTime('garbage', now)).toBe('');
  });

  it('filenameFromDisposition', () => {
    expect(filenameFromDisposition('attachment; filename="a b.md"', 'x')).toBe('a b.md');
    expect(filenameFromDisposition("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.md", 'x')).toBe('résumé.md');
    expect(filenameFromDisposition(null, 'fallback.zip')).toBe('fallback.zip');
  });
});

describe('scrollmap', () => {
  const anchors: LineAnchor[] = [{ line: 0, top: 0 }, { line: 10, top: 100 }, { line: 20, top: 400 }];
  it('interpolates line <-> top', () => {
    expect(lineToTop(anchors, 5)).toBe(50);
    expect(lineToTop(anchors, 15)).toBe(250);
    expect(topToLine(anchors, 250)).toBe(15);
    expect(topToLine(anchors, 100)).toBe(10);
  });

  it('clamps outside the range and tolerates empty maps', () => {
    expect(lineToTop(anchors, 99)).toBe(400);
    expect(topToLine(anchors, 9999)).toBe(20);
    expect(lineToTop([], 5)).toBe(0);
    expect(topToLine([], 5)).toBe(0);
  });
});

describe('zip paths', () => {
  it('normalises and rejects traversal', () => {
    expect(normalizeZipPath('dir\\sub/a.md')).toBe('dir/sub/a.md');
    expect(normalizeZipPath('./a.md')).toBe('a.md');
    expect(normalizeZipPath('../a.md')).toBeNull();
    expect(normalizeZipPath('')).toBeNull();
  });
});
