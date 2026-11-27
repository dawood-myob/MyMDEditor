import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { ROLE_LABEL, ROLE_TONE } from './roles';
import { useTheme } from './theme';
import { Badge } from './ui/Badge';
import { IconBuilding, IconChevronDown, IconKey, IconLogout, IconMoon, IconSun, IconUsers } from './ui/icons';
import { initials } from './utils';

export function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      buttonRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointer = (e: Event) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [open]);

  if (!user) {
    return null;
  }

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const name = user.displayName || user.username;

  return (
    <div className="app-usermenu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="app-usermenu__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account menu for ${name}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation();
            close(true);
          }
        }}
      >
        <span className="app-avatar app-avatar--sm" aria-hidden="true">
          {initials(name)}
        </span>
        <IconChevronDown size={14} />
      </button>

      {open && (
        <div id={menuId} ref={menuRef} className="app-usermenu__panel card" role="menu" aria-label="Account" onKeyDown={onMenuKeyDown}>
          <div className="app-usermenu__who">
            <span className="app-avatar" aria-hidden="true">
              {initials(name)}
            </span>
            <div className="app-usermenu__id">
              <strong className="app-usermenu__name">{name}</strong>
              <span className="muted">@{user.username}</span>
              {user.companyName && (
                <span className="muted app-usermenu__company">
                  <IconBuilding size={12} /> {user.companyName}
                </span>
              )}
            </div>
            <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Badge>
          </div>
          <div className="app-usermenu__sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="app-menuitem"
            onClick={() => {
              toggle();
              close(true);
            }}
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
            {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          </button>
          {user.role === 'admin' && (
            <Link role="menuitem" className="app-menuitem" to="/admin/users" onClick={() => setOpen(false)}>
              <IconUsers /> Manage users
            </Link>
          )}
          {user.role === 'superadmin' && (
            <Link role="menuitem" className="app-menuitem" to="/platform" onClick={() => setOpen(false)}>
              <IconBuilding /> Admin console
            </Link>
          )}
          <Link role="menuitem" className="app-menuitem" to="/change-password" onClick={() => setOpen(false)}>
            <IconKey /> Change password
          </Link>
          <div className="app-usermenu__sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="app-menuitem"
            onClick={() => {
              setOpen(false);
              void logout()
                .catch(() => undefined)
                .then(() => navigate('/login', { replace: true }));
            }}
          >
            <IconLogout /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
