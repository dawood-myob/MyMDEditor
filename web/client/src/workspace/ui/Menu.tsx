import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck } from './icons';

export type MenuEntry =
  | {
      type?: 'item';
      id: string;
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      /** defined => rendered as a checkbox item */
      checked?: boolean;
      disabled?: boolean;
      danger?: boolean;
      onSelect: () => void;
    }
  | { type: 'separator'; id: string }
  | { type: 'heading'; id: string; label: string };

interface MenuPopupProps {
  items: readonly MenuEntry[];
  /** viewport coordinates of the top-left corner (context menu) or of the anchor's bottom-left (dropdown) */
  x: number;
  y: number;
  /** right edge alignment: popup's right edge is placed at x */
  alignRight?: boolean;
  label: string;
  onClose: (restoreFocus: boolean) => void;
}

export function MenuPopup({ items, x, y, alignRight, label, onClose }: MenuPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  const enabledIndexes = items.flatMap((it, i) => (it.type === 'separator' || it.type === 'heading' || it.disabled ? [] : [i]));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    const rect = el.getBoundingClientRect();
    let left = alignRight ? x - rect.width : x;
    let top = y;
    left = Math.max(4, Math.min(left, window.innerWidth - rect.width - 4));
    if (top + rect.height > window.innerHeight - 4) {
      top = Math.max(4, window.innerHeight - rect.height - 4);
    }

    setPos({ left, top });
  }, [x, y, alignRight, items.length]);

  const focusItem = useCallback((index: number) => {
    ref.current?.querySelectorAll<HTMLElement>('[data-menu-index]').forEach((el) => {
      if (Number(el.dataset.menuIndex) === index) {
        el.focus();
      }
    });
  }, []);

  useEffect(() => {
    if (enabledIndexes.length) {
      focusItem(enabledIndexes[0]);
    } else {
      ref.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose(false);
      }
    };
    const onBlur = () => onClose(false);
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [onClose]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = Number((document.activeElement as HTMLElement | null)?.dataset.menuIndex ?? -1);
    const pos = enabledIndexes.indexOf(current);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusItem(enabledIndexes[(pos + 1) % enabledIndexes.length]);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(enabledIndexes[(pos <= 0 ? enabledIndexes.length : pos) - 1]);
        break;
      case 'Home':
        e.preventDefault();
        focusItem(enabledIndexes[0]);
        break;
      case 'End':
        e.preventDefault();
        focusItem(enabledIndexes[enabledIndexes.length - 1]);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onClose(true);
        break;
      case 'Tab':
        e.preventDefault();
        onClose(true);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey) {
          const letter = e.key.toLowerCase();
          const next = enabledIndexes.find((i, n) => {
            const it = items[i];
            return n > pos && it.type !== 'separator' && it.type !== 'heading' && it.label.toLowerCase().startsWith(letter);
          });
          if (next !== undefined) focusItem(next);
        }
    }
  };

  const select = (item: Extract<MenuEntry, { onSelect: () => void }>) => {
    if (item.disabled) {
      return;
    }

    onClose(false);
    // run after the popup is torn down so that dialogs opened by the action take focus properly
    window.setTimeout(item.onSelect, 0);
  };

  return createPortal(
    <div
      ref={ref}
      className="ws-menu"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return <div key={item.id} className="ws-menu-sep" role="separator" />;
        }

        if (item.type === 'heading') {
          return (
            <div key={item.id} className="ws-menu-heading" role="presentation">
              {item.label}
            </div>
          );
        }

        const isCheckbox = item.checked !== undefined;
        return (
          <button
            key={item.id}
            type="button"
            role={isCheckbox ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={isCheckbox ? item.checked : undefined}
            aria-disabled={item.disabled || undefined}
            data-menu-index={index}
            data-testid={`menu-${item.id}`}
            className={`ws-menu-item${item.danger ? ' is-danger' : ''}${item.disabled ? ' is-disabled' : ''}`}
            tabIndex={-1}
            onClick={() => select(item)}
          >
            <span className="ws-menu-check" aria-hidden="true">
              {isCheckbox ? item.checked ? <IconCheck size={14} /> : null : item.icon}
            </span>
            <span className="ws-menu-label">{item.label}</span>
            {item.shortcut && <kbd className="ws-menu-kbd">{item.shortcut}</kbd>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

interface MenuButtonProps {
  label: string;
  /** visible content of the trigger */
  children: ReactNode;
  items: readonly MenuEntry[] | (() => readonly MenuEntry[]);
  className?: string;
  alignRight?: boolean;
  testId?: string;
  disabled?: boolean;
}

/** Dropdown trigger with an accessible menu popup. */
export function MenuButton({ label, children, items, className, alignRight, testId, disabled }: MenuButtonProps) {
  const [open, setOpen] = useState<{ x: number; y: number; items: readonly MenuEntry[] } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();

  const toggle = () => {
    if (open) {
      setOpen(null);
      return;
    }

    const rect = ref.current!.getBoundingClientRect();
    setOpen({ x: alignRight ? rect.right : rect.left, y: rect.bottom + 4, items: typeof items === 'function' ? items() : items });
  };

  const close = useCallback((restore: boolean) => {
    setOpen(null);
    if (restore) {
      ref.current?.focus();
    }
  }, []);

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className ?? 'btn ws-menubtn'}
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-controls={open ? id : undefined}
        data-testid={testId}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            toggle();
          }
        }}
      >
        {children}
      </button>
      {open && <MenuPopup items={open.items} x={open.x} y={open.y} alignRight={alignRight} label={label} onClose={close} />}
    </>
  );
}
