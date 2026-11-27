import { useMemo, useState } from 'react';
import { moveTargets, validateMove, type MoveSource, type TreeModel } from '../lib/tree';
import { IconFolder } from '../ui/icons';
import { Modal } from '../ui/Modal';

interface Props {
  model: TreeModel;
  source: MoveSource;
  name: string;
  onMove: (targetFolderId: string | null) => void;
  onClose: () => void;
}

/** "Move to…" picker: the keyboard-friendly alternative to drag and drop. Invalid destinations are shown disabled with the reason. */
export function MoveDialog({ model, source, name, onMove, onClose }: Props) {
  const targets = useMemo(
    () =>
      moveTargets(model, source).map((t) => {
        const check = validateMove(model, source, t.id);
        return { ...t, ok: check.ok, reason: check.ok ? '' : check.message };
      }),
    [model, source],
  );
  const firstOk = targets.find((t) => t.ok);
  const [selected, setSelected] = useState<string | null | undefined>(firstOk ? firstOk.id : undefined);

  return (
    <Modal
      title={`Move “${name}”`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={selected === undefined} onClick={() => selected !== undefined && onMove(selected)}>
            Move here
          </button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Destination folder" className="ws-move-list">
        {targets.map((t) => (
          <label key={t.id ?? 'root'} className={`ws-move-item${t.ok ? '' : ' is-disabled'}`} style={{ paddingLeft: 8 + t.depth * 16 }} title={t.reason || undefined}>
            <input type="radio" name="move-target" disabled={!t.ok} checked={selected === t.id} onChange={() => setSelected(t.id)} />
            <IconFolder size={14} />
            <span>{t.id === null ? t.path : t.path.split('/').pop()}</span>
            {!t.ok && <span className="muted ws-move-reason">{t.reason}</span>}
          </label>
        ))}
      </div>
    </Modal>
  );
}
