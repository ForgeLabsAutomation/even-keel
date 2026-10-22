import { useCallback } from 'react';
import { formatShort, type ISODate } from '../lib/dates';
import { newId, nowStamp } from '../lib/ids';
import { formatMoney } from '../lib/money';
import { occurrenceKey, type Occurrence } from '../lib/budget';
import { useStore } from '../state/store';
import type { Transaction } from '../state/types';
import { useToast } from '../ui/Toast';
import { useUi } from './ui';

/** The date to record for a payment: the due date if it has passed, otherwise today. */
export function defaultSettleDate(due: ISODate, today: ISODate): ISODate {
  return due <= today ? due : today;
}

/** Common actions with consistent confirmation messages and Undo. */
export function useActions() {
  const { data, dispatch, today } = useStore();
  const toast = useToast();
  const { editTransaction } = useUi();
  const currency = data.settings.currency;

  const deleteTransaction = useCallback(
    (tx: Transaction) => {
      dispatch({ type: 'tx/delete', id: tx.id });
      toast.show(`${tx.type === 'income' ? 'Income' : 'Expense'} of ${formatMoney(tx.amount, currency)} deleted`, {
        tone: 'info',
        actions: [{ label: 'Undo', onClick: () => dispatch({ type: 'tx/restore', tx }) }],
      });
    },
    [dispatch, toast, currency],
  );

  /** One-tap "mark paid" / "received as expected" using the scheduled amount. */
  const settle = useCallback(
    (o: Occurrence, amount = o.item.amount, paidOn = defaultSettleDate(o.date, today)) => {
      const txId = newId('tx');
      dispatch({ type: 'occurrence/settle', recurringId: o.item.id, date: o.date, amount, paidOn, txId, now: nowStamp() });
      const verb = o.item.kind === 'income' ? 'recorded as received' : 'marked paid';
      toast.show(`${o.item.name} (${formatShort(o.date)}) ${verb}`, {
        actions: [
          { label: 'Undo', onClick: () => dispatch({ type: 'occurrence/unsettle', recurringId: o.item.id, date: o.date }) },
          { label: 'Edit', onClick: () => editTransaction(txId) },
        ],
      });
    },
    [dispatch, toast, today, editTransaction],
  );

  const unsettle = useCallback(
    (o: Occurrence) => {
      const tx = data.transactions.find((t) => t.link && occurrenceKey(t.link.recurringId, t.link.date) === o.key);
      dispatch({ type: 'occurrence/unsettle', recurringId: o.item.id, date: o.date });
      toast.show(`${o.item.name} (${formatShort(o.date)}) marked ${o.item.kind === 'income' ? 'not received' : 'unpaid'}`, {
        tone: 'info',
        actions: tx ? [{ label: 'Undo', onClick: () => dispatch({ type: 'tx/restore', tx }) }] : [],
      });
    },
    [data.transactions, dispatch, toast],
  );

  const setSkipped = useCallback(
    (o: Occurrence, skipped: boolean) => {
      dispatch({ type: 'occurrence/skip', recurringId: o.item.id, date: o.date, skipped });
      if (skipped) {
        toast.show(`${o.item.name} on ${formatShort(o.date)} skipped`, {
          tone: 'info',
          actions: [{ label: 'Undo', onClick: () => dispatch({ type: 'occurrence/skip', recurringId: o.item.id, date: o.date, skipped: false }) }],
        });
      }
    },
    [dispatch, toast],
  );

  return { deleteTransaction, settle, unsettle, setSkipped };
}
