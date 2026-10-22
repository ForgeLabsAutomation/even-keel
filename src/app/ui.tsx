import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ISODate } from '../lib/dates';
import type { Cents } from '../lib/money';
import type { RecurringItem, TxType } from '../state/types';

export type Page = 'home' | 'activity' | 'bills' | 'income' | 'budget' | 'settings';

export interface TransactionPrefill {
  type?: TxType;
  amount?: Cents;
  categoryId?: string;
  payee?: string;
  date?: ISODate;
}

export type DialogState =
  | { kind: 'none' }
  | { kind: 'transaction'; mode: 'add'; prefill?: TransactionPrefill }
  | { kind: 'transaction'; mode: 'edit'; id: string }
  | { kind: 'recurring'; itemKind: RecurringItem['kind']; id?: string }
  | { kind: 'settle'; recurringId: string; date: ISODate }
  | { kind: 'balance' }
  | { kind: 'category'; id?: string; type?: TxType };

interface UiValue {
  page: Page;
  navigate: (page: Page) => void;
  dialog: DialogState;
  openDialog: (dialog: DialogState) => void;
  closeDialog: () => void;
  addTransaction: (prefill?: TransactionPrefill) => void;
  editTransaction: (id: string) => void;
}

const UiContext = createContext<UiValue | null>(null);

export function UiProvider({ children, initialPage = 'home' }: { children: ReactNode; initialPage?: Page }) {
  const [page, setPage] = useState<Page>(initialPage);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });

  const navigate = useCallback((next: Page) => {
    setPage(next);
    document.getElementById('main')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo<UiValue>(
    () => ({
      page,
      navigate,
      dialog,
      openDialog: setDialog,
      closeDialog: () => setDialog({ kind: 'none' }),
      addTransaction: (prefill) => setDialog({ kind: 'transaction', mode: 'add', prefill }),
      editTransaction: (id) => setDialog({ kind: 'transaction', mode: 'edit', id }),
    }),
    [page, navigate, dialog],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiValue {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi must be used inside UiProvider');
  return value;
}
