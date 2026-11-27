export const PANEL_IDS = ['explorer', 'outline', 'editor', 'preview', 'history'] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export const PANEL_TITLES: Record<PanelId, string> = {
  explorer: 'Explorer',
  outline: 'Outline',
  editor: 'Editor',
  preview: 'Preview',
  history: 'History',
};

export type PresetId = 'default' | 'write' | 'review' | 'side' | 'focus';

export const PRESETS: ReadonlyArray<{ id: PresetId; label: string; description: string; panels: readonly PanelId[] }> = [
  { id: 'default', label: 'Default', description: 'Explorer, outline, editor and preview', panels: ['explorer', 'outline', 'editor', 'preview'] },
  { id: 'write', label: 'Write', description: 'Editor only', panels: ['editor'] },
  { id: 'review', label: 'Review', description: 'Preview only', panels: ['preview'] },
  { id: 'side', label: 'Side-by-side', description: 'Editor and preview', panels: ['editor', 'preview'] },
  { id: 'focus', label: 'Focus', description: 'Distraction-free editor (Esc to leave)', panels: ['editor'] },
];

export const DEFAULT_VISIBLE: readonly PanelId[] = PRESETS[0].panels;

export const LAYOUT_VERSION = 1;
export const layoutStorageKey = (userId: string): string => `mdhub.layout.v1.${userId}`;

export type Axis = 'x' | 'y';

export interface MinimizedInfo {
  axis: Axis;
  /** size (px) along `axis` before minimising; restored on click */
  prevSize: number;
}

export interface LayoutUiState {
  visible: PanelId[];
  /** keyed by dockview group id */
  minimized: Record<string, MinimizedInfo>;
  /** dockview group id currently maximised (managed by us so Esc / toggles stay consistent) */
  maximized: string | null;
  preset: PresetId | null;
}

export const initialUiState = (): LayoutUiState => ({
  visible: [...DEFAULT_VISIBLE],
  minimized: {},
  maximized: null,
  preset: 'default',
});

export type LayoutAction =
  | { type: 'minimize'; groupId: string; axis: Axis; prevSize: number }
  | { type: 'restore'; groupId: string }
  | { type: 'maximize'; groupId: string }
  | { type: 'exitMaximize' }
  | { type: 'toggleMaximize'; groupId: string }
  | { type: 'hidePanel'; panel: PanelId }
  | { type: 'showPanel'; panel: PanelId }
  | { type: 'togglePanel'; panel: PanelId }
  | { type: 'applyPreset'; preset: PresetId }
  | { type: 'reset' }
  | { type: 'syncVisible'; visible: PanelId[] }
  | { type: 'pruneGroups'; groupIds: readonly string[] };

const orderPanels = (list: Iterable<PanelId>): PanelId[] => {
  const set = new Set(list);
  return PANEL_IDS.filter((p) => set.has(p));
};

