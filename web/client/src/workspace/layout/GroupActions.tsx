import type { DockviewGroupPanel } from 'dockview';
import { PANEL_TITLES, type PanelId } from '../lib/layoutState';
import { IconClose, IconDock, IconFloat, IconMaximize, IconMinimize, IconRestore } from '../ui/icons';
import { useDockController, useDockSnapshot } from './DockContext';

/** Minimise / maximise / float / hide buttons rendered in every group header. */
export function GroupActions({ group }: { group: DockviewGroupPanel }) {
  const ctl = useDockController();
  useDockSnapshot(ctl);
  const panel = group.activePanel ?? group.panels[0];
  if (!panel) return null;

  const id = panel.id as PanelId;
  const title = PANEL_TITLES[id] ?? panel.title ?? id;
  const minimized = ctl.isMinimized(group.id);
  const maximized = group.api.isMaximized();
  const floating = ctl.isFloating(group);
  const canMin = ctl.canMinimize(group) && !maximized;
  const canFloat = ctl.canFloat(group);

  return (
    <div className="ws-actions" role="toolbar" aria-label={`${title} panel actions`} data-group-panel={id}>
      {canMin && (
        <button
          type="button"
          className="ws-iconbtn"
          data-action="minimize"
          aria-label={`${minimized ? 'Restore' : 'Minimise'} ${title}`}
          title={minimized ? 'Restore' : 'Minimise'}
          onClick={() => ctl.toggleMinimize(group.id)}
        >
          {minimized ? <IconRestore size={14} /> : <IconMinimize size={14} />}
        </button>
      )}
      <button
        type="button"
        className="ws-iconbtn"
        data-action="maximize"
        aria-label={`${maximized ? 'Restore' : 'Maximise'} ${title}`}
        aria-pressed={maximized}
        title={maximized ? 'Restore (Esc)' : 'Maximise (double-click tab)'}
        onClick={() => ctl.toggleMaximize(group.id)}
      >
        {maximized ? <IconRestore size={14} /> : <IconMaximize size={14} />}
      </button>
      {canFloat && (
        <button
          type="button"
          className="ws-iconbtn"
          data-action="float"
          aria-label={`${floating ? 'Dock' : 'Float'} ${title}`}
          title={floating ? 'Dock panel' : 'Float panel'}
          onClick={() => ctl.toggleFloat(group.id)}
        >
          {floating ? <IconDock size={14} /> : <IconFloat size={14} />}
        </button>
      )}
      <button
        type="button"
        className="ws-iconbtn"
        data-action="hide"
        aria-label={`Hide ${title}`}
        title="Hide (View menu brings it back)"
        onClick={() => ctl.hidePanel(id)}
      >
        <IconClose size={14} />
      </button>
    </div>
  );
}
