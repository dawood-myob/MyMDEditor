import { describe, expect, it } from 'vitest';
import { minimizeAxisFor } from './dockUtil';

const leaf = (...views: string[]) => ({ type: 'leaf', data: { views, id: views[0] }, size: 100 });

const dock = (root: unknown, orientation: 'HORIZONTAL' | 'VERTICAL' = 'HORIZONTAL') => ({ grid: { root, width: 1000, height: 600, orientation } });

describe('minimizeAxisFor', () => {
  // [ explorer / outline ] | editor | preview
  const layout = dock({
    type: 'branch',
    size: 600,
    data: [{ type: 'branch', size: 250, data: [leaf('explorer'), leaf('outline', 'history')] }, leaf('editor'), leaf('preview')],
  });

  it('side columns collapse along x', () => {
    expect(minimizeAxisFor(layout, 'editor')).toBe('x');
    expect(minimizeAxisFor(layout, 'preview')).toBe('x');
  });

  it('stacked groups collapse along y', () => {
    expect(minimizeAxisFor(layout, 'explorer')).toBe('y');
    expect(minimizeAxisFor(layout, 'history')).toBe('y');
  });

  it('respects a vertical root orientation', () => {
    const v = dock({ type: 'branch', size: 600, data: [leaf('editor'), leaf('preview')] }, 'VERTICAL');
    expect(minimizeAxisFor(v, 'editor')).toBe('y');
  });

  it('returns null for a sole group, floating or unknown panels and junk', () => {
    expect(minimizeAxisFor(dock({ type: 'branch', size: 1, data: [leaf('editor')] }), 'editor')).toBeNull();
    expect(minimizeAxisFor(layout, 'nope')).toBeNull();
    expect(minimizeAxisFor(null, 'editor')).toBeNull();
    expect(minimizeAxisFor({ grid: { root: 5 } }, 'editor')).toBeNull();
  });
});