export function layoutReducer(state: LayoutUiState, action: LayoutAction): LayoutUiState {
  switch (action.type) {
    case 'minimize': {
      if (state.minimized[action.groupId]) {
        return state;
      }

      return {
        ...state,
        maximized: state.maximized === action.groupId ? null : state.maximized,
        minimized: { ...state.minimized, [action.groupId]: { axis: action.axis, prevSize: Math.max(0, Math.round(action.prevSize)) } },
      };
    }
    case 'restore': {
      if (!state.minimized[action.groupId]) {
        return state;
      }

      const { [action.groupId]: _removed, ...rest } = state.minimized;
      void _removed;
      return { ...state, minimized: rest };
    }
    case 'maximize': {
      if (state.maximized === action.groupId) {
        return state;
      }

      // a maximised group cannot also be a collapsed rail
      const { [action.groupId]: _removed, ...rest } = state.minimized;
      void _removed;
      return { ...state, minimized: rest, maximized: action.groupId };
    }
    case 'exitMaximize':
      return state.maximized === null ? state : { ...state, maximized: null };
    case 'toggleMaximize':
      return layoutReducer(state, state.maximized === action.groupId ? { type: 'exitMaximize' } : { type: 'maximize', groupId: action.groupId });
    case 'hidePanel': {
      if (!state.visible.includes(action.panel)) {
        return state;
      }

      return { ...state, visible: state.visible.filter((p) => p !== action.panel), preset: null };
    }
    case 'showPanel': {
      if (state.visible.includes(action.panel)) {
        return state;
      }

      return { ...state, visible: orderPanels([...state.visible, action.panel]), preset: null };
    }
    case 'togglePanel':
      return layoutReducer(state, { type: state.visible.includes(action.panel) ? 'hidePanel' : 'showPanel', panel: action.panel });
    case 'applyPreset': {
      const preset = PRESETS.find((p) => p.id === action.preset);
      if (!preset) {
        return state;
      }

      return { visible: [...preset.panels], minimized: {}, maximized: null, preset: preset.id };
    }
    case 'reset':
      return initialUiState();
    case 'syncVisible': {
      const visible = orderPanels(action.visible);
      const same = visible.length === state.visible.length && visible.every((p, i) => p === state.visible[i]);
      return same ? state : { ...state, visible, preset: null };
    }
    case 'pruneGroups': {
      const alive = new Set(action.groupIds);
      const minimized = Object.fromEntries(Object.entries(state.minimized).filter(([id]) => alive.has(id)));
      const maximized = state.maximized && alive.has(state.maximized) ? state.maximized : null;
      if (Object.keys(minimized).length === Object.keys(state.minimized).length && maximized === state.maximized) {
        return state;
      }

      return { ...state, minimized, maximized };
    }
    default:
      return state;
  }
}

export type Placement =
  | { kind: 'first' }
  | { kind: 'relative'; reference: PanelId; direction: 'left' | 'right' | 'above' | 'below' | 'within' };

/**
 * Where a panel is (re-)added in the default dock arrangement, given the panels that are currently visible.
 * Layout: [explorer / outline(+history)] | editor | preview.
 */
export function defaultPlacement(panel: PanelId, visible: readonly PanelId[]): Placement {
  const others = visible.filter((p) => p !== panel);
  if (others.length === 0) {
    return { kind: 'first' };
  }

  const has = (p: PanelId) => others.includes(p);
  const rel = (reference: PanelId, direction: 'left' | 'right' | 'above' | 'below' | 'within'): Placement => ({ kind: 'relative', reference, direction });
  const anyOther = others[0];

  switch (panel) {
    case 'editor':
      if (has('preview')) return rel('preview', 'left');
      if (has('explorer')) return rel('explorer', 'right');
      if (has('outline')) return rel('outline', 'right');
      return rel(anyOther, 'right');
    case 'preview':
      if (has('editor')) return rel('editor', 'right');
      return rel(anyOther, 'right');
    case 'explorer':
      if (has('outline')) return rel('outline', 'above');
      if (has('editor')) return rel('editor', 'left');
      return rel(anyOther, 'left');
    case 'outline':
      if (has('explorer')) return rel('explorer', 'below');
      if (has('editor')) return rel('editor', 'left');
      return rel(anyOther, 'left');
    case 'history':
      if (has('outline')) return rel('outline', 'within');
      if (has('explorer')) return rel('explorer', 'within');
      if (has('editor')) return rel('editor', 'left');
      return rel(anyOther, 'left');
  }
}

