import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { VersionMeta } from '../../api/types';
import { formatBytes, relativeTime } from '../lib/format';
import { useWorkspace } from '../state/WorkspaceContext';
import { describeError } from '../state/useTreeData';
import { useDialogs } from '../ui/Dialogs';
import { IconEye, IconHistory, IconRefresh, IconSave } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { VersionModal } from './VersionModal';

const KIND_LABEL: Record<VersionMeta['kind'], string> = { auto: 'Auto', manual: 'Manual', restore: 'Restore', import: 'Import' };

export default function HistoryPanel() {
  const { documentId, canEdit, collab } = useWorkspace();
  const dialogs = useDialogs();
  const toast = useToast();
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<VersionMeta | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!documentId) return;
    try {
      const res = await api.get<{ versions: VersionMeta[] }>(`/api/documents/${documentId}/versions`);
      setVersions(res.versions);
      setError(null);
    } catch (e) {
      setError(describeError(e, 'Could not load the history'));
    }
  }, [documentId]);

  useEffect(() => {
    setVersions(null);
    setViewing(null);
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const save = async () => {
    if (!documentId) return;
    const label = await dialogs.prompt({
      title: 'Save version',
      label: 'Label (optional)',
      placeholder: 'e.g. Before the big rewrite',
      confirmLabel: 'Save version',
      validate: (v) => (v.length > 200 ? 'Label is too long (max 200 characters).' : null),
    });
    if (label === null) return;
    setBusy(true);
    try {
      await api.post(`/api/documents/${documentId}/versions`, label.trim() ? { label: label.trim() } : {});
      toast.success('Version saved.');
      await load();
    } catch (e) {
      toast.error(describeError(e, 'Could not save the version'));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (v: VersionMeta) => {
    if (!documentId) return;
    const ok = await dialogs.confirm({
      title: 'Restore version',
      confirmLabel: 'Restore',
      message: (
        <>
          Replace the current content with the version from <strong>{new Date(v.createdAt).toLocaleString()}</strong>? The current content is saved as a new version first, so nothing is lost.
        </>
      ),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/api/documents/${documentId}/versions/${v.id}/restore`);
      setViewing(null);
      toast.success('Version restored.');
      await load();
    } catch (e) {
      toast.error(describeError(e, 'Could not restore the version'));
    } finally {
      setBusy(false);
    }
  };

  if (!documentId) {
    return (
      <div className="ws-empty">
        <IconHistory size={28} />
        <p className="ws-empty-title">No history</p>
        <p className="muted">Open a document to see its versions.</p>
      </div>
    );
  }

  return (
    <div className="ws-history" data-testid="history">
      <div className="ws-panel-toolbar" role="toolbar" aria-label="History actions">
        {canEdit && (
          <button type="button" className="btn ws-btn-sm" disabled={busy} onClick={() => void save()}>
            <IconSave size={14} /> Save version
          </button>
        )}
        <span className="ws-spacer" />
        <button type="button" className="ws-iconbtn" aria-label="Refresh history" title="Refresh" onClick={() => void load()}>
          <IconRefresh />
        </button>
      </div>
      {error && (
        <p className="error-text ws-pad" role="alert">
          {error}
        </p>
      )}
      {!versions && !error && (
        <div className="ws-skeleton" aria-busy="true" aria-label="Loading history">
          {[80, 60, 70].map((w, i) => (
            <div key={i} className="ws-skeleton-row" style={{ width: `${w}%`, height: 38 }} />
          ))}
        </div>
      )}
      {versions && versions.length === 0 && (
        <div className="ws-empty">
          <p className="ws-empty-title">No versions yet</p>
          <p className="muted">Versions are created automatically while you edit. {canEdit ? 'Use “Save version” to create a named snapshot.' : ''}</p>
        </div>
      )}
      {versions && versions.length > 0 && (
        <ul className="ws-version-list" aria-label="Versions">
          {versions.map((v) => (
            <li key={v.id} className="ws-version" data-testid="version-item">
              <div className="ws-version-main">
                <span className={`ws-badge kind-${v.kind}`}>{KIND_LABEL[v.kind]}</span>
                <span className="ws-version-label" title={v.label ?? undefined}>
                  {v.label ?? relativeTime(v.createdAt, now)}
                </span>
              </div>
              <div className="ws-version-sub muted">
                {v.authorName ?? 'Unknown'} · <time dateTime={v.createdAt} title={new Date(v.createdAt).toLocaleString()}>{relativeTime(v.createdAt, now)}</time> · {formatBytes(v.size)}
              </div>
              <div className="ws-version-actions">
                <button type="button" className="btn ws-btn-sm" onClick={() => setViewing(v)} aria-label={`View version from ${new Date(v.createdAt).toLocaleString()}`}>
                  <IconEye size={13} /> View
                </button>
                {canEdit && (
                  <button type="button" className="btn ws-btn-sm" disabled={busy} onClick={() => void restore(v)} aria-label={`Restore version from ${new Date(v.createdAt).toLocaleString()}`}>
                    Restore
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {viewing && (
        <VersionModal
          documentId={documentId}
          version={viewing}
          currentContent={collab.session?.ytext.toString() ?? ''}
          canRestore={canEdit}
          onRestore={(v) => void restore(v)}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
