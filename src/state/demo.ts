/**
 * Clearly-labelled sample data so a new person can see how the app works.
 * Every demo record carries `demo: true`, and the settings it changes are
 * snapshotted so "Remove demo data" can put everything back.
 * All names and amounts are invented.
 */
import { addDays, makeDate, weekday, type ISODate } from '../lib/dates';
import { occurrencesBetween } from '../lib/recurrence';
import { currentBalance, occurrenceKey, openingBalanceFor } from '../lib/budget';
import type { AppData, RecurringItem, Transaction } from './types';

const DEMO_PLANNED: Record<string, number> = {
  'cat-housing': 1250_00,
  'cat-utilities': 230_00,
  'cat-groceries': 450_00,
  'cat-transportation': 190_00,
  'cat-health': 60_00,
  'cat-dining': 150_00,
  'cat-personal': 120_00,
  'cat-savings': 220_00,
  'cat-other': 80_00,
};

/** Deterministic pseudo-random numbers so demo data looks the same every time. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function nextWeekdayOnOrAfter(date: ISODate, targetWeekday: number): ISODate {
  return addDays(date, (targetWeekday - weekday(date) + 7) % 7);
}

export function buildDemoData(state: AppData, today: ISODate, now: string): AppData {
  const hasCategory = (id: string) => state.categories.some((c) => c.id === id);
  const fallbackExpense = state.categories.find((c) => c.type === 'expense')!.id;
  const fallbackIncome = state.categories.find((c) => c.type === 'income')!.id;
  const exp = (id: string) => (hasCategory(id) ? id : fallbackExpense);
  const inc = (id: string) => (hasCategory(id) ? id : fallbackIncome);

  const start = addDays(today, -35);
  const firstPayday = nextWeekdayOnOrAfter(start, 5); // a Friday
  // First "day of month" on or after `start`, so every demo bill's history is fully paid.
  const monthly = (day: number): ISODate => {
    const [y, m] = start.split('-').map(Number);
    const candidate = makeDate(y, m, day);
    return candidate >= start ? candidate : makeDate(y, m + 1, day);
  };

  const recurring: RecurringItem[] = [
    item('demo-income-pay', 'income', 'Weekly paycheck (demo)', 760_00, inc('cat-paycheck'), 'weekly', firstPayday),
    item('demo-bill-rent', 'bill', 'Rent (demo)', 1150_00, exp('cat-housing'), 'monthly', monthly(1)),
    item('demo-bill-electric', 'bill', 'Electric (demo)', 86_40, exp('cat-utilities'), 'monthly', monthly(18)),
    item('demo-bill-internet', 'bill', 'Internet (demo)', 60_00, exp('cat-utilities'), 'monthly', monthly(9)),
    item('demo-bill-phone', 'bill', 'Phone (demo)', 45_00, exp('cat-utilities'), 'monthly', monthly(24)),
    item('demo-bill-streaming', 'bill', 'Streaming (demo)', 15_49, exp('cat-personal'), 'monthly', monthly(12)),
    item('demo-bill-insurance', 'bill', "Renter's insurance (demo)", 168_00, exp('cat-housing'), 'yearly', addDays(today, 54)),
  ];

  const transactions: Transaction[] = [];
  let n = 0;
  const add = (tx: Omit<Transaction, 'id' | 'createdAt' | 'demo'>) => {
    n++;
    transactions.push({ ...tx, id: `demo-tx-${n}`, createdAt: now, demo: true });
  };

  // Settle every past occurrence so the history looks lived-in.
  const yesterday = addDays(today, -1);
  for (const r of recurring) {
    for (const date of occurrencesBetween(r, start, yesterday)) {
      add({
        type: r.kind === 'income' ? 'income' : 'expense',
        amount: r.kind === 'income' ? r.amount + (date.endsWith('5') ? 42_50 : 0) : r.amount,
        categoryId: r.categoryId,
        date,
        payee: r.name,
        link: { recurringId: r.id, date },
      });
    }
  }

  const rand = seeded(7);
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) * 100);
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (wd === 6) add({ type: 'expense', amount: between(68, 104), categoryId: exp('cat-groceries'), date: d, payee: 'Corner Market' });
    if (wd === 3 && rand() > 0.3) add({ type: 'expense', amount: between(12, 31), categoryId: exp('cat-groceries'), date: d, payee: 'Corner Market' });
    if (wd === 1 || wd === 4) add({ type: 'expense', amount: between(4, 7), categoryId: exp('cat-dining'), date: d, payee: 'Bean & Leaf Café' });
    if (wd === 5 && rand() > 0.35) add({ type: 'expense', amount: between(18, 42), categoryId: exp('cat-dining'), date: d, payee: 'Noodle House' });
    if (wd === 2 && rand() > 0.4) add({ type: 'expense', amount: between(34, 52), categoryId: exp('cat-transportation'), date: d, payee: 'Fuel Stop' });
    if (wd === 0 && rand() > 0.6) add({ type: 'expense', amount: between(9, 38), categoryId: exp('cat-personal'), date: d, payee: 'Main St. Goods' });
    if (wd === 5) add({ type: 'expense', amount: 50_00, categoryId: exp('cat-savings'), date: d, payee: 'Transfer to savings', note: 'Weekly set-aside' });
  }
  add({ type: 'expense', amount: 23_75, categoryId: exp('cat-health'), date: addDays(today, -12), payee: 'Neighborhood Pharmacy' });
  add({ type: 'expense', amount: 32_00, categoryId: exp('cat-other'), date: addDays(today, -19), payee: 'Birthday gift', note: 'For a friend' });
  add({ type: 'income', amount: 40_00, categoryId: inc('cat-other-income'), date: addDays(today, -9), payee: 'Sold old bike' });

  // Never keep a demo payment that would collide with a real one.
  const taken = new Set(state.transactions.filter((t) => t.link).map((t) => occurrenceKey(t.link!.recurringId, t.link!.date)));
  const demoTx = transactions.filter((t) => !t.link || !taken.has(occurrenceKey(t.link.recurringId, t.link.date)));

  const categories = state.categories.map((c) => (c.id in DEMO_PLANNED ? { ...c, planned: DEMO_PLANNED[c.id] } : c));
  return {
    ...state,
    settings: { ...state.settings, openingBalance: 640_00, balanceAsOf: start },
    categories,
    recurring: [...state.recurring, ...recurring],
    transactions: [...state.transactions, ...demoTx],
    meta: {
      ...state.meta,
      setupDone: true,
      demo: {
        openingBalance: state.settings.openingBalance,
        balanceAsOf: state.settings.balanceAsOf,
        planned: Object.fromEntries(state.categories.map((c) => [c.id, c.planned])),
        applied: {
          openingBalance: 640_00,
          balanceAsOf: start,
          planned: Object.fromEntries(categories.map((c) => [c.id, c.planned])),
        },
      },
    },
  };

  function item(
    id: string,
    kind: RecurringItem['kind'],
    name: string,
    amount: number,
    categoryId: string,
    frequency: RecurringItem['frequency'],
    startDate: ISODate,
  ): RecurringItem {
    return { id, kind, name, amount, categoryId, frequency, startDate, paused: false, skipped: [], createdAt: now, demo: true };
  }
}

/**
 * Remove everything marked demo. Settings the demo changed are put back only
 * if the person hasn't changed them since; if they updated their balance while
 * the demo was loaded, today's balance is kept as they set it.
 */
