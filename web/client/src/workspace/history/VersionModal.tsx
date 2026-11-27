import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { VersionFull, VersionMeta } from '../../api/types';
import { collapseUnchanged, diffLines, diffStats } from '../lib/diff';
import { relativeTime } from '../lib/format';
import { describeError } from '../state/useTreeData';
import { Modal } from '../ui/Modal';

interface Props {
  documentId: string;
  version: VersionMeta;
  /** live content of the document (what the diff compares against) */
  currentContent: string;
  canRestore: boolean;
  onRestore: (v: VersionMeta) => void;
  onClose: () => void;
}

export function VersionModal({ documentId, version, currentContent, canRestore, onRestore, onClose }: Props) {
  const [full, setFull] = useState<VersionFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compact, setCompact] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ version: VersionFull }>(`/api/documents/${documentId}/versions/${version.id}`)
      .then((res) => !cancelled && setFull(res.version))
      .catch((e) => !cancelled && setError(describeError(e, 'Could not load this version')));
    return () => {
      cancelled = true;
    };
  }, [documentId, version.id]);

  const lines = useMemo(() => (full ? diffLines(full.content, currentContent) : []), [full, currentContent]);
  const stats = useMemo(() => diffStats(lines), [lines]);
  const rows = useMemo(() => (compact ? collapseUnchanged(lines, 3) : lines), [lines, compact]);
  const identical = full !== null && stats.added === 0 && stats.removed === 0;

  return (
    <Modal
      wide
      title={`Version from ${new Date(version.createdAt).toLocaleString()}`}
      onClose={onClose}
      footer={
        <>
          <label className="ws-check">
            <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} /> Collapse unchanged lines
          </label>
          <span className="ws-spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          {canRestore && (
            <button type="button" className="btn btn-primary" disabled={!full} onClick={() => onRestore(version)}>
              Restore this version
            </button>
          )}
        </>
      }
    >
      <p className="muted ws-version-meta">
        {version.kind} · {version.authorName ?? 'unknown author'} · {relativeTime(version.createdAt)}
        {version.label ? ` · “${version.label}”` : ''}
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!full && !error && <p className="muted">Loading…</p>}
      {full && (
        <>
          <p className="ws-diff-summary" aria-live="polite">
            {identical ? 'Identical to the current content.' : `Compared with the current content: ${stats.added} line${stats.added === 1 ? '' : 's'} added, ${stats.removed} removed.`}
          </p>
          <div className="ws-diff" role="table" aria-label="Line diff between this version and the current content" data-testid="version-diff">
            {rows.map((r, i) =>
              r.kind === 'gap' ? (
                <div key={`g${i}`} className="ws-diff-gap" role="row">
                  ⋯ {r.hidden} unchanged line{r.hidden === 1 ? '' : 's'}
                </div>
              ) : (
                <div key={i} className={`ws-diff-line is-${r.kind}`} role="row">
                  <span className="ws-diff-no" aria-hidden="true">
                    {r.oldNo ?? ''}
                  </span>
                  <span className="ws-diff-no" aria-hidden="true">
                    {r.newNo ?? ''}
                  </span>
                  <span className="ws-diff-sign" aria-label={r.kind === 'add' ? 'added' : r.kind === 'del' ? 'removed' : 'unchanged'}>
                    {r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}
                  </span>
                  <span className="ws-diff-text">{r.text || ' '}</span>
                </div>
              ),
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
