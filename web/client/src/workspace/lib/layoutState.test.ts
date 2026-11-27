import { describe, expect, it } from 'vitest';
import {
  defaultPlacement,
  initialUiState,
  isValidDock,
  layoutReducer,
  layoutStorageKey,
  loadLayout,
  parseLayout,
  saveLayout,
  serializeLayout,
  type LayoutUiState,
} from './layoutState';

const validDock = () => ({
  grid: {
    root: {
      type: 'branch',
      data: [
        { type: 'leaf', data: { views: ['explorer'], activeView: 'explorer', id: '1' }, size: 200 },
        { type: 'leaf', data: { views: ['editor', 'preview'], activeView: 'editor', id: '2' }, size: 800 },
      ],
      size: 600,
    },
    width: 1000,
    height: 600,
    orientation: 'HORIZONTAL',
  },
  panels: {
    explorer: { id: 'explorer', contentComponent: 'explorer', title: 'Explorer' },
    editor: { id: 'editor', contentComponent: 'editor', title: 'Editor' },
    preview: { id: 'preview', contentComponent: 'preview', title: 'Preview' },
  },
});

const ui = (over: Partial<LayoutUiState> = {}): LayoutUiState => ({
  visible: ['explorer', 'editor', 'preview'],
  minimized: {},
  maximized: null,
  preset: null,
  ...over,
});

describe('layoutReducer', () => {
  it('minimises and restores a group, remembering the previous size', () => {
    let s = layoutReducer(initialUiState(), { type: 'minimize', groupId: 'g1', axis: 'x', prevSize: 280.4 });
    expect(s.minimized.g1).toEqual({ axis: 'x', prevSize: 280 });
    s = layoutReducer(s, { type: 'restore', groupId: 'g1' });
    expect(s.minimized).toEqual({});
  });

  it('is a no-op (same reference) for redundant actions', () => {
    const s = initialUiState();
    expect(layoutReducer(s, { type: 'restore', groupId: 'x' })).toBe(s);
    expect(layoutReducer(s, { type: 'exitMaximize' })).toBe(s);
    expect(layoutReducer(s, { type: 'showPanel', panel: 'editor' })).toBe(s);
  });

  it('maximise and minimise are mutually exclusive', () => {
    let s = layoutReducer(ui(), { type: 'minimize', groupId: 'g', axis: 'y', prevSize: 100 });
    s = layoutReducer(s, { type: 'maximize', groupId: 'g' });
    expect(s.maximized).toBe('g');
    expect(s.minimized.g).toBeUndefined();
    s = layoutReducer(s, { type: 'minimize', groupId: 'g', axis: 'y', prevSize: 100 });
    expect(s.maximized).toBeNull();
  });

  it('toggles maximise', () => {
    let s = layoutReducer(ui(), { type: 'toggleMaximize', groupId: 'g' });
    expect(s.maximized).toBe('g');
    s = layoutReducer(s, { type: 'toggleMaximize', groupId: 'g' });
    expect(s.maximized).toBeNull();
  });

  it('hides and shows panels keeping canonical order and clearing the preset', () => {
    let s = layoutReducer(initialUiState(), { type: 'hidePanel', panel: 'outline' });
    expect(s.visible).toEqual(['explorer', 'editor', 'preview']);
    expect(s.preset).toBeNull();
    s = layoutReducer(s, { type: 'showPanel', panel: 'history' });
    s = layoutReducer(s, { type: 'showPanel', panel: 'outline' });
    expect(s.visible).toEqual(['explorer', 'outline', 'editor', 'preview', 'history']);
    s = layoutReducer(s, { type: 'togglePanel', panel: 'history' });
    expect(s.visible).not.toContain('history');
  });

  it('applies presets and resets transient state', () => {
    const start = ui({ minimized: { g: { axis: 'x', prevSize: 1 } }, maximized: 'g' });
    expect(layoutReducer(start, { type: 'applyPreset', preset: 'write' })).toEqual({ visible: ['editor'], minimized: {}, maximized: null, preset: 'write' });
    expect(layoutReducer(start, { type: 'applyPreset', preset: 'review' }).visible).toEqual(['preview']);
    expect(layoutReducer(start, { type: 'applyPreset', preset: 'side' }).visible).toEqual(['editor', 'preview']);
    expect(layoutReducer(start, { type: 'applyPreset', preset: 'focus' }).preset).toBe('focus');
    expect(layoutReducer(start, { type: 'applyPreset', preset: 'default' }).visible).toEqual(['explorer', 'outline', 'editor', 'preview']);
    expect(layoutReducer(start, { type: 'reset' })).toEqual(initialUiState());
  });

  it('syncs visibility from dockview and prunes dead groups', () => {
    const s = layoutReducer(initialUiState(), { type: 'syncVisible', visible: ['preview', 'editor'] });
    expect(s.visible).toEqual(['editor', 'preview']);
    const t = layoutReducer(ui({ minimized: { a: { axis: 'x', prevSize: 1 }, b: { axis: 'y', prevSize: 2 } }, maximized: 'b' }), { type: 'pruneGroups', groupIds: ['a'] });
    expect(Object.keys(t.minimized)).toEqual(['a']);
    expect(t.maximized).toBeNull();
  });
});

