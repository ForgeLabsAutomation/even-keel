import { CircleCheck, CircleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
  actions: ToastAction[];
}

interface ToastApi {
  show: (message: string, options?: { tone?: Toast['tone']; actions?: ToastAction[] }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 7000;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (paused) return undefined;
    const t = window.setTimeout(() => dismiss.current(), toast.tone === 'error' ? DURATION_MS * 2 : DURATION_MS);
    return () => window.clearTimeout(t);
  }, [paused, toast.tone]);

  const Icon = toast.tone === 'error' ? CircleAlert : CircleCheck;
  return (
    <div
      className={`toast toast--${toast.tone}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon size={18} aria-hidden="true" className="toast__icon" />
      <span className="toast__message">{toast.message}</span>
      {toast.actions.map((a) => (
        <button
          key={a.label}
          type="button"
          className="toast__action"
          onClick={() => {
            a.onClick();
            onDismiss();
          }}
        >
          {a.label}
        </button>
      ))}
      <button type="button" className="icon-btn icon-btn--sm toast__close" aria-label="Dismiss" onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const show = useCallback<ToastApi['show']>((message, options = {}) => {
    const toast: Toast = { id: nextId.current++, message, tone: options.tone ?? 'success', actions: options.actions ?? [] };
    setToasts((list) => [...list.slice(-2), toast]);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => setToasts((list) => list.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside ToastProvider');
  return api;
}
