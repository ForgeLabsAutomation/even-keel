import { createEmptyData } from '../state/defaults';
import type { AppData, RecurringItem, Transaction } from '../state/types';

let counter = 0;

export function emptyData(today = '2026-10-21', patch: Partial<AppData['settings']> = {}): AppData {
  const data = createEmptyData(today);
  data.settings = { ...data.settings, currency: 'USD', balanceAsOf: today, ...patch };
  data.meta.setupDone = true;
  return data;
}

export function tx(partial: Partial<Transaction> & Pick<Transaction, 'amount' | 'date'>): Transaction {
  counter++;
  return {
    id: `tx-${counter}`,
    type: 'expense',
    categoryId: partial.type === 'income' ? 'cat-paycheck' : 'cat-groceries',
    createdAt: `2026-01-01T00:00:${String(counter % 60).padStart(2, '0')}.000Z`,
    ...partial,
  };
}

export function bill(partial: Partial<RecurringItem> & Pick<RecurringItem, 'amount' | 'startDate'>): RecurringItem {
  counter++;
  return {
    id: `bill-${counter}`,
    kind: 'bill',
    name: `Bill ${counter}`,
    categoryId: 'cat-utilities',
    frequency: 'monthly',
    paused: false,
    skipped: [],
    createdAt: `2026-01-01T00:00:00.000Z`,
    ...partial,
  };
}

export function income(partial: Partial<RecurringItem> & Pick<RecurringItem, 'amount' | 'startDate'>): RecurringItem {
  counter++;
  return {
    id: `inc-${counter}`,
    kind: 'income',
    name: `Paycheck ${counter}`,
    categoryId: 'cat-paycheck',
    frequency: 'weekly',
    paused: false,
    skipped: [],
    createdAt: `2026-01-01T00:00:0${counter % 10}.000Z`,
    ...partial,
  };
}

export function withItems(data: AppData, items: { recurring?: RecurringItem[]; transactions?: Transaction[] }): AppData {
  return {
    ...data,
    recurring: [...data.recurring, ...(items.recurring ?? [])],
    transactions: [...data.transactions, ...(items.transactions ?? [])],
  };
}