describe('defaultPlacement', () => {
  it('re-adds panels at their default dock position', () => {
    expect(defaultPlacement('editor', [])).toEqual({ kind: 'first' });
    expect(defaultPlacement('preview', ['editor'])).toEqual({ kind: 'relative', reference: 'editor', direction: 'right' });
    expect(defaultPlacement('explorer', ['editor', 'preview'])).toEqual({ kind: 'relative', reference: 'editor', direction: 'left' });
    expect(defaultPlacement('outline', ['explorer', 'editor'])).toEqual({ kind: 'relative', reference: 'explorer', direction: 'below' });
    expect(defaultPlacement('history', ['outline', 'editor'])).toEqual({ kind: 'relative', reference: 'outline', direction: 'within' });
    expect(defaultPlacement('editor', ['preview'])).toEqual({ kind: 'relative', reference: 'preview', direction: 'left' });
  });
});

describe('persistence', () => {
  it('round-trips a valid layout', () => {
    const raw = serializeLayout(validDock(), ui({ preset: 'default', minimized: { '1': { axis: 'x', prevSize: 200 } } }));
    const parsed = parseLayout(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.ui.minimized['1']).toEqual({ axis: 'x', prevSize: 200 });
    expect(parsed!.ui.visible).toEqual(['explorer', 'editor', 'preview']);
  });

  it('falls back (null) on invalid JSON, wrong version and bad shapes', () => {
    expect(parseLayout(null)).toBeNull();
    expect(parseLayout('')).toBeNull();
    expect(parseLayout('{not json')).toBeNull();
    expect(parseLayout('[]')).toBeNull();
    expect(parseLayout('null')).toBeNull();
    const good = JSON.parse(serializeLayout(validDock(), ui()));
    expect(parseLayout(JSON.stringify({ ...good, version: 99 }))).toBeNull();
    expect(parseLayout(JSON.stringify({ ...good, ui: { ...good.ui, visible: ['nope'] } }))).toBeNull();
    expect(parseLayout(JSON.stringify({ ...good, dock: {} }))).toBeNull();
  });

  it('rejects stale docks (unknown panel, missing panel, inconsistent views)', () => {
    const unknown = validDock();
    (unknown.panels as Record<string, unknown>).ghost = { id: 'ghost' };
    expect(isValidDock(unknown)).toBe(false);

    const missing = validDock();
    delete (missing.panels as Record<string, unknown>).preview;
    expect(isValidDock(missing)).toBe(false);

    const badOrientation = validDock();
    (badOrientation.grid as { orientation: string }).orientation = 'DIAGONAL';
    expect(isValidDock(badOrientation)).toBe(false);

    expect(isValidDock(validDock())).toBe(true);
  });

  it('rejects when ui.visible disagrees with the dock', () => {
    const raw = serializeLayout(validDock(), ui({ visible: ['editor'] }));
    expect(parseLayout(raw)).toBeNull();
  });

  it('loads/saves through a storage object with the per-user key', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveLayout(storage, 'u1', validDock(), ui());
    expect(store.has('mdhub.layout.v1.u1')).toBe(true);
    expect(layoutStorageKey('u1')).toBe('mdhub.layout.v1.u1');
    expect(loadLayout(storage, 'u1')).not.toBeNull();
    expect(loadLayout(storage, 'u2')).toBeNull();
    store.set('mdhub.layout.v1.u1', '{"broken');
    expect(loadLayout(storage, 'u1')).toBeNull();
  });

  it('never throws when storage fails', () => {
    const bad = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('full'); },
    };
    expect(loadLayout(bad, 'u')).toBeNull();
    expect(() => saveLayout(bad, 'u', validDock(), ui())).not.toThrow();
  });
});
