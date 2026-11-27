import { createContext, useCallback, useContext, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** return an error message to block submission */
  validate?: (value: string) => string | null;
  multiline?: boolean;
}

export interface DialogApi {
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  /** resolves with the entered text, or null when cancelled */
  prompt: (o: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialogs must be used inside <DialogProvider>');
  }

  return ctx;
}

type Active =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void };

export function DialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Active | null>(null);
  const activeRef = useRef<Active | null>(null);

  const open = useCallback((next: Active) => {
    // a new dialog supersedes (cancels) the previous one
    const prev = activeRef.current;
    if (prev) {
      if (prev.kind === 'confirm') prev.resolve(false);
      else prev.resolve(null);
    }

    activeRef.current = next;
    setActive(next);
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) => new Promise<boolean>((resolve) => open({ kind: 'confirm', options, resolve })),
      prompt: (options) => new Promise<string | null>((resolve) => open({ kind: 'prompt', options, resolve })),
    }),
    [open],
  );

  const close = () => {
    activeRef.current = null;
    setActive(null);
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {active?.kind === 'confirm' && (
        <ConfirmView
          options={active.options}
          onDone={(v) => {
            active.resolve(v);
            close();
          }}
        />
      )}
      {active?.kind === 'prompt' && (
        <PromptView
          options={active.options}
          onDone={(v) => {
            active.resolve(v);
            close();
          }}
        />
      )}
    </DialogContext.Provider>
  );
}

function ConfirmView({ options, onDone }: { options: ConfirmOptions; onDone: (v: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      title={options.title}
      onClose={() => onDone(false)}
      initialFocus={confirmRef}
      footer={
        <>
          <button type="button" className="btn" onClick={() => onDone(false)}>
            Cancel
          </button>
          <button ref={confirmRef} type="button" className={`btn ${options.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => onDone(true)}>
            {options.confirmLabel ?? 'OK'}
          </button>
        </>
      }
    >
      <div className="ws-dialog-message">{options.message}</div>
    </Modal>
  );
}

function PromptView({ options, onDone }: { options: PromptOptions; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(options.initialValue ?? '');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const err = options.validate?.(value) ?? null;
    if (err) {
      setError(err);
      inputRef.current?.focus();
      return;
    }

    onDone(value);
  };

  const common = {
    ref: inputRef,
    className: 'input',
    value,
    placeholder: options.placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? 'ws-prompt-error' : undefined,
    onChange: (e: { target: { value: string } }) => {
      setValue(e.target.value);
      setError(null);
    },
    onFocus: (e: { target: HTMLInputElement | HTMLTextAreaElement }) => {
      if (options.initialValue) {
        // select the base name only (without the extension) for quick renames
        const dot = options.initialValue.lastIndexOf('.');
        e.target.setSelectionRange(0, dot > 0 ? dot : options.initialValue.length);
      }
    },
  };

  return (
    <Modal
      title={options.title}
      onClose={() => onDone(null)}
      initialFocus={inputRef}
      footer={
        <>
          <button type="button" className="btn" onClick={() => onDone(null)}>
            Cancel
          </button>
          <button type="submit" form="ws-prompt-form" className="btn btn-primary">
            {options.confirmLabel ?? 'OK'}
          </button>
        </>
      }
    >
      <form id="ws-prompt-form" onSubmit={submit} className="ws-prompt">
        <label className="field">
          <span>{options.label}</span>
          {options.multiline ? <textarea {...common} rows={3} /> : <input {...common} type="text" autoComplete="off" spellCheck={false} />}
        </label>
        {error && (
          <p id="ws-prompt-error" className="error-text" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
