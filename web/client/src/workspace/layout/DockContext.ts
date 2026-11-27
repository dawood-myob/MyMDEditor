import { createContext, useContext, useSyncExternalStore } from 'react';
import { EMPTY_SNAPSHOT, type DockController, type DockSnapshot } from './DockController';

export const DockContext = createContext<DockController | null>(null);

export function useDockController(): DockController {
  const ctl = useContext(DockContext);
  if (!ctl) throw new Error('useDockController must be used inside <DockHost>');
  return ctl;
}

const noopSubscribe = () => () => undefined;
const emptySnapshot = () => EMPTY_SNAPSHOT;

/** Re-renders whenever the dock layout (visible panels, minimised/maximised groups, floating, active panel) changes. */
export function useDockSnapshot(ctl: DockController | null): DockSnapshot {
  return useSyncExternalStore(ctl ? ctl.subscribe : noopSubscribe, ctl ? ctl.getSnapshot : emptySnapshot);
}
