import { useMemo, useRef, useState } from 'react';
import { PANEL_IDS, PANEL_TITLES, PRESETS, type PanelId } from '../lib/layoutState';
import { IconLayout } from '../ui/icons';
import { MenuButton, type MenuEntry } from '../ui/Menu';
import { Modal } from '../ui/Modal';
import type { DockController, DockPosition } from './DockController';
import { useDockSnapshot } from './DockContext';

const POSITIONS: Array<{ value: DockPosition; label: string }> = [
  { value: 'left', label: 'To the left of' },
  { value: 'right', label: 'To the right of' },
  { value: 'top', label: 'Above' },
  { value: 'bottom', label: 'Below' },
  { value: 'center', label: 'As a tab next to' },
];

function DockPanelDialog({ ctl, onClose }: { ctl: DockController; onClose: () => void }) {
  const visible = ctl.visiblePanels;
  const [panel, setPanel] = useState<PanelId>(visible[0] ?? 'editor');
  const targets = useMemo(() => visible.filter((p) => p !== panel), [visible, panel]);
  const [target, setTarget] = useState<PanelId | ''>('');
  const [position, setPosition] = useState<DockPosition>('right');
  const firstRef = useRef<HTMLSelectElement>(null);
  const effectiveTarget = target && targets.includes(target) ? target : (targets[0] ?? '');

  return (
    <Modal
      title="Dock panel"
      onClose={onClose}
      initialFocus={firstRef}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!effectiveTarget}
            onClick={() => {
              if (effectiveTarget) ctl.dockPanelTo(panel, effectiveTarget, position);
              onClose();
            }}
          >
            Dock
          </button>
        </>
      }
    >
      <div className="ws-dock-form">
        <label className="field">
          <span>Panel</span>
          <select ref={firstRef} className="input" value={panel} onChange={(e) => setPanel(e.target.value as PanelId)}>
            {visible.map((p) => (
              <option key={p} value={p}>
                {PANEL_TITLES[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Position</span>
          <select className="input" value={position} onChange={(e) => setPosition(e.target.value as DockPosition)}>
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Reference panel</span>
          <select className="input" value={effectiveTarget} onChange={(e) => setTarget(e.target.value as PanelId)} disabled={targets.length === 0}>
            {targets.map((p) => (
              <option key={p} value={p}>
                {PANEL_TITLES[p]}
              </option>
            ))}
          </select>
        </label>
        {targets.length === 0 && <p className="muted">Show another panel first.</p>}
      </div>
    </Modal>
  );
}

/** Header "View" menu: panels with checkmarks, layout presets, keyboard alternatives to dragging, reset. */
export function ViewMenu({ ctl }: { ctl: DockController | null }) {
  const snap = useDockSnapshot(ctl);
  const [dockDialog, setDockDialog] = useState(false);

  const build = (): MenuEntry[] => {
    if (!ctl) return [];
    const group = ctl.activeGroup;
    const entries: MenuEntry[] = [{ type: 'heading', id: 'h-panels', label: 'Panels' }];
    for (const id of PANEL_IDS) {
      entries.push({ id: `panel-${id}`, label: PANEL_TITLES[id], checked: ctl.isVisible(id), onSelect: () => ctl.togglePanel(id) });
    }

    entries.push({ type: 'separator', id: 's1' }, { type: 'heading', id: 'h-presets', label: 'Layout presets' });
    for (const p of PRESETS) {
      entries.push({ id: `preset-${p.id}`, label: p.label, checked: snap.ui.preset === p.id, onSelect: () => ctl.applyPreset(p.id) });
    }

    entries.push(
      { type: 'separator', id: 's2' },
      {
        id: 'maximize',
        label: group?.api.isMaximized() ? 'Restore active panel' : 'Maximise active panel',
        shortcut: 'Esc',
        disabled: !group,
        onSelect: () => group && ctl.toggleMaximize(group.id),
      },
      {
        id: 'minimize',
        label: group && ctl.isMinimized(group.id) ? 'Expand active panel' : 'Minimise active panel',
        disabled: !group || !ctl.canMinimize(group),
        onSelect: () => group && ctl.toggleMinimize(group.id),
      },
      {
        id: 'float',
        label: group && ctl.isFloating(group) ? 'Dock active panel' : 'Float active panel',
        disabled: !group || !ctl.canFloat(group),
        onSelect: () => group && ctl.toggleFloat(group.id),
      },
      { id: 'dock-dialog', label: 'Dock panel…', onSelect: () => setDockDialog(true) },
      { type: 'separator', id: 's3' },
      { id: 'reset', label: 'Reset layout', onSelect: () => ctl.reset() },
    );
    return entries;
  };

  return (
    <>
      <MenuButton label="View" className="ws-menubtn" testId="menu-view" items={build} disabled={!ctl}>
        <IconLayout size={15} /> <span className="ws-menubtn-label">View</span>
      </MenuButton>
      {dockDialog && ctl && <DockPanelDialog ctl={ctl} onClose={() => setDockDialog(false)} />}
    </>
  );
}
