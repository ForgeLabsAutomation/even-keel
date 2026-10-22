import { addDays, type ISODate } from '../lib/dates';
import type { Cents } from '../lib/money';
import { occurrenceKey, openingBalanceFor } from '../lib/budget';
import { occurrencesBetween } from '../lib/recurrence';
import { buildDemoData, clearDemoData } from './demo';
import type { AppData, Category, RecurringItem, Settings, Transaction } from './types';

export type Action =
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'setup/complete' }
  | { type: 'balance/reconcile'; actual: Cents; today: ISODate }
  | { type: 'balance/setOpening'; amount: Cents; asOf: ISODate }
  | { type: 'category/add'; category: Category }
  | { type: 'category/update'; id: string; patch: Partial<Pick<Category, 'name' | 'color' | 'icon' | 'planned'>> }
  | { type: 'category/delete'; id: string; moveTo: string }
  | { type: 'tx/add'; tx: Transaction }
  | { type: 'tx/update'; tx: Transaction }
  | { type: 'tx/delete'; id: string }
  | { type: 'tx/restore'; tx: Transaction }
  | { type: 'recurring/add'; item: RecurringItem }
  | { type: 'recurring/update'; item: RecurringItem }
  | { type: 'recurring/delete'; id: string }
  | { type: 'recurring/setPaused'; id: string; paused: boolean; today: ISODate }
  | {
      type: 'occurrence/settle';
      recurringId: string;
      date: ISODate;
      amount: Cents;
      paidOn: ISODate;
      txId: string;
      now: string;
    }
  | { type: 'occurrence/unsettle'; recurringId: string; date: ISODate }
  | { type: 'occurrence/skip'; recurringId: string; date: ISODate; skipped: boolean }
  | { type: 'demo/load'; today: ISODate; now: string }
  | { type: 'demo/clear'; today: ISODate }
  | { type: 'data/replace'; data: AppData }
  | { type: 'reminders/mark'; date: ISODate };

/** Drop a transaction's link when it points nowhere valid or duplicates another payment. */
function sanitizeLink(data: AppData, tx: Transaction): Transaction {
  if (!tx.link) return tx;
  const item = data.recurring.find((r) => r.id === tx.link!.recurringId);
  const kindMatches = item && (item.kind === 'income') === (tx.type === 'income');
  const key = occurrenceKey(tx.link.recurringId, tx.link.date);
  const taken = data.transactions.some((t) => t.id !== tx.id && t.link && occurrenceKey(t.link.recurringId, t.link.date) === key);
  if (!kindMatches || taken) {
    const { link: _drop, ...rest } = tx;
    return rest;
  }
  return tx;
}

