import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { User } from '../api/types';
import { usersApi, type ManagedRole } from '../app/endpoints';
import { describeError, describeUserError } from '../app/errors';
import { PasswordField } from '../app/PasswordField';
import { ROLE_DESCRIPTION, ROLE_LABEL, ROLE_TONE } from '../app/roles';
import { Badge } from '../app/ui/Badge';
import { ConfirmDialog } from '../app/ui/ConfirmDialog';
import { EmptyState } from '../app/ui/EmptyState';
import { IconAlert, IconKey, IconPlus, IconRefresh, IconSearch, IconTrash, IconUsers, IconPower } from '../app/ui/icons';
import { Modal } from '../app/ui/Modal';
import { SkeletonRows } from '../app/ui/Skeleton';
import { Spinner } from '../app/ui/Spinner';
import { useToast } from '../app/ui/Toast';
import { formatDate, initials, MIN_PASSWORD } from '../app/utils';

const ROLES: ManagedRole[] = ['admin', 'editor', 'viewer'];
const USERNAME_RE = /^[A-Za-z0-9._@-]{3,40}$/;

export interface UsersManagerProps {
  companyId: string;
  canManage: boolean;
  currentUserId: string | null | undefined;
  /** Reports the user list size so the host page can show counts. */
  onCountChange?: (count: number) => void;
}

