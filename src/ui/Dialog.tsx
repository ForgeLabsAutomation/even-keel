import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Modal dialog built on the native <dialog> element, which gives focus
 * trapping, Escape-to-close and correct screen-reader semantics for free.
 * On narrow screens it is styled as a bottom sheet.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className = '',
  closeOnBackdrop = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Forms keep this off so a stray click can't throw away what was typed. */
  closeOnBackdrop?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      const previouslyFocused = document.activeElement as HTMLElement | null;
      el.showModal();
      // Prefer an explicitly marked field; otherwise the browser picks the first focusable element.
      const auto = el.querySelector<HTMLElement>('[data-autofocus]');
      auto?.focus();
      return () => {
        if (el.open) el.close();
        if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
      };
    }
    if (!open && el.open) el.close();
    return undefined;
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog--${size} ${className}`.trim()}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onMouseDown={(e) => {
        // Clicking the dimmed backdrop (the dialog element itself) closes it.
        if (closeOnBackdrop && e.target === ref.current) onCloseRef.current();
      }}
    >
      {open && (
        <div className="dialog__frame">
          <header className="dialog__header">
            <div>
              <h2 id={titleId} className="dialog__title">
                {title}
              </h2>
              {description && (
                <p id={descId} className="dialog__description">
                  {description}
                </p>
              )}
            </div>
            <button type="button" className="icon-btn" onClick={() => onCloseRef.current()} aria-label="Close">
              <X size={18} />
            </button>
          </header>
          <div className="dialog__body">{children}</div>
          {footer && <footer className="dialog__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