export interface PersistedLayout {
  version: number;
  dock: unknown;
  ui: Pick<LayoutUiState, 'visible' | 'minimized' | 'preset'>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPanelId = (v: unknown): v is PanelId => typeof v === 'string' && (PANEL_IDS as readonly string[]).includes(v);

function collectLeafViews(node: unknown, out: string[], depth = 0): boolean {
  if (!isObj(node) || depth > 12) {
    return false;
  }

  if (node.type === 'leaf') {
    const data = node.data;
    if (!isObj(data) || !Array.isArray(data.views) || data.views.length === 0) {
      return false;
    }

    for (const v of data.views) {
      if (typeof v !== 'string') {
        return false;
      }

      out.push(v);
    }

    return true;
  }

  if (node.type === 'branch') {
    if (!Array.isArray(node.data) || node.data.length === 0) {
      return false;
    }

    return node.data.every((child) => collectLeafViews(child, out, depth + 1));
  }

  return false;
}

/** Structural validation of a dockview `toJSON()` payload. Anything unexpected makes the saved layout unusable. */
export function isValidDock(dock: unknown): boolean {
  if (!isObj(dock) || !isObj(dock.grid) || !isObj(dock.panels)) {
    return false;
  }

  const grid = dock.grid;
  if (typeof grid.width !== 'number' || typeof grid.height !== 'number' || !(grid.width > 0) || !(grid.height > 0)) {
    return false;
  }

  if (grid.orientation !== 'HORIZONTAL' && grid.orientation !== 'VERTICAL') {
    return false;
  }

  const panelEntries = Object.entries(dock.panels);
  if (panelEntries.length === 0) {
    return false;
  }

  for (const [key, value] of panelEntries) {
    if (!isPanelId(key) || !isObj(value) || value.id !== key) {
      return false;
    }
  }

  const views: string[] = [];
  if (!collectLeafViews(grid.root, views)) {
    return false;
  }

  if (Array.isArray(dock.popoutGroups) && dock.popoutGroups.length > 0) {
    return false;
  }

  if (dock.floatingGroups !== undefined) {
    if (!Array.isArray(dock.floatingGroups)) {
      return false;
    }

    for (const fg of dock.floatingGroups) {
      if (!isObj(fg) || !isObj(fg.data) || !Array.isArray(fg.data.views) || fg.data.views.some((v) => typeof v !== 'string')) {
        return false;
      }

      views.push(...(fg.data.views as string[]));
    }
  }

  const unique = new Set(views);
  return unique.size === views.length && views.length === panelEntries.length && views.every((v) => v in (dock.panels as object));
}

export function serializeLayout(dock: unknown, ui: LayoutUiState): string {
  const payload: PersistedLayout = {
    version: LAYOUT_VERSION,
    dock,
    ui: { visible: ui.visible, minimized: ui.minimized, preset: ui.preset },
  };
  return JSON.stringify(payload);
}

/** Parses a persisted layout. Returns null (=> use the default layout) for anything invalid or stale. */
export function parseLayout(raw: string | null | undefined): PersistedLayout | null {
  if (!raw) {
    return null;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isObj(data) || data.version !== LAYOUT_VERSION || !isObj(data.ui) || !isValidDock(data.dock)) {
    return null;
  }

  const ui = data.ui;
  if (!Array.isArray(ui.visible) || !ui.visible.every(isPanelId)) {
    return null;
  }

  const dockPanels = Object.keys((data.dock as { panels: object }).panels);
  const visible = orderPanels(ui.visible);
  if (visible.length !== dockPanels.length || !visible.every((p) => dockPanels.includes(p))) {
    return null;
  }

  const minimized: Record<string, MinimizedInfo> = {};
  if (isObj(ui.minimized)) {
    for (const [id, info] of Object.entries(ui.minimized)) {
      if (isObj(info) && (info.axis === 'x' || info.axis === 'y') && typeof info.prevSize === 'number' && info.prevSize >= 0) {
        minimized[id] = { axis: info.axis, prevSize: info.prevSize };
      }
    }
  }

  const preset = PRESETS.some((p) => p.id === ui.preset) ? (ui.preset as PresetId) : null;
  return { version: LAYOUT_VERSION, dock: data.dock, ui: { visible, minimized, preset } };
}

export function loadLayout(storage: Pick<Storage, 'getItem'>, userId: string): PersistedLayout | null {
  try {
    return parseLayout(storage.getItem(layoutStorageKey(userId)));
  } catch {
    return null;
  }
}

export function saveLayout(storage: Pick<Storage, 'setItem'>, userId: string, dock: unknown, ui: LayoutUiState): void {
  try {
    storage.setItem(layoutStorageKey(userId), serializeLayout(dock, ui));
  } catch {
    /* storage full / disabled: the layout simply is not persisted */
  }
}
