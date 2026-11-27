import type { Axis } from '../lib/layoutState';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Along which axis a docked group shares space with its siblings, derived from a dockview `toJSON()` grid:
 * the group's parent branch lays children out in a row ('x') or a column ('y').
 * Returns null when the group is the only one in the grid (nothing to collapse into) or is not in the grid (floating).
 */
export function minimizeAxisFor(dock: unknown, panelId: string): Axis | null {
  if (!isObj(dock) || !isObj(dock.grid)) {
    return null;
  }

  const rootOrientation = dock.grid.orientation === 'VERTICAL' ? 'y' : 'x';
  const flip = (a: Axis): Axis => (a === 'x' ? 'y' : 'x');

  const walk = (node: unknown, orientation: Axis, depth: number): Axis | null | undefined => {
    if (!isObj(node) || depth > 12) {
      return undefined;
    }

    if (node.type === 'leaf') {
      const views = isObj(node.data) && Array.isArray(node.data.views) ? node.data.views : [];
      return views.includes(panelId) ? null : undefined;
    }

    if (node.type === 'branch' && Array.isArray(node.data)) {
      for (const child of node.data) {
        const found = walk(child, flip(orientation), depth + 1);
        if (found === null) {
          // `child` is the leaf holding the panel: this branch (with `orientation`) is its parent
          return orientation;
        }

        if (found) {
          return found;
        }
      }
    }

    return undefined;
  };

  const root = dock.grid.root;
  if (!isObj(root) || root.type !== 'branch') {
    return null;
  }

  const result = walk(root, rootOrientation, 0);
  if (!result) {
    return null;
  }

  const children = Array.isArray(root.data) ? root.data : [];
  const soleGroup = children.length === 1 && isObj(children[0]) && children[0].type === 'leaf';
  return soleGroup ? null : result;
}