export function clearDemoData(state: AppData, today: ISODate): AppData {
  const snapshot = state.meta.demo;
  const applied = snapshot?.applied;
  const removed = new Set(state.recurring.filter((r) => r.demo).map((r) => r.id));
  const { demo: _drop, ...meta } = state.meta;
  const nothingLeft = !state.transactions.some((t) => !t.demo) && !state.recurring.some((r) => !r.demo);

  const cleared: AppData = {
    ...state,
    // Back to a blank slate: show the welcome steps again.
    meta: nothingLeft ? { ...meta, setupDone: false } : meta,
    categories: state.categories
      .filter((c) => !c.demo)
      .map((c) => {
        if (!snapshot || !(c.id in snapshot.planned)) return c;
        const untouched = !applied || applied.planned[c.id] === c.planned;
        return untouched ? { ...c, planned: snapshot.planned[c.id] } : c;
      }),
    recurring: state.recurring.filter((r) => !r.demo),
    transactions: state.transactions
      .filter((t) => !t.demo)
      .map((t) => {
        if (!t.link || !removed.has(t.link.recurringId)) return t;
        const { link: _l, ...rest } = t;
        return rest;
      }),
  };

  const settings = { ...state.settings };
  if (settings.primaryIncomeId && removed.has(settings.primaryIncomeId)) settings.primaryIncomeId = undefined;
  if (snapshot) {
    const balanceUntouched = !applied || (applied.openingBalance === settings.openingBalance && applied.balanceAsOf === settings.balanceAsOf);
    if (balanceUntouched) {
      settings.openingBalance = snapshot.openingBalance;
      settings.balanceAsOf = snapshot.balanceAsOf;
    } else {
      const keep = currentBalance(state, today);
      settings.openingBalance = openingBalanceFor({ ...cleared, settings }, keep, today);
    }
  }
  return { ...cleared, settings };
}
