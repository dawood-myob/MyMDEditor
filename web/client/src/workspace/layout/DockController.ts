import { createDockview, type AddPanelOptions, type DockviewApi, type DockviewGroupPanel, type IDockviewPanel } from 'dockview';
import {
  defaultPlacement,
  DEFAULT_VISIBLE,
  initialUiState,
  layoutReducer,
  loadLayout,
  PANEL_IDS,
  PANEL_TITLES,
  PRESETS,
  saveLayout,
  type LayoutAction,
  type LayoutUiState,
  type PanelId,
  type PresetId,
} from '../lib/layoutState';
import { minimizeAxisFor } from './dockUtil';

export interface DockHooks {
  mountPanel(id: PanelId, el: HTMLElement): () => void;
  mountActions(group: DockviewGroupPanel, el: HTMLElement): () => void;
  mountRail(group: DockviewGroupPanel, el: HTMLElement): () => void;
  onReset(): void;
}

export interface DockSnapshot {
  ui: LayoutUiState;
  /** bumped on every structural change so views can re-read dockview state (floating, active panel, ...) */
  rev: number;
}

export const EMPTY_SNAPSHOT: DockSnapshot = { ui: initialUiState(), rev: 0 };

const RAIL_PX = 38;
const MIN_W = 100;
const MIN_H = 80;
const MAX_PX = Number.MAX_SAFE_INTEGER;
const PANEL_ORDER: readonly PanelId[] = ['editor', 'preview', 'explorer', 'outline', 'history'];

const isPanelId = (v: string): v is PanelId => (PANEL_IDS as readonly string[]).includes(v);
const DIRECTION_TO_POSITION = { left: 'left', right: 'right', above: 'top', below: 'bottom', within: 'center' } as const;
export type DockPosition = 'left' | 'right' | 'top' | 'bottom' | 'center';

interface FocusMemory { dock: unknown; ui: LayoutUiState }

