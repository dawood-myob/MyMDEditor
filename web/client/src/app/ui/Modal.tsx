import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './icons';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** When false, Escape / backdrop clicks are ignored (e.g. while a request is running). */
  dismissable?: boolean;
}

let openModals = 0;

export function Modal({ open, onClose, title, description, children, footer, size = 'md', dismissable = true }: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dismissableRef = useRef(dismissable);
  onCloseRef.current = onClose;
  dismissableRef.current = dismissable;

  useEffect(() => {
    if (!open) {
      return;
    }

    const previous = document.activeElement as HTMLElement | null;
    openModals++;
    document.body.style.overflow = 'hidden';

    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      const target =
        dialog.querySelector<HTMLElement>('[data-autofocus]') ??
        dialog.querySelector<HTMLElement>('.app-modal__body')?.querySelector<HTMLElement>(FOCUSABLE) ??
        dialog.querySelector<HTMLElement>('.app-modal__footer')?.querySelector<HTMLElement>(FOCUSABLE) ??
        dialog;
      target.focus();
    }

    return () => {
      openModals--;
      if (openModals === 0) {
        document.body.style.overflow = '';
      }

      if (previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (dismissableRef.current) {
        onCloseRef.current();
      }

      return;
    }

    if (e.key !== 'Tab' || !dialogRef.current) {
      return;
    }

    const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => !n.hasAttribute('disabled'));
    if (nodes.length === 0) {
      e.preventDefault();
      dialogRef.current.focus();
      return;
    }

    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="app-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissable) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={`app-modal app-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="app-modal__header">
          <div>
            <h2 className="app-modal__title" id={titleId}>
              {title}
            </h2>
            {description && (
              <p className="app-modal__desc muted" id={descId}>
                {description}
              </p>
            )}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={!dismissable} aria-label="Close dialog">
            <IconClose size={16} />
          </button>
        </header>
        <div className="app-modal__body">{children}</div>
        {footer && <footer className="app-modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
