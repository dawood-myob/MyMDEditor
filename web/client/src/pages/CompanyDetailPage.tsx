import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Company } from '../api/types';
import { PageShell } from '../app/AppHeader';
import { useAuth } from '../app/auth';
import { platformApi } from '../app/endpoints';
import { describeError } from '../app/errors';
import { Badge } from '../app/ui/Badge';
import { EmptyState } from '../app/ui/EmptyState';
import { IconAlert, IconBuilding } from '../app/ui/icons';
import { Skeleton } from '../app/ui/Skeleton';
import { formatDate } from '../app/utils';
import { UsersManager } from './UsersManager';

export default function CompanyDetailPage() {
  const { companyId = '' } = useParams();
  const { user } = useAuth();
  const [company, setCompany] = useState<Company | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await platformApi.list();
      setCompany(list.find((c) => c.id === companyId) ?? null);
    } catch (e) {
      setError(describeError(e, 'Could not load the company.'));
    }
  }, [companyId]);

  useEffect(() => {
    setCompany(undefined);
    void load();
  }, [load]);

  return (
    <PageShell crumbs={[{ label: 'Admin console', to: '/platform' }, { label: company?.name ?? 'Company' }]}>
      {error && (
        <div className="app-alert app-alert--danger" role="alert">
          <IconAlert size={16} />
          <span>{error}</span>
          <button className="btn" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {company === undefined && !error && (
        <div className="app-page__head" role="status" aria-label="Loading company">
          <div>
            <Skeleton width={220} height={26} />
            <div style={{ height: 8 }} />
            <Skeleton width={320} height={12} />
          </div>
        </div>
      )}

      {company === null && (
        <EmptyState
          icon={<IconBuilding size={28} />}
          title="Company not found"
          action={<Link className="btn btn-primary" to="/platform">Back to companies</Link>}
        >
          It may have been deleted.
        </EmptyState>
      )}

      {company && (
        <>
          <div className="app-page__head">
            <div>
              <p className="app-eyebrow">Company</p>
              <h1 className="app-page__title">
                {company.name} <Badge tone={company.disabled ? 'danger' : 'success'}>{company.disabled ? 'Disabled' : 'Active'}</Badge>
              </h1>
              <p className="muted">
                <code className="app-code">{company.slug}</code> · {company.userCount} users · {company.documentCount} documents · created {formatDate(company.createdAt)}
              </p>
              {company.disabled && <p className="muted">Users of a disabled company cannot sign in until it is enabled again.</p>}
            </div>
          </div>
          <UsersManager companyId={company.id} canManage currentUserId={user?.id} />
        </>
      )}
    </PageShell>
  );
}