export function UsersManager({ companyId, canManage, currentUserId, onCountChange }: UsersManagerProps) {
  const toast = useToast();
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setUsers(await usersApi.list(companyId));
    } catch (e) {
      setLoadError(describeError(e, 'Could not load users.'));
    }
  }, [companyId]);

  useEffect(() => {
    setUsers(null);
    let cancelled = false;
    usersApi
      .list(companyId)
      .then((list) => !cancelled && (setUsers(list), setLoadError(null)))
      .catch((e) => !cancelled && setLoadError(describeError(e, 'Could not load users.')));
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (users) {
      onCountChange?.(users.length);
    }
  }, [users, onCountChange]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const sorted = [...(users ?? [])].sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username, undefined, { sensitivity: 'base' }));
    return q ? sorted.filter((u) => u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q) || u.role.includes(q)) : sorted;
  }, [users, filter]);

  const replaceUser = (updated: User) => setUsers((list) => (list ?? []).map((u) => (u.id === updated.id ? updated : u)));

  const mutate = async (user: User, patch: Parameters<typeof usersApi.update>[2], action: 'role' | 'disable', success: string) => {
    setPending((s) => new Set(s).add(user.id));
    try {
      replaceUser(await usersApi.update(companyId, user.id, patch));
      toast.success(success);
    } catch (e) {
      toast.error(describeUserError(e, action));
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(user.id);
        return next;
      });
    }
  };

  return (
    <section className="app-users" aria-labelledby="users-heading">
      <div className="app-toolbar">
        <div>
          <h2 id="users-heading" className="app-section-title">
            Users {users && <span className="app-count">{users.length}</span>}
          </h2>
        </div>
        <div className="app-toolbar__actions">
          <div className="app-search">
            <IconSearch size={14} />
            <input
              className="input"
              type="search"
              placeholder="Filter users…"
              aria-label="Filter users"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <button className="btn btn-icon" onClick={() => void load()} aria-label="Refresh users" title="Refresh">
            <IconRefresh />
          </button>
          {canManage && (
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <IconPlus /> Add user
            </button>
          )}
        </div>
      </div>

      <RoleLegend />

      {loadError && (
        <div className="app-alert app-alert--danger" role="alert">
          <IconAlert size={16} />
          <span>{loadError}</span>
          <button className="btn" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!users && !loadError && <SkeletonRows rows={4} label="Loading users" />}

      {users && users.length === 0 && (
        <EmptyState icon={<IconUsers size={28} />} title="No users yet" action={canManage ? <button className="btn btn-primary" onClick={() => setAdding(true)}>Add the first user</button> : undefined}>
          Users you add will appear here.
        </EmptyState>
      )}

      {users && users.length > 0 && visible.length === 0 && (
        <EmptyState icon={<IconSearch size={28} />} title="No matching users">
          Nobody matches “{filter}”.
        </EmptyState>
      )}

      {visible.length > 0 && (
        <div className="app-table-wrap">
          <table className="app-table app-table--stack">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
                {canManage && <th scope="col" className="app-table__actions-col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => {
                const isSelf = u.id === currentUserId;
                const busy = pending.has(u.id);
                const name = u.displayName || u.username;
                return (
                  <tr key={u.id} className={u.disabled ? 'is-disabled' : undefined} data-testid={`user-row-${u.username}`}>
                    <td data-label="User">
                      <div className="app-person">
                        <span className="app-avatar" aria-hidden="true">{initials(name)}</span>
                        <div className="app-person__text">
                          <span className="app-person__name">
                            {name} {isSelf && <Badge tone="neutral">You</Badge>}
                          </span>
                          <span className="muted app-person__sub">@{u.username}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Role">
                      {canManage && !isSelf ? (
                        <select
                          className="input app-role-select"
                          value={u.role === 'superadmin' ? 'admin' : u.role}
                          aria-label={`Role for ${name}`}
                          disabled={busy}
                          onChange={(e) => void mutate(u, { role: e.target.value as ManagedRole }, 'role', `${name} is now ${ROLE_LABEL[e.target.value as ManagedRole]}.`)}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                      )}
                    </td>
                    <td data-label="Status">
                      <div className="app-status">
                        <Badge tone={u.disabled ? 'danger' : 'success'}>{u.disabled ? 'Disabled' : 'Active'}</Badge>
                        {u.mustChangePassword && <Badge tone="warning" title="Must set a new password at next sign-in">Password pending</Badge>}
                      </div>
                    </td>
                    <td data-label="Created" className="muted">{formatDate(u.createdAt)}</td>
                    {canManage && (
                      <td data-label="Actions" className="app-table__actions">
                        <button
                          className="btn"
                          disabled={busy || isSelf}
                          title={isSelf ? "You can't disable your own account" : undefined}
                          onClick={() => void mutate(u, { disabled: !u.disabled }, 'disable', u.disabled ? `${name} was enabled.` : `${name} was disabled.`)}
                        >
                          {busy ? <Spinner size={12} /> : <IconPower size={14} />}
                          {u.disabled ? 'Enable' : 'Disable'}
                          <span className="sr-only"> {name}</span>
                        </button>
                        <button className="btn" onClick={() => setResetting(u)}>
                          <IconKey size={14} /> Reset password<span className="sr-only"> for {name}</span>
                        </button>
                        <button
                          className="btn btn-danger"
                          disabled={isSelf}
                          title={isSelf ? "You can't delete your own account" : undefined}
                          onClick={() => setDeleting(u)}
                        >
                          <IconTrash size={14} /> Delete<span className="sr-only"> {name}</span>
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AddUserDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSubmit={async (input) => {
          const created = await usersApi.create(companyId, input);
          setUsers((list) => [...(list ?? []), created]);
          toast.success(`${created.displayName || created.username} was added.`);
          setAdding(false);
        }}
      />

      <ResetPasswordDialog
        user={resetting}
        onClose={() => setResetting(null)}
        onSubmit={async (user, password) => {
          replaceUser(await usersApi.update(companyId, user.id, { password }));
          toast.success(`Password reset for ${user.displayName || user.username}.`);
          setResetting(null);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        tone="danger"
        title="Delete user"
        confirmLabel="Delete user"
        message={
          <>
            Permanently delete <strong>{deleting?.displayName || deleting?.username}</strong> (@{deleting?.username})? They will be signed out immediately and
            can no longer access the workspace. Documents they authored are kept.
          </>
        }
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const target = deleting;
          if (!target) {
            return;
          }

          try {
            await usersApi.remove(companyId, target.id);
          } catch (e) {
            throw new Error(describeUserError(e, 'delete'));
          }

          setUsers((list) => (list ?? []).filter((u) => u.id !== target.id));
          toast.success(`${target.displayName || target.username} was deleted.`);
          setDeleting(null);
        }}
      />
    </section>
  );
}

function RoleLegend() {
  return (
    <details className="app-legend">
      <summary>Roles &amp; permissions</summary>
      <dl className="app-legend__list">
        {ROLES.map((r) => (
          <div key={r} className="app-legend__item">
            <dt>
              <Badge tone={ROLE_TONE[r]}>{ROLE_LABEL[r]}</Badge>
            </dt>
            <dd className="muted">{ROLE_DESCRIPTION[r]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

interface AddUserDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { username: string; displayName?: string; password: string; role: ManagedRole }) => Promise<void>;
}

function AddUserDialog({ open, onClose, onSubmit }: AddUserDialogProps) {
  const formId = useId();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<ManagedRole>('editor');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUsername('');
      setDisplayName('');
      setRole('editor');
      setPassword('');
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) {
      return;
    }

    const name = username.trim();
    if (!USERNAME_RE.test(name)) {
      setError('Username must be 3–40 characters: letters, digits and . _ @ -');
      return;
    }

    if (password.length < MIN_PASSWORD) {
      setError(`The password must be at least ${MIN_PASSWORD} characters long.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit({ username: name, ...(displayName.trim() ? { displayName: displayName.trim() } : {}), password, role });
    } catch (err) {
      setError(describeUserError(err, 'create'));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add user"
      description="The user must choose their own password the first time they sign in."
      dismissable={!busy}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={busy}>
            {busy && <Spinner size={14} />} Add user
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor={`${formId}-username`}>Username</label>
          <input
            id={`${formId}-username`}
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            required
            data-autofocus
          />
        </div>
        <div className="field">
          <label htmlFor={`${formId}-display`}>Display name</label>
          <input id={`${formId}-display`} className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="off" maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor={`${formId}-role`}>Role</label>
          <select id={`${formId}-role`} className="input" value={role} onChange={(e) => setRole(e.target.value as ManagedRole)} aria-describedby={`${formId}-role-desc`}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <span className="app-hint muted" id={`${formId}-role-desc`}>
            {ROLE_DESCRIPTION[role]}
          </span>
        </div>
        <PasswordField label="Initial password" value={password} onChange={setPassword} autoComplete="new-password" showStrength generator required />
        {error && (
          <p className="app-alert app-alert--danger" role="alert">
            <IconAlert size={16} />
            <span>{error}</span>
          </p>
        )}
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({ user, onClose, onSubmit }: { user: User | null; onClose: () => void; onSubmit: (user: User, password: string) => Promise<void> }) {
  const formId = useId();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setPassword('');
      setBusy(false);
      setError(null);
    }
  }, [user]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || busy) {
      return;
    }

    if (password.length < MIN_PASSWORD) {
      setError(`The password must be at least ${MIN_PASSWORD} characters long.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onSubmit(user, password);
    } catch (err) {
      setError(describeUserError(err, 'reset'));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title="Reset password"
      description={user ? `Set a new temporary password for ${user.displayName || user.username}. They will be signed out everywhere and must change it at next sign-in.` : undefined}
      dismissable={!busy}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={busy}>
            {busy && <Spinner size={14} />} Reset password
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate>
        <PasswordField label="New temporary password" value={password} onChange={setPassword} autoComplete="new-password" showStrength generator required autoFocus />
        {error && (
          <p className="app-alert app-alert--danger" role="alert">
            <IconAlert size={16} />
            <span>{error}</span>
          </p>
        )}
      </form>
    </Modal>
  );
}
