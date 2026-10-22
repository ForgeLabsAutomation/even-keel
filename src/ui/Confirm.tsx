import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    resolver.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={options !== null}
        onClose={() => finish(false)}
        title={options?.title ?? ''}
        size="sm"
        closeOnBackdrop
        footer={
          <>
            {/* For destructive actions, focus starts on Cancel so a stray Enter can't delete anything. */}
            <button type="button" className="btn btn--ghost" onClick={() => finish(false)} data-autofocus={options?.danger ? true : undefined}>
              {options?.cancelLabel ?? 'Cancel'}
            </button>
            <button
              type="button"
              className={`btn ${options?.danger ? 'btn--danger' : 'btn--primary'}`}
              onClick={() => finish(true)}
              data-autofocus={options?.danger ? undefined : true}
            >
              {options?.confirmLabel ?? 'OK'}
            </button>
          </>
        }
      >
        <div className="confirm__message">{options?.message}</div>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be used inside ConfirmProvider');
  return fn;
}
