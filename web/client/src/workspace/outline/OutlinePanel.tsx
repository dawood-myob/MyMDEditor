import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { activeHeadingIndex, extractOutline, visibleOutline } from '../lib/outline';
import { useDocText } from '../state/useDocText';
import { useWorkspace } from '../state/WorkspaceContext';
import { IconChevronDown, IconChevronRight, IconCollapseAll, IconChevronsUp, IconList } from '../ui/icons';

export default function OutlinePanel() {
  const { bus, collab, documentId } = useWorkspace();
  const text = useDocText(collab.session?.ytext ?? null, 150);
  const items = useMemo(() => extractOutline(text), [text]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [cursorLine, setCursorLine] = useState(bus.cursorLine);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => bus.on('cursor', setCursorLine), [bus]);
  useEffect(() => setCollapsed(new Set()), [documentId]);

  const active = activeHeadingIndex(items, cursorLine);
  const visible = useMemo(() => visibleOutline(items, collapsed), [items, collapsed]);
  const minLevel = items.reduce((m, i) => Math.min(m, i.level), 6);

  // the active section may sit inside a collapsed parent: highlight the nearest visible ancestor instead
  const effectiveActive = useMemo(() => {
    for (let i = active; i >= 0; i = items[i].parent) {
      if (visible.some((v) => v.index === i)) return i;
    }

    return -1;
  }, [active, items, visible]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-current="location"]')?.scrollIntoView({ block: 'nearest' });
  }, [effectiveActive]);

  const toggle = (key: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const go = (line: number) => {
    bus.emit('reveal', { line, from: 'outline' });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-outline-btn]') ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLElement);
    const item = i >= 0 ? visible[i] : null;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[Math.min(buttons.length - 1, i + 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[Math.max(0, i - 1)]?.focus();
    } else if (e.key === 'ArrowLeft' && item?.hasChildren && !collapsed.has(item.key)) {
      e.preventDefault();
      toggle(item.key);
    } else if (e.key === 'ArrowRight' && item?.hasChildren && collapsed.has(item.key)) {
      e.preventDefault();
      toggle(item.key);
    }
  };

  if (!documentId) {
    return (
      <div className="ws-empty">
        <IconList size={28} />
        <p className="ws-empty-title">No outline</p>
        <p className="muted">Open a document to see its headings.</p>
      </div>
    );
  }

  return (
    <div className="ws-outline" data-testid="outline">
      <div className="ws-panel-toolbar" role="toolbar" aria-label="Outline actions">
        <button type="button" className="ws-iconbtn" aria-label="Collapse all sections" title="Collapse all" disabled={items.length === 0} onClick={() => setCollapsed(new Set(items.filter((i) => i.hasChildren).map((i) => i.key)))}>
          <IconCollapseAll />
        </button>
        <button type="button" className="ws-iconbtn" aria-label="Expand all sections" title="Expand all" disabled={collapsed.size === 0} onClick={() => setCollapsed(new Set())}>
          <IconChevronsUp />
        </button>
        <span className="ws-spacer" />
        <span className="muted ws-count">{items.length} heading{items.length === 1 ? '' : 's'}</span>
      </div>
      {items.length === 0 ? (
        <div className="ws-empty">
          <p className="ws-empty-title">No headings yet</p>
          <p className="muted">Use # Heading in the editor to build an outline.</p>
        </div>
      ) : (
        <ul ref={listRef} className="ws-outline-list" role="tree" aria-label="Document outline" onKeyDown={onKeyDown}>
          {visible.map((item) => {
            const isCollapsed = collapsed.has(item.key);
            return (
              <li
                key={item.key}
                role="treeitem"
                aria-level={item.level}
                aria-expanded={item.hasChildren ? !isCollapsed : undefined}
                className={`ws-outline-item${item.index === effectiveActive ? ' is-active' : ''}`}
                style={{ paddingLeft: 6 + (item.level - minLevel) * 14 }}
              >
                {item.hasChildren ? (
                  <button type="button" className="ws-outline-twisty" aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${item.text}`} onClick={() => toggle(item.key)}>
                    {isCollapsed ? <IconChevronRight size={13} /> : <IconChevronDown size={13} />}
                  </button>
                ) : (
                  <span className="ws-outline-twisty" aria-hidden="true" />
                )}
                <button
                  type="button"
                  data-outline-btn
                  className={`ws-outline-link level-${item.level}`}
                  aria-current={item.index === effectiveActive ? 'location' : undefined}
                  title={item.text}
                  onClick={() => go(item.line)}
                >
                  {item.text}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
