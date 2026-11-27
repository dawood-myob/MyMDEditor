import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Company } from '../api/types';
import { PageShell } from '../app/AppHeader';
import { platformApi } from '../app/endpoints';
import { describeError } from '../app/errors';
import { PasswordField } from '../app/PasswordField';
import { Badge } from '../app/ui/Badge';
import { ConfirmDialog } from '../app/ui/ConfirmDialog';
import { EmptyState } from '../app/ui/EmptyState';
import { IconAlert, IconBuilding, IconPlus, IconPower, IconRefresh, IconSearch, IconTrash } from '../app/ui/icons';
import { Modal } from '../app/ui/Modal';
import { SkeletonRows } from '../app/ui/Skeleton';
import { Spinner } from '../app/ui/Spinner';
import { useToast } from '../app/ui/Toast';
import { formatDate, MIN_PASSWORD, slugify } from '../app/utils';

const SLUG_RE = /^[a-z0-9-]{2,40}$/;
const USERNAME_RE = /^[A-Za-z0-9._@-]{3,40}$/;

export default function PlatformPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [disabling, setDisabling] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState<Company | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      setCompanies(await platformApi.list());
    } catch (e) {
      setError(describeError(e, 'Could not load companies.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (companies ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.slug.includes(q));
  }, [companies, filter]);

  const setDisabled = async (company: Company, disabled: boolean) => {
    setPending((s) => new Set(s).add(company.id));
    try {
      const updated = await platformApi.update(company.id, { disabled });
      setCompanies((list) => (list ?? []).map((c) => (c.id === updated.id ? updated : c)));
      toast.success(`${company.name} was ${disabled ? 'disabled' : 'enabled'}.`);
    } catch (e) {
      toast.error(describeError(e));
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(company.id);
        return next;
      });
    }
  };

  return (
    <PageShell crumbs={[{ label: 'Admin console' }]}>
      <div className="app-page__head">
        <div>
          <p className="app-eyebrow">Platform</p>
          <h1 className="app-page__title">Companies</h1>
          <p className="muted">Every company is an isolated tenant with its own users and documents.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <IconPlus /> New company
        </button>
      </div>

      <div className="app-toolbar">
        <h2 className="app-section-title">
          All companies {companies && <span className="app-count">{companies.length}</span>}
        </h2>
        <div className="app-toolbar__actions">
          <div className="app-search">
            <IconSearch size={14} />
            <input className="input" type="search" placeholder="Search by name or slug…" aria-label="Search companies" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <button className="btn btn-icon" onClick={() => void load()} aria-label="Refresh companies" title="Refresh">
            <IconRefresh />
          </button>
        </div>
      </div>

      {error && (
        <div className="app-alert app-alert--danger" role="alert">
          <IconAlert size={16} />
          <span>{error}</span>
          <button className="btn" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!companies && !error && <SkeletonRows rows={4} label="Loading companies" />}

      {companies && companies.length === 0 && (
        <EmptyState
          icon={<IconBuilding size={28} />}
          title="No companies yet"
          action={
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              Create the first company
            </button>
          }
        >
          Create a company together with its first administrator to get started.
        </EmptyState>
      )}

      {companies && companies.length > 0 && visible.length === 0 && (
        <EmptyState icon={<IconSearch size={28} />} title="No matching companies">
          Nothing matches “{filter}”.
        </EmptyState>
      )}

      {visible.length > 0 && (
        <div className="app-table-wrap">
          <table className="app-table app-table--stack app-table--clickable">
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Slug</th>
                <th scope="col" className="app-num">Users</th>
                <th scope="col" className="app-num">Documents</th>
                <th scope="col">Created</th>
                <th scope="col">Status</th>
                <th scope="col" className="app-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const busy = pending.has(c.id);
                return (
                  <tr key={c.id} className={c.disabled ? 'is-disabled' : undefined} onClick={() => navigate(`/platform/companies/${c.id}`)} data-testid={`company-row-${c.slug}`}>
                    <td data-label="Company">
                      <Link className="app-rowlink" to={`/platform/companies/${c.id}`} onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                    </td>
                    <td data-label="Slug"><code className="app-code">{c.slug}</code></td>
                    <td data-label="Users" className="app-num">{c.userCount}</td>
                    <td data-label="Documents" className="app-num">{c.documentCount}</td>
                    <td data-label="Created" className="muted">{formatDate(c.createdAt)}</td>
                    <td data-label="Status"><Badge tone={c.disabled ? 'danger' : 'success'}>{c.disabled ? 'Disabled' : 'Active'}</Badge></td>
                    <td data-label="Actions" className="app-table__actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() => (c.disabled ? void setDisabled(c, false) : setDisabling(c))}
                      >
                        {busy ? <Spinner size={12} /> : <IconPower size={14} />}
                        {c.disabled ? 'Enable' : 'Disable'}
                        <span className="sr-only"> {c.name}</span>
                      </button>
                      <button className="btn btn-danger" onClick={() => setDeleting(c)}>
                        <IconTrash size={14} /> Delete<span className="sr-only"> {c.name}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateCompanyDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(company) => {
          setCompanies((list) => [...(list ?? []), company]);
          setCreating(false);
          toast.success(`${company.name} was created.`);
        }}
      />

      <ConfirmDialog
        open={!!disabling}
        tone="danger"
        title="Disable company"
        confirmLabel="Disable company"
        message={
          <>
            Disable <strong>{disabling?.name}</strong>? Nobody in this company will be able to sign in, and existing sessions stop working. You can enable it again
            at any time; no data is deleted.
          </>
        }
        onCancel={() => setDisabling(null)}
        onConfirm={async () => {
          const target = disabling;
          setDisabling(null);
          if (target) {
            await setDisabled(target, true);
          }
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        tone="danger"
        title="Delete company"
        confirmLabel="Delete company permanently"
        requireText={deleting?.slug}
        message={
          <>
            This permanently deletes <strong>{deleting?.name}</strong>, all of its {deleting?.userCount ?? 0} users and {deleting?.documentCount ?? 0} documents,
            including the files on disk. <strong>This cannot be undone.</strong>
          </>
        }
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const target = deleting;
          if (!target) {
            return;
          }

          await platformApi.remove(target.id, target.slug);
          setCompanies((list) => (list ?? []).filter((c) => c.id !== target.id));
          setDeleting(null);
          toast.success(`${target.name} was deleted.`);
        }}
      />
    </PageShell>
  );
}

function CreateCompanyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (company: Company) => void }) {
  const formId = useId();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setSlug('');
      setSlugTouched(false);
      setAdminUsername('');
      setAdminDisplayName('');
      setAdminPassword('');
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) {
      return;
    }

    const finalSlug = slug.trim().toLowerCase();
    if (!name.trim()) {
      setError('Enter the company name.');
    } else if (!SLUG_RE.test(finalSlug)) {
      setError('The slug must be 2–40 characters: lowercase letters, digits and hyphens.');
    } else if (!USERNAME_RE.test(adminUsername.trim())) {
      setError('The admin username must be 3–40 characters: letters, digits and . _ @ -');
    } else if (adminPassword.length < MIN_PASSWORD) {
      setError(`The admin password must be at least ${MIN_PASSWORD} characters long.`);
    } else {
      setBusy(true);
      setError(null);
      try {
        const company = await platformApi.create({
          name: name.trim(),
          slug: finalSlug,
          adminUsername: adminUsername.trim(),
          adminPassword,
          ...(adminDisplayName.trim() ? { adminDisplayName: adminDisplayName.trim() } : {}),
        });
        onCreated(company);
      } catch (err) {
        setError(describeError(err, 'Could not create the company.'));
        setBusy(false);
      }
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New company"
      description="Creates an isolated workspace and its first administrator."
      dismissable={!busy}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn btn-primary" disabled={busy}>
            {busy && <Spinner size={14} />} Create company
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void submit(e)} noValidate>
        <div className="field">
          <label htmlFor={`${formId}-name`}>Company name</label>
          <input
            id={`${formId}-name`}
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) {
                setSlug(slugify(e.target.value));
              }
            }}
            autoComplete="off"
            maxLength={120}
            required
            data-autofocus
          />
        </div>
        <div className="field">
          <label htmlFor={`${formId}-slug`}>Slug</label>
          <input
            id={`${formId}-slug`}
            className="input"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            aria-describedby={`${formId}-slug-hint`}
            required
          />
          <span className="app-hint muted" id={`${formId}-slug-hint`}>
            Used on the sign-in page to identify the company. Cannot be changed later.
          </span>
        </div>
        <fieldset className="app-fieldset">
          <legend>First administrator</legend>
          <div className="field">
            <label htmlFor={`${formId}-au`}>Admin username</label>
            <input id={`${formId}-au`} className="input" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={40} required />
          </div>
          <div className="field">
            <label htmlFor={`${formId}-ad`}>Admin display name</label>
            <input id={`${formId}-ad`} className="input" value={adminDisplayName} onChange={(e) => setAdminDisplayName(e.target.value)} autoComplete="off" maxLength={80} />
          </div>
          <PasswordField label="Admin password" value={adminPassword} onChange={setAdminPassword} autoComplete="new-password" showStrength generator required />
        </fieldset>
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