function categoryExists(data: AppData, id: string, type: Category['type']): boolean {
  return data.categories.some((c) => c.id === id && c.type === type);
}

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'setup/complete':
      return { ...state, meta: { ...state.meta, setupDone: true } };

    case 'balance/reconcile':
      return { ...state, settings: { ...state.settings, openingBalance: openingBalanceFor(state, action.actual, action.today) } };

    case 'balance/setOpening':
      return { ...state, settings: { ...state.settings, openingBalance: action.amount, balanceAsOf: action.asOf } };

    case 'category/add':
      if (state.categories.some((c) => c.id === action.category.id)) return state;
      return { ...state, categories: [...state.categories, action.category] };

    case 'category/update':
      return {
        ...state,
        categories: state.categories.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
      };

    case 'category/delete': {
      const target = state.categories.find((c) => c.id === action.id);
      const dest = state.categories.find((c) => c.id === action.moveTo);
      if (!target || !dest || dest.id === target.id || dest.type !== target.type) return state;
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== target.id),
        transactions: state.transactions.map((t) => (t.categoryId === target.id ? { ...t, categoryId: dest.id } : t)),
        recurring: state.recurring.map((r) => (r.categoryId === target.id ? { ...r, categoryId: dest.id } : r)),
      };
    }

    case 'tx/add': {
      if (state.transactions.some((t) => t.id === action.tx.id)) return state;
      if (!categoryExists(state, action.tx.categoryId, action.tx.type)) return state;
      return { ...state, transactions: [...state.transactions, sanitizeLink(state, action.tx)] };
    }

    case 'tx/update': {
      if (!state.transactions.some((t) => t.id === action.tx.id)) return state;
      if (!categoryExists(state, action.tx.categoryId, action.tx.type)) return state;
      const tx = sanitizeLink(state, action.tx);
      return { ...state, transactions: state.transactions.map((t) => (t.id === tx.id ? tx : t)) };
    }

    case 'tx/delete':
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.id) };

    case 'tx/restore': {
      if (state.transactions.some((t) => t.id === action.tx.id)) return state;
      if (!state.categories.some((c) => c.id === action.tx.categoryId)) return state;
      return { ...state, transactions: [...state.transactions, sanitizeLink(state, action.tx)] };
    }

    case 'recurring/add':
      if (state.recurring.some((r) => r.id === action.item.id)) return state;
      return { ...state, recurring: [...state.recurring, action.item] };

    case 'recurring/update':
      return { ...state, recurring: state.recurring.map((r) => (r.id === action.item.id ? action.item : r)) };

    case 'recurring/delete': {
      // Past payments stay as ordinary transactions; only the schedule goes away.
      const settings = state.settings.primaryIncomeId === action.id ? { ...state.settings, primaryIncomeId: undefined } : state.settings;
      return {
        ...state,
        settings,
        recurring: state.recurring.filter((r) => r.id !== action.id),
        transactions: state.transactions.map((t) => {
          if (t.link?.recurringId !== action.id) return t;
          const { link: _drop, ...rest } = t;
          return rest;
        }),
      };
    }

    case 'recurring/setPaused':
      return {
        ...state,
        recurring: state.recurring.map((r) => {
          if (r.id !== action.id || r.paused === action.paused) return r;
          if (action.paused) return { ...r, paused: true, pausedOn: action.today };
          // Resuming: dates that passed while paused are skipped, not suddenly overdue.
          const { pausedOn, ...rest } = r;
          const from = pausedOn ?? action.today;
          const settled = new Set(state.transactions.filter((t) => t.link?.recurringId === r.id).map((t) => t.link!.date));
          const missed = occurrencesBetween(r, from, addDays(action.today, -1)).filter((d) => !settled.has(d));
          return { ...rest, paused: false, skipped: [...new Set([...r.skipped, ...missed])].sort() };
        }),
      };

    case 'occurrence/settle': {
      const item = state.recurring.find((r) => r.id === action.recurringId);
      if (!item) return state;
      const key = occurrenceKey(item.id, action.date);
      if (state.transactions.some((t) => t.link && occurrenceKey(t.link.recurringId, t.link.date) === key)) return state;
      const tx: Transaction = {
        id: action.txId,
        type: item.kind === 'income' ? 'income' : 'expense',
        amount: action.amount,
        categoryId: item.categoryId,
        date: action.paidOn,
        payee: item.name,
        link: { recurringId: item.id, date: action.date },
        createdAt: action.now,
        ...(item.demo ? { demo: true } : {}),
      };
      return {
        ...state,
        recurring: state.recurring.map((r) =>
          r.id === item.id && r.skipped.includes(action.date) ? { ...r, skipped: r.skipped.filter((d) => d !== action.date) } : r,
        ),
        transactions: [...state.transactions, tx],
      };
    }

    case 'occurrence/unsettle': {
      const key = occurrenceKey(action.recurringId, action.date);
      return {
        ...state,
        transactions: state.transactions.filter((t) => !(t.link && occurrenceKey(t.link.recurringId, t.link.date) === key)),
      };
    }

    case 'occurrence/skip':
      return {
        ...state,
        recurring: state.recurring.map((r) => {
          if (r.id !== action.recurringId) return r;
          const rest = r.skipped.filter((d) => d !== action.date);
          return { ...r, skipped: action.skipped ? [...rest, action.date].sort() : rest };
        }),
      };

    case 'demo/load':
      if (state.meta.demo) return state;
      return buildDemoData(state, action.today, action.now);

    case 'demo/clear':
      return clearDemoData(state, action.today);

    case 'data/replace':
      return action.data;

    case 'reminders/mark':
      return { ...state, meta: { ...state.meta, lastReminderDate: action.date } };
  }
}
