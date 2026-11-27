import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconClose } from './icons';

export type ToastKind = 'info' | 'success' | 'error';

interface ToastItem { id: number; kind: ToastKind; message: string }

export interface ToastApi {
  show: (kind: ToastKind, message: string) => void;
  info: (message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }

  return ctx;
}

const LIFETIME: Record<ToastKind, number> = { info: 3500, success: 3000, error: 7000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      // identical messages collapse so reconnect storms do not stack toasts
      setItems((list) => [...list.filter((t) => !(t.kind === kind && t.message === message)), { id, kind, message }].slice(-4));
      timers.current.set(id, window.setTimeout(() => dismiss(id), LIFETIME[kind]));
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => window.clearTimeout(t));
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      info: (m) => show('info', m),
      success: (m) => show('success', m),
      error: (m) => show('error', m),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ws-toasts" role="region" aria-label="Notifications">
        {items.map((t) => (
          <div key={t.id} className={`ws-toast ws-toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className="ws-toast-msg">{t.message}</span>
            <button type="button" className="ws-iconbtn" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
              <IconClose size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
