import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconAlert, IconCheck, IconClose, IconInfo } from './icons';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastOptions { title?: string; message: string; kind?: ToastKind; duration?: number }
interface ToastItem extends Required<Pick<ToastOptions, 'message' | 'kind'>> { id: number; title?: string }

interface ToastApi {
  show: (options: ToastOptions) => number;
  success: (message: string, title?: string) => number;
  error: (message: string, title?: string) => number;
  info: (message: string, title?: string) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }

    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    ({ title, message, kind = 'info', duration }: ToastOptions) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { id, title, message, kind }]);
      const ms = duration ?? (kind === 'error' ? 8000 : 4500);
      if (ms > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), ms));
      }

      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach((t) => clearTimeout(t));
      active.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (message, title) => show({ message, title, kind: 'success' }),
      error: (message, title) => show({ message, title, kind: 'error' }),
      info: (message, title) => show({ message, title, kind: 'info' }),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="app-toasts" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div key={t.id} className={`app-toast app-toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className="app-toast__icon">
              {t.kind === 'success' ? <IconCheck size={16} /> : t.kind === 'error' ? <IconAlert size={16} /> : <IconInfo size={16} />}
            </span>
            <div className="app-toast__body">
              {t.title && <strong className="app-toast__title">{t.title}</strong>}
              <span>{t.message}</span>
            </div>
            <button className="btn btn-ghost btn-icon app-toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <IconClose size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }

  return ctx;
}