/** Owns the dockview instance plus everything we add on top: minimise rails, maximise/Esc, hide/show, presets, persistence. */
export class DockController {
  readonly api: DockviewApi;
  private ui: LayoutUiState = initialUiState();
  private snapshot: DockSnapshot = { ui: this.ui, rev: 0 };
  private listeners = new Set<() => void>();
  private building = 0;
  private disposed = false;
  private saveTimer: number | undefined;
  private focusMemory: FocusMemory | null = null;
  private rails = new Map<string, { el: HTMLElement; unmount: () => void }>();
  private cleanups: Array<() => void> = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly userId: string,
    private readonly hooks: DockHooks,
  ) {
    this.api = createDockview(root, {
      theme: { name: 'mdhub', className: 'dockview-theme-mdhub' },
      defaultRenderer: 'onlyWhenVisible',
      floatingGroupBounds: 'boundedWithinViewport',
      createComponent: ({ name }) => {
        const el = document.createElement('div');
        el.className = 'ws-panel-host';
        let unmount: (() => void) | undefined;
        return {
          element: el,
          init: () => {
            if (isPanelId(name)) unmount = hooks.mountPanel(name, el);
          },
          dispose: () => unmount?.(),
        };
      },
      createRightHeaderActionComponent: (group) => {
        const el = document.createElement('div');
        el.className = 'ws-group-actions';
        let unmount: (() => void) | undefined;
        return {
          element: el,
          init: () => {
            unmount = hooks.mountActions(group, el);
          },
          dispose: () => unmount?.(),
        };
      },
      createWatermarkComponent: () => {
        const el = document.createElement('div');
        el.className = 'ws-watermark';
        const text = document.createElement('p');
        text.textContent = 'All panels are hidden.';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary';
        btn.textContent = 'Reset layout';
        btn.addEventListener('click', () => hooks.onReset());
        el.append(text, btn);
        return { element: el, init: () => undefined, dispose: () => undefined };
      },
    });

    const sub = (d: { dispose: () => void }) => this.cleanups.push(() => d.dispose());
    sub(this.api.onDidLayoutChange(() => this.onLayoutChange()));
    sub(this.api.onDidAddPanel(() => this.syncVisible()));
    sub(this.api.onDidRemovePanel(() => this.syncVisible()));
    sub(this.api.onDidActivePanelChange(() => this.bump()));
    sub(
      this.api.onDidMaximizedGroupChange((e) => {
        this.dispatch(e.isMaximized ? { type: 'maximize', groupId: e.group.id } : { type: 'exitMaximize' });
      }),
    );

    const onDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest('button, input, select, textarea, a')) return;
      if (!target.closest('.dv-tab, .dv-void-container')) return;
      const group = this.api.groups.find((g) => g.element.contains(target));
      if (group) this.toggleMaximize(group.id);
    };
    root.addEventListener('dblclick', onDblClick);
    this.cleanups.push(() => root.removeEventListener('dblclick', onDblClick));
  }

  // ---- external store -------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): DockSnapshot => this.snapshot;

  private bump(): void {
    if (this.disposed) return;
    this.snapshot = { ui: this.ui, rev: this.snapshot.rev + 1 };
    this.listeners.forEach((l) => l());
  }

  private dispatch(action: LayoutAction): void {
    const next = layoutReducer(this.ui, action);
    if (next !== this.ui) {
      this.ui = next;
      this.bump();
      this.scheduleSave();
    }
  }

  private setUi(ui: LayoutUiState): void {
    this.ui = ui;
    this.bump();
    this.scheduleSave();
  }

  // ---- lifecycle -------------------------------------------------------------------------------

  /** Restores the saved layout, falling back to the default one when it is missing, invalid or stale. */
  init(): void {
    const saved = loadLayout(localStorage, this.userId);
    let restored = false;
    if (saved) {
      this.building++;
      try {
        this.api.fromJSON(saved.dock as Parameters<DockviewApi['fromJSON']>[0]);
        const ids = this.api.panels.map((p) => p.id).sort();
        const want = [...saved.ui.visible].sort();
        restored = ids.length === want.length && ids.every((id, i) => id === want[i]);
      } catch {
        restored = false;
      } finally {
        this.building--;
      }

      if (restored) {
        if (this.api.hasMaximizedGroup()) this.api.exitMaximizedGroup();
        this.ui = { visible: saved.ui.visible, minimized: {}, maximized: null, preset: saved.ui.preset };
        for (const [gid, info] of Object.entries(saved.ui.minimized)) {
          const group = this.groupById(gid);
          if (group && group.api.location.type === 'grid') {
            this.ui = { ...this.ui, minimized: { ...this.ui.minimized, [gid]: info } };
            this.applyMinimized(group, info.axis);
          }
        }

        this.bump();
      }
    }

    if (!restored) {
      this.resetToDefault();
    }
  }

  dispose(): void {
    this.disposed = true;
    window.clearTimeout(this.saveTimer);
    this.saveNow();
    this.cleanups.forEach((c) => c());
    this.rails.forEach((r) => r.unmount());
    this.rails.clear();
    this.listeners.clear();
    this.api.dispose();
  }

  // ---- building --------------------------------------------------------------------------------

  private addDocked(id: PanelId, present: readonly PanelId[]): void {
    const placement = defaultPlacement(id, present);
    const options: AddPanelOptions = { id, component: id, title: PANEL_TITLES[id] };
    if (placement.kind === 'relative') {
      options.position = { referencePanel: placement.reference, direction: placement.direction };
    }

    this.api.addPanel(options);
  }

  private build(visible: readonly PanelId[]): void {
    this.building++;
    try {
      if (this.api.hasMaximizedGroup()) this.api.exitMaximizedGroup();
      this.api.clear();
      this.clearRails();
      const present: PanelId[] = [];
      for (const id of PANEL_ORDER.filter((p) => visible.includes(p))) {
        this.addDocked(id, present);
        present.push(id);
      }

      this.applyDefaultSizes();
    } finally {
      this.building--;
    }
  }

  private applyDefaultSizes(): void {
    const w = this.api.width || this.root.clientWidth;
    const h = this.api.height || this.root.clientHeight;
    const setW = (id: PanelId, px: number) => {
      try {
        this.api.getPanel(id)?.group.api.setSize({ width: Math.round(px) });
      } catch {
        /* sizing is best effort */
      }
    };

    if (w > 0) {
      setW('explorer', Math.min(300, Math.max(200, w * 0.2)));
      if (!this.api.getPanel('explorer') && this.api.getPanel('outline')) setW('outline', Math.min(300, Math.max(200, w * 0.2)));
      setW('preview', w * (this.api.getPanel('explorer') ? 0.34 : 0.45));
    }

    if (h > 0 && this.api.getPanel('explorer') && this.api.getPanel('outline')) {
      try {
        this.api.getPanel('explorer')?.group.api.setSize({ height: Math.round(h * 0.55) });
      } catch {
        /* ignore */
      }
    }
  }

  private resetToDefault(): void {
    this.build(DEFAULT_VISIBLE);
    this.setUi(initialUiState());
  }

  private clearRails(): void {
    this.rails.forEach((r) => {
      r.unmount();
      r.el.remove();
    });
    this.rails.clear();
  }

  // ---- change tracking --------------------------------------------------------------------------

  private syncVisible(): void {
    if (this.building || this.disposed) return;
    const ids = this.api.panels.map((p) => p.id).filter(isPanelId);
    this.dispatch({ type: 'syncVisible', visible: ids });
    this.bump();
  }

  private onLayoutChange(): void {
    if (this.building || this.disposed) return;
    const alive = this.api.groups.map((g) => g.id);
    this.dispatch({ type: 'pruneGroups', groupIds: alive });
    for (const [gid, rail] of this.rails) {
      if (!alive.includes(gid)) {
        rail.unmount();
        rail.el.remove();
        this.rails.delete(gid);
      }
    }

    this.bump();
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.disposed) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), 250);
  }

  private saveNow(): void {
    if (this.building || this.api.width <= 0 || this.api.height <= 0 || this.api.panels.length === 0) return;
    if (this.api.hasMaximizedGroup()) return;
    try {
      saveLayout(localStorage, this.userId, this.api.toJSON(), this.ui);
    } catch {
      /* never let persistence break the UI */
    }
  }

  private groupById(id: string): DockviewGroupPanel | undefined {
    return this.api.groups.find((g) => g.id === id);
  }

  // ---- panels ----------------------------------------------------------------------------------

  isVisible(id: PanelId): boolean {
    return !!this.api.getPanel(id);
  }

  showPanel(id: PanelId): void {
    const existing = this.api.getPanel(id);
    if (existing) {
      existing.api.setActive();
      return;
    }

    if (this.api.hasMaximizedGroup()) this.api.exitMaximizedGroup();
    const present = this.api.panels.map((p) => p.id).filter(isPanelId);
    this.addDocked(id, present);
    if (id === 'explorer' && present.length > 0) {
      try {
        this.api.getPanel(id)?.group.api.setSize({ width: 280 });
      } catch {
        /* ignore */
      }
    }

    this.syncVisible();
  }

  hidePanel(id: PanelId): void {
    this.api.getPanel(id)?.api.close();
  }

  togglePanel(id: PanelId): void {
    if (this.isVisible(id)) this.hidePanel(id);
    else this.showPanel(id);
  }

  applyPreset(preset: PresetId): void {
    const def = PRESETS.find((p) => p.id === preset);
    if (!def) return;
    if (preset === 'focus' && this.ui.preset !== 'focus') {
      this.focusMemory = { dock: this.safeToJson(), ui: this.ui };
    }

    this.build(def.panels);
    this.setUi({ visible: [...def.panels], minimized: {}, maximized: null, preset });
  }

  reset(): void {
    this.focusMemory = null;
    this.resetToDefault();
    this.saveNow();
  }

  exitFocus(): void {
    if (this.ui.preset !== 'focus') return;
    const memory = this.focusMemory;
    this.focusMemory = null;
    if (memory && this.restoreSnapshot(memory)) return;
    this.applyPreset('default');
  }

  private safeToJson(): unknown {
    try {
      return this.api.panels.length > 0 ? this.api.toJSON() : null;
    } catch {
      return null;
    }
  }

  private restoreSnapshot(memory: FocusMemory): boolean {
    if (!memory.dock) return false;
    this.building++;
    let ok = false;
    try {
      this.clearRails();
      this.api.fromJSON(memory.dock as Parameters<DockviewApi['fromJSON']>[0]);
      ok = this.api.panels.length === memory.ui.visible.length;
    } catch {
      ok = false;
    } finally {
      this.building--;
    }

    if (!ok) return false;
    this.setUi({ visible: memory.ui.visible, minimized: {}, maximized: null, preset: memory.ui.preset });
    for (const [gid, info] of Object.entries(memory.ui.minimized)) {
      const group = this.groupById(gid);
      if (group) {
        this.ui = { ...this.ui, minimized: { ...this.ui.minimized, [gid]: info } };
        this.applyMinimized(group, info.axis);
      }
    }

    this.bump();
    return true;
  }

  // ---- minimise / maximise ---------------------------------------------------------------------

  isMinimized(groupId: string): boolean {
    return !!this.ui.minimized[groupId];
  }

  canMinimize(group: DockviewGroupPanel): boolean {
    if (group.api.location.type !== 'grid') return false;
    const panel = group.activePanel ?? group.panels[0];
    return !!panel && (this.isMinimized(group.id) || minimizeAxisFor(this.safeToJson(), panel.id) !== null);
  }

  toggleMinimize(groupId: string): void {
    if (this.isMinimized(groupId)) this.restore(groupId);
    else this.minimize(groupId);
  }

  minimize(groupId: string): void {
    const group = this.groupById(groupId);
    if (!group || this.isMinimized(groupId) || group.api.location.type !== 'grid') return;
    const panel = group.activePanel ?? group.panels[0];
    if (!panel) return;
    if (this.api.hasMaximizedGroup()) this.api.exitMaximizedGroup();
    const axis = minimizeAxisFor(this.safeToJson(), panel.id);
    if (!axis) return;
    const size = axis === 'x' ? group.api.width : group.api.height;
    this.dispatch({ type: 'minimize', groupId, axis, prevSize: size });
    this.applyMinimized(group, axis);
  }

  restore(groupId: string): void {
    const info = this.ui.minimized[groupId];
    const group = this.groupById(groupId);
    if (!info) return;
    this.dispatch({ type: 'restore', groupId });
    if (!group) return;
    this.removeRail(groupId);
    group.element.classList.remove('ws-min', 'ws-min-x', 'ws-min-y');
    try {
      group.api.setConstraints({ minimumWidth: MIN_W, maximumWidth: MAX_PX, minimumHeight: MIN_H, maximumHeight: MAX_PX });
      const fallback = info.axis === 'x' ? 280 : 200;
      const size = info.prevSize > RAIL_PX * 2 ? info.prevSize : fallback;
      group.api.setSize(info.axis === 'x' ? { width: size } : { height: size });
    } catch {
      /* ignore */
    }
  }

  private applyMinimized(group: DockviewGroupPanel, axis: 'x' | 'y'): void {
    group.element.classList.add('ws-min', axis === 'x' ? 'ws-min-x' : 'ws-min-y');
    try {
      if (axis === 'x') {
        group.api.setConstraints({ minimumWidth: RAIL_PX, maximumWidth: RAIL_PX });
        group.api.setSize({ width: RAIL_PX });
      } else {
        const header = group.element.querySelector<HTMLElement>('.dv-tabs-and-actions-container');
        const px = Math.max(30, header?.offsetHeight || 34);
        group.api.setConstraints({ minimumHeight: px, maximumHeight: px });
        group.api.setSize({ height: px });
      }
    } catch {
      /* ignore */
    }

    if (axis === 'x') this.addRail(group);
  }

  private addRail(group: DockviewGroupPanel): void {
    if (this.rails.has(group.id)) return;
    const el = document.createElement('div');
    el.className = 'ws-rail';
    group.element.appendChild(el);
    this.rails.set(group.id, { el, unmount: this.hooks.mountRail(group, el) });
  }

  private removeRail(groupId: string): void {
    const rail = this.rails.get(groupId);
    if (!rail) return;
    rail.unmount();
    rail.el.remove();
    this.rails.delete(groupId);
  }

  toggleMaximize(groupId: string): void {
    const group = this.groupById(groupId);
    if (!group) return;
    if (group.api.isMaximized()) {
      this.api.exitMaximizedGroup();
      return;
    }

    if (this.isMinimized(groupId)) this.restore(groupId);
    const panel = group.activePanel ?? group.panels[0];
    if (panel) this.api.maximizeGroup(panel);
  }

  exitMaximize(): boolean {
    if (!this.api.hasMaximizedGroup()) return false;
    this.api.exitMaximizedGroup();
    return true;
  }

  // ---- floating / docking ----------------------------------------------------------------------

  isFloating(group: DockviewGroupPanel): boolean {
    return group.api.location.type === 'floating';
  }

  canFloat(group: DockviewGroupPanel): boolean {
    return this.isFloating(group) || this.api.panels.length > 1;
  }

  toggleFloat(groupId: string): void {
    const group = this.groupById(groupId);
    const panel = group?.activePanel ?? group?.panels[0];
    if (!group || !panel) return;
    if (this.isFloating(group)) this.dockBack(panel);
    else this.float(panel, group);
  }

  private float(panel: IDockviewPanel, group: DockviewGroupPanel): void {
    if (this.api.hasMaximizedGroup()) this.api.exitMaximizedGroup();
    if (this.isMinimized(group.id)) this.restore(group.id);
    const w = this.api.width || this.root.clientWidth;
    const h = this.api.height || this.root.clientHeight;
    const width = Math.round(Math.min(560, Math.max(280, w * 0.4)));
    const height = Math.round(Math.min(460, Math.max(220, h * 0.6)));
    this.api.addFloatingGroup(panel, { x: Math.max(16, Math.round((w - width) / 2)), y: Math.max(16, Math.round(h * 0.12)), width, height });
  }

  private dockBack(panel: IDockviewPanel): void {
    const others = this.api.panels.filter((p) => p.id !== panel.id && p.group.api.location.type === 'grid').map((p) => p.id).filter(isPanelId);
    const id = panel.id as PanelId;
    const placement = defaultPlacement(id, others);
    if (placement.kind === 'relative') {
      const ref = this.api.getPanel(placement.reference);
      if (ref) {
        panel.api.moveTo({ group: ref.group, position: DIRECTION_TO_POSITION[placement.direction] });
        return;
      }
    }

    this.applyPreset('default');
  }

  /** Keyboard-accessible alternative to dragging: dock `panelId` next to / on top of `targetId`. */
  dockPanelTo(panelId: PanelId, targetId: PanelId, position: DockPosition): void {
    const panel = this.api.getPanel(panelId);
    const target = this.api.getPanel(targetId);
    if (!panel || !target || panelId === targetId) return;
    if (this.api.hasMaximizedGroup()) this.api.exitMaximizedGroup();
    if (this.isMinimized(target.group.id)) this.restore(target.group.id);
    panel.api.moveTo({ group: target.group, position });
  }

  get activeGroup(): DockviewGroupPanel | undefined {
    return this.api.activeGroup ?? this.api.groups[0];
  }

  get visiblePanels(): PanelId[] {
    return this.api.panels.map((p) => p.id).filter(isPanelId);
  }
}
