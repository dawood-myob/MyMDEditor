import type { DockviewGroupPanel } from 'dockview';
import type { ReactNode } from 'react';
import { PANEL_TITLES, type PanelId } from '../lib/layoutState';
import { IconEye, IconFolder, IconHistory, IconEdit, IconList } from '../ui/icons';
import { useDockController, useDockSnapshot } from './DockContext';

export const PANEL_ICONS: Record<PanelId, ReactNode> = {
  explorer: <IconFolder size={16} />,
  outline: <IconList size={16} />,
  editor: <IconEdit size={16} />,
  preview: <IconEye size={16} />,
  history: <IconHistory size={16} />,
};

/** Slim rail shown in place of a side group that was minimised: icon + rotated title, click to restore. */
export function Rail({ group }: { group: DockviewGroupPanel }) {
  const ctl = useDockController();
  useDockSnapshot(ctl);
  const panel = group.activePanel ?? group.panels[0];
  const id = (panel?.id ?? 'editor') as PanelId;
  const title = PANEL_TITLES[id] ?? 'Panel';
  return (
    <button
      type="button"
      className="ws-rail-btn"
      data-testid={`rail-${id}`}
      aria-label={`Restore ${title}`}
      title={`Restore ${title}`}
      onClick={() => ctl.restore(group.id)}
    >
      {PANEL_ICONS[id]}
      <span className="ws-rail-title">{title}</span>
    </button>
  );
}
