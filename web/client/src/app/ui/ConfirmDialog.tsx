import { useEffect, useId, useState, type ReactNode } from 'react';
import { describeError } from '../errors';
import { Modal } from './Modal';
import { Spinner } from './Spinner';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  /** When set, the user must type exactly this text before the confirm button is enabled (e.g. a company slug). */
  requireText?: string;
  /** May be async. If it throws, the message is shown inline and the dialog stays open; the caller closes it on success. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  requireText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  useEffect(() => {
    if (open) {
      setTyped('');
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const allowed = !requireText || typed === requireText;

  const submit = async () => {
    if (!allowed || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      dismissable={!busy}
      footer={
        <>
          <button className="btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${tone === 'danger' ? 'btn-danger app-btn-danger-solid' : 'btn-primary'}`}
            onClick={() => void submit()}
            disabled={!allowed || busy}
            data-testid="confirm-button"
          >
            {busy && <Spinner size={14} />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="app-confirm__message">{message}</div>
      {requireText && (
        <form
          className="field app-confirm__typed"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor={inputId}>
            Type <code className="app-code">{requireText}</code> to confirm
          </label>
          <input
            id={inputId}
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            data-autofocus
          />
        </form>
      )}
      {error && (
        <p className="app-alert app-alert--danger" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
