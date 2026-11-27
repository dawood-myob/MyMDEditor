import type { DockviewGroupPanel } from 'dockview';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import EditorPanel from '../editor/EditorPanel';
import ExplorerPanel from '../explorer/ExplorerPanel';
import HistoryPanel from '../history/HistoryPanel';
import { PANEL_TITLES, type PanelId } from '../lib/layoutState';
import OutlinePanel from '../outline/OutlinePanel';
import PreviewPanel from '../preview/PreviewPanel';
import { PanelBoundary } from '../ui/PanelBoundary';
import { DockContext } from './DockContext';
import { DockController } from './DockController';
import { GroupActions } from './GroupActions';
import { Rail } from './Rail';

export const PANEL_COMPONENTS: Record<PanelId, ComponentType> = {
  explorer: ExplorerPanel,
  outline: OutlinePanel,
  editor: EditorPanel,
  preview: PreviewPanel,
  history: HistoryPanel,
};

interface Mounted<T> { key: string; el: HTMLElement; value: T }

function useRegistry<T>() {
  const [items, setItems] = useState<Array<Mounted<T>>>([]);
  const add = (key: string, el: HTMLElement, value: T) => {
    setItems((cur) => [...cur.filter((i) => i.key !== key), { key, el, value }]);
    return () => setItems((cur) => cur.filter((i) => !(i.key === key && i.el === el)));
  };

  return [items, add, () => setItems([])] as const;
}

interface Props {
  userId: string;
  focus: boolean;
  onController: (ctl: DockController | null) => void;
}

/** Thin React binding over vanilla dockview: every panel / header action / rail is a portal into an element dockview owns. */
export function DockHost({ userId, focus, onController }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ctl, setCtl] = useState<DockController | null>(null);
  const [panels, addPanel, clearPanels] = useRegistry<PanelId>();
  const [actions, addActions, clearActions] = useRegistry<DockviewGroupPanel>();
  const [rails, addRail, clearRails] = useRegistry<DockviewGroupPanel>();
  const onControllerRef = useRef(onController);
  onControllerRef.current = onController;
  const registry = useRef({ addPanel, addActions, addRail });
  registry.current = { addPanel, addActions, addRail };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let seq = 0;
    const controller = new DockController(root, userId, {
      mountPanel: (id, el) => registry.current.addPanel(id, el, id),
      mountActions: (group, el) => registry.current.addActions(`${group.id}:${seq++}`, el, group),
      mountRail: (group, el) => registry.current.addRail(group.id, el, group),
      onReset: () => controller.reset(),
    });
    controller.init();
    setCtl(controller);
    onControllerRef.current(controller);
    return () => {
      onControllerRef.current(null);
      setCtl(null);
      controller.dispose();
      clearPanels();
      clearActions();
      clearRails();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <DockContext.Provider value={ctl}>
      <div ref={rootRef} className={`ws-dock dockview-theme-mdhub${focus ? ' is-focus' : ''}`} data-testid="dock" />
      {ctl &&
        panels.map(({ key, el, value }) => {
          const Panel = PANEL_COMPONENTS[value];
          return createPortal(
            <PanelBoundary name={PANEL_TITLES[value]}>
              <Panel />
            </PanelBoundary>,
            el,
            key,
          );
        })}
      {ctl && actions.map(({ key, el, value }) => createPortal(<GroupActions group={value} />, el, key))}
      {ctl && rails.map(({ key, el, value }) => createPortal(<Rail group={value} />, el, key))}
    </DockContext.Provider>
  );
}
