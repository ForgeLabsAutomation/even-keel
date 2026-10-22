/**
 * Budget calculations. Everything here is a pure function of the stored data
 * and "today", so every screen shows the same numbers.
 *
 * Vocabulary used throughout the app:
 *  - received income  : income transactions the person recorded (actual money in)
 *  - expected income  : scheduled paydays not yet recorded (a forecast)
 *  - spent            : expense transactions, including bill payments (actual money out)
 *  - planned          : the person's spending limits (a plan, not money)
 *  - balance          : starting balance + everything recorded since (an estimate,
 *                       because it is not linked to a bank)
 *  - projected        : balance after expected income and unpaid bills
 */
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  endOfMonth,
  formatMonthYear,
  formatRange,
  isBetween,
  startOfMonth,
  type ISODate,
} from './dates';
import type { Cents } from './money';
import { monthlyEquivalent, nextOnOrAfter, occurrencesBetween, occurrencesPerYear, previousOnOrBefore } from './recurrence';
import type { AppData, Category, PeriodMode, RecurringItem, Transaction, TxType } from '../state/types';

/** Unpaid bills older than this stop being flagged as overdue. */
export const OVERDUE_LOOKBACK_DAYS = 60;

export function signed(tx: Transaction): Cents {
  return tx.type === 'income' ? tx.amount : -tx.amount;
}

/**
 * The date a transaction belongs to in period totals. A paycheck counts on
 * its scheduled payday even if it arrived a day early, so a pay period never
 * shows "nothing received, nothing expected". Balances still use `tx.date`.
 */
export function periodDate(tx: Transaction): ISODate {
  return tx.type === 'income' && tx.link ? tx.link.date : tx.date;
}

export function occurrenceKey(recurringId: string, date: ISODate): string {
  return `${recurringId}|${date}`;
}

export function linkIndex(transactions: Transaction[]): Map<string, Transaction> {
  const map = new Map<string, Transaction>();
  for (const tx of transactions) {
    if (tx.link) map.set(occurrenceKey(tx.link.recurringId, tx.link.date), tx);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Balance

/** Estimated balance today: starting balance plus everything recorded from its date up to today. */
export function currentBalance(data: AppData, today: ISODate): Cents {
  const { openingBalance, balanceAsOf } = data.settings;
  let total = openingBalance;
  for (const tx of data.transactions) {
    if (tx.date >= balanceAsOf && tx.date <= today) total += signed(tx);
  }
  return total;
}

/** Starting balance that makes today's estimated balance equal `actual`. */
export function openingBalanceFor(data: AppData, actual: Cents, today: ISODate): Cents {
  return actual - (currentBalance(data, today) - data.settings.openingBalance);
}

// ---------------------------------------------------------------------------
// Occurrences

export type OccurrenceStatus = 'settled' | 'open' | 'skipped';

export interface Occurrence {
  key: string;
  item: RecurringItem;
  date: ISODate;
  /** Actual amount when settled, otherwise the scheduled amount. */
  amount: Cents;
  status: OccurrenceStatus;
  overdue: boolean;
  transaction?: Transaction;
}

export interface OccurrenceQuery {
  kind: RecurringItem['kind'];
  from: ISODate;
  to: ISODate;
  today: ISODate;
  /** Only include one item. */
  recurringId?: string;
}

/**
 * Bill or income occurrences in a date range, combining the schedule with the
 * transactions that settled them. Each (item, date) pair appears at most once.
 */
export function occurrencesInRange(data: AppData, query: OccurrenceQuery, index = linkIndex(data.transactions)): Occurrence[] {
  const { kind, from, to, today, recurringId } = query;
  const out: Occurrence[] = [];
  for (const item of data.recurring) {
    if (item.kind !== kind) continue;
    if (recurringId && item.id !== recurringId) continue;
    const seen = new Set<string>();
    for (const date of occurrencesBetween(item, from, to)) {
      const key = occurrenceKey(item.id, date);
      seen.add(key);
      const tx = index.get(key);
      if (tx) {
        out.push({ key, item, date, amount: tx.amount, status: 'settled', overdue: false, transaction: tx });
      } else if (!item.paused) {
        const skipped = item.skipped.includes(date);
        out.push({
          key,
          item,
          date,
          amount: item.amount,
          status: skipped ? 'skipped' : 'open',
          overdue: !skipped && date < today,
        });
      }
    }
    // Payments recorded against dates that are no longer on the schedule
    // (because the schedule was edited) still belong in the history.
    for (const tx of data.transactions) {
      if (!tx.link || tx.link.recurringId !== item.id || !isBetween(tx.link.date, from, to)) continue;
      const key = occurrenceKey(item.id, tx.link.date);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, item, date: tx.link.date, amount: tx.amount, status: 'settled', overdue: false, transaction: tx });
    }
  }
  out.sort((a, b) => (a.date === b.date ? a.item.name.localeCompare(b.item.name) : a.date < b.date ? -1 : 1));
  return out;
}

/** Overdue (within the lookback window) and upcoming unpaid bills through `days` from today. */
export function upcomingBills(data: AppData, today: ISODate, days: number, index = linkIndex(data.transactions)): Occurrence[] {
  return occurrencesInRange(
    data,
    { kind: 'bill', from: addDays(today, -OVERDUE_LOOKBACK_DAYS), to: addDays(today, days), today },
    index,
  ).filter((o) => o.status === 'open' || (o.status === 'settled' && o.date >= today));
}

/** Next unsettled occurrence of an item on or after `from`. */
export function nextOpenOccurrence(data: AppData, item: RecurringItem, from: ISODate, index = linkIndex(data.transactions)): ISODate | null {
  if (item.paused) return null;
  for (const date of occurrencesBetween(item, from, addDays(from, 800))) {
    if (!index.has(occurrenceKey(item.id, date)) && !item.skipped.includes(date)) return date;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Paydays and pay periods

/** The paycheck that defines pay periods: the chosen one, else the most frequent active one. */
export function primaryIncome(data: AppData): RecurringItem | null {
  const candidates = data.recurring.filter((r) => r.kind === 'income' && !r.paused && r.frequency !== 'once');
  if (candidates.length === 0) return null;
  const chosen = candidates.find((r) => r.id === data.settings.primaryIncomeId);
  if (chosen) return chosen;
  return [...candidates].sort(
    (a, b) => occurrencesPerYear(b.frequency) - occurrencesPerYear(a.frequency) || a.createdAt.localeCompare(b.createdAt),
  )[0];
}

export interface NextPayday {
  date: ISODate;
  total: Cents;
  items: { item: RecurringItem; amount: Cents }[];
}

/** Earliest expected payday (not yet recorded or skipped) on or after today. */
export function nextPayday(data: AppData, today: ISODate, index = linkIndex(data.transactions)): NextPayday | null {
  let best: NextPayday | null = null;
  for (const item of data.recurring) {
    if (item.kind !== 'income') continue;
    const date = nextOpenOccurrence(data, item, today, index);
    if (!date) continue;
    if (!best || date < best.date) best = { date, total: item.amount, items: [{ item, amount: item.amount }] };
    else if (date === best.date) {
      best.total += item.amount;
      best.items.push({ item, amount: item.amount });
    }
  }
  return best;
}

/** How far ahead the payday estimate looks for bills later paychecks can't cover. */
export const LOOKAHEAD_DAYS = 42;

export interface PaydayOutlook {
  balance: Cents;
  payday: NextPayday | null;
  /** Last day the estimate covers (the day before payday, or 30 days out). */
  horizon: ISODate;
  daysUntil: number;
  /** Unpaid bills (including overdue ones) due before payday. */
  bills: Occurrence[];
  billsTotal: Cents;
  /** Future-dated expenses already entered that fall before payday. */
  scheduled: Cents;
  /**
   * Extra held back because a bill after payday wouldn't be covered by the
   * paychecks expected before it, once planned everyday spending for the days
   * after payday is set aside (looking ahead six weeks).
   */
  heldForLater: Cents;
  /** Planned everyday spending per day (category limits not covered by bills) used in the look-ahead. */
  plannedPerDay: number;
  /** Bills on the day the look-ahead balance is lowest, when money is held back for them. */
  lowPoint: { date: ISODate; bills: Occurrence[] } | null;
  /** What can be spent before payday without missing a known bill. */
  left: Cents;
  perDay: Cents;
}

/** How much is free to spend between now and the next payday. */
export function paydayOutlook(data: AppData, today: ISODate): PaydayOutlook {
  const index = linkIndex(data.transactions);
  const balance = currentBalance(data, today);
  const payday = nextPayday(data, today, index);
  const horizon = payday ? addDays(payday.date, -1) : addDays(today, 30);
  const lookaheadEnd = payday ? addDays(today, Math.max(LOOKAHEAD_DAYS, daysBetween(today, horizon))) : horizon;

  const openBills = occurrencesInRange(
    data,
    { kind: 'bill', from: addDays(today, -OVERDUE_LOOKBACK_DAYS), to: lookaheadEnd, today },
    index,
  ).filter((o) => o.status === 'open');
  const bills = openBills.filter((o) => o.date <= horizon);
  const billsTotal = bills.reduce((s, o) => s + o.amount, 0);
  let scheduled = 0;
  for (const tx of data.transactions) {
    if (tx.type === 'expense' && tx.date > today && tx.date <= horizon) scheduled += tx.amount;
  }
  const simpleLeft = balance - billsTotal - scheduled;

  // Walk forward day by day with known money in and out and find the lowest
  // point the balance would reach on a day something is due. Pay that lands on
  // a bill's due date is counted first, matching the "bills due before payday"
  // rule above. From payday on, the person's planned everyday spending is set
  // aside too, so a big bill after payday stays covered without assuming they
  // stop buying groceries.
  const plannedPerDay = payday ? plannedEverydayPerDay(data) : 0;
  type Day = { out: Cents; in: Cents; bills: Occurrence[] };
  const days = new Map<ISODate, Day>();
  const day = (d: ISODate) => {
    let entry = days.get(d);
    if (!entry) days.set(d, (entry = { out: 0, in: 0, bills: [] }));
    return entry;
  };
  for (const o of openBills) {
    const entry = day(o.date < today ? today : o.date);
    entry.out += o.amount;
    entry.bills.push(o);
  }
  for (const tx of data.transactions) {
    if (tx.date <= today || tx.date > lookaheadEnd) continue;
    if (tx.type === 'expense') day(tx.date).out += tx.amount;
    else day(tx.date).in += tx.amount;
  }
  if (payday) {
    for (const o of occurrencesInRange(data, { kind: 'income', from: today, to: lookaheadEnd, today }, index)) {
      if (o.status === 'open') day(o.date).in += o.amount;
    }
  }
  let running = balance;
  let lowest = balance;
  let lowestDay: { date: ISODate; bills: Occurrence[] } | null = null;
  for (const date of [...days.keys()].sort()) {
    const entry = days.get(date)!;
    running += entry.in - entry.out;
    if (entry.out === 0 && date > horizon) continue; // only check days when something is due
    const everyday = payday && date >= payday.date ? Math.round(plannedPerDay * (daysBetween(payday.date, date) + 1)) : 0;
    const projected = running - everyday;
    if (projected < lowest) {
      lowest = projected;
      lowestDay = { date, bills: entry.bills };
    }
  }

  const left = Math.min(simpleLeft, lowest);
  const heldForLater = simpleLeft - left;
  const daysUntil = payday ? daysBetween(today, payday.date) : 30;
  const perDay = left > 0 ? Math.floor(left / Math.max(daysUntil, 1)) : 0;
  return {
    balance,
    payday,
    horizon,
    daysUntil,
    bills,
    billsTotal,
    scheduled,
    heldForLater,
    plannedPerDay,
    lowPoint: heldForLater > 0 ? lowestDay : null,
    left,
    perDay,
  };
}

/**
 * Planned everyday spending per day: each expense category's monthly limit
 * minus the bills that already cover it, spread over the year. Zero when no
 * limits are set.
 */
export function plannedEverydayPerDay(data: AppData): number {
  let monthly = 0;
  for (const c of data.categories) {
    if (c.type === 'expense' && c.planned > 0) monthly += Math.max(0, c.planned - monthlyBillLoad(data, c.id));
  }
  return (monthly * 12) / 365;
}

/**
 * Projected balance at the end of a period that hasn't finished: today's
 * balance plus expected pay, minus unpaid bills and already-entered future
 * spending. It ignores everyday spending that hasn't been entered yet.
 */
export function projectedBalanceAt(data: AppData, end: ISODate, today: ISODate): Cents | null {
  if (end < today) return null;
  const index = linkIndex(data.transactions);
  let total = currentBalance(data, today);
  for (const o of occurrencesInRange(data, { kind: 'bill', from: addDays(today, -OVERDUE_LOOKBACK_DAYS), to: end, today }, index)) {
    if (o.status === 'open') total -= o.amount;
  }
  for (const o of occurrencesInRange(data, { kind: 'income', from: today, to: end, today }, index)) {
    if (o.status === 'open') total += o.amount;
  }
  for (const tx of data.transactions) {
    if (tx.date > today && tx.date <= end) total += signed(tx);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Periods

export interface Period {
  mode: PeriodMode;
  start: ISODate;
  end: ISODate;
  label: string;
  /** 0 = the period containing today. */
  offset: number;
}

export function monthPeriod(today: ISODate, offset = 0): Period {
  const start = addMonthsClamped(startOfMonth(today), offset, 1);
  return { mode: 'month', start, end: endOfMonth(start), label: formatMonthYear(start), offset };
}

export function payPeriod(data: AppData, today: ISODate, offset = 0): Period | null {
  const primary = primaryIncome(data);
  if (!primary) return null;
  const opts = { allowBeforeStart: true };
  const first = previousOnOrBefore(primary, today, opts);
  if (!first) return null;
  let start: ISODate = first;
  for (let i = 0; i < Math.abs(offset); i++) {
    const moved: ISODate | null =
      offset > 0 ? nextOnOrAfter(primary, addDays(start, 1), opts) : previousOnOrBefore(primary, addDays(start, -1), opts);
    if (!moved) return null;
    start = moved;
  }
  const next = nextOnOrAfter(primary, addDays(start, 1), opts);
  if (!next) return null;
  const end = addDays(next, -1);
  return { mode: 'payperiod', start, end, label: formatRange(start, end), offset };
}

export function periodFor(data: AppData, mode: PeriodMode, today: ISODate, offset = 0): Period {
  if (mode === 'payperiod') {
    const p = payPeriod(data, today, offset);
    if (p) return p;
  }
  return monthPeriod(today, offset);
}

export function periodDays(period: Pick<Period, 'start' | 'end'>): number {
  return daysBetween(period.start, period.end) + 1;
}

export interface PeriodSummary {
  incomeReceived: Cents;
  /** Paydays in the period that have not happened or been recorded yet. */
  incomeExpected: Cents;
  /** Paydays already passed in this period with nothing recorded. */
  incomeUnrecorded: Occurrence[];
  spent: Cents;
  billsTotal: Cents;
  billsPaid: Cents;
  billsUnpaid: Cents;
  billsUnpaidCount: number;
  bills: Occurrence[];
  paydays: Occurrence[];
  net: Cents;
}

export function summarizePeriod(data: AppData, period: Pick<Period, 'start' | 'end'>, today: ISODate): PeriodSummary {
  const index = linkIndex(data.transactions);
  let incomeReceived = 0;
  let spent = 0;
  for (const tx of data.transactions) {
    if (!isBetween(periodDate(tx), period.start, period.end)) continue;
    if (tx.type === 'income') incomeReceived += tx.amount;
    else spent += tx.amount;
  }
  const bills = occurrencesInRange(data, { kind: 'bill', from: period.start, to: period.end, today }, index);
  const paydays = occurrencesInRange(data, { kind: 'income', from: period.start, to: period.end, today }, index);
  let billsPaid = 0;
  let billsUnpaid = 0;
  let billsUnpaidCount = 0;
  for (const o of bills) {
    if (o.status === 'settled') billsPaid += o.amount;
    else if (o.status === 'open') {
      billsUnpaid += o.amount;
      billsUnpaidCount++;
    }
  }
  let incomeExpected = 0;
  const incomeUnrecorded: Occurrence[] = [];
  for (const o of paydays) {
    if (o.status !== 'open') continue;
    if (o.date >= today) incomeExpected += o.amount;
    else incomeUnrecorded.push(o);
  }
  return {
    incomeReceived,
    incomeExpected,
    incomeUnrecorded,
    spent,
    billsTotal: billsPaid + billsUnpaid,
    billsPaid,
    billsUnpaid,
    billsUnpaidCount,
    bills,
    paydays,
    net: incomeReceived - spent,
  };
}

// ---------------------------------------------------------------------------
// Categories: planned vs actual

export interface CategoryRow {
  category: Category;
  planned: Cents;
  spent: Cents;
  remaining: Cents;
  /** Scheduled bills in this category during the period. */
  billsInPeriod: Cents;
  /** Average monthly bill cost in this category. */
  monthlyBills: Cents;
  /** True when planned was derived from the monthly limit for a shorter period. */
  prorated: boolean;
}

export function monthlyBillLoad(data: AppData, categoryId: string): Cents {
  let total = 0;
  for (const r of data.recurring) {
    if (r.kind === 'bill' && !r.paused && r.categoryId === categoryId) total += monthlyEquivalent(r.amount, r.frequency);
  }
  return total;
}

/**
 * Planned vs spent per expense category.
 *
 * For a calendar month, planned is the category's monthly limit.
 * For a pay period, planned is the bills scheduled in that period plus a
 * prorated share of whatever part of the monthly limit is not covered by bills,
 * so a rent payment doesn't make a two-week period look overspent.
 */
export function categoryRows(data: AppData, period: Pick<Period, 'start' | 'end' | 'mode'>, today: ISODate): CategoryRow[] {
  const spentBy = new Map<string, Cents>();
  for (const tx of data.transactions) {
    if (tx.type !== 'expense' || !isBetween(tx.date, period.start, period.end)) continue;
    spentBy.set(tx.categoryId, (spentBy.get(tx.categoryId) ?? 0) + tx.amount);
  }
  const billsBy = new Map<string, Cents>();
  for (const o of occurrencesInRange(data, { kind: 'bill', from: period.start, to: period.end, today })) {
    if (o.status === 'skipped') continue;
    billsBy.set(o.item.categoryId, (billsBy.get(o.item.categoryId) ?? 0) + o.item.amount);
  }
  const factor = (periodDays(period) * 12) / 365;
  return data.categories
    .filter((c) => c.type === 'expense')
    .map((category) => {
      const spent = spentBy.get(category.id) ?? 0;
      const billsInPeriod = billsBy.get(category.id) ?? 0;
      const monthlyBills = monthlyBillLoad(data, category.id);
      let planned = category.planned;
      let prorated = false;
      if (period.mode === 'payperiod') {
        const flexible = Math.max(0, category.planned - monthlyBills);
        planned = billsInPeriod + Math.round(flexible * factor);
        prorated = true;
      }
      return { category, planned, spent, remaining: planned - spent, billsInPeriod, monthlyBills, prorated };
    });
}

// ---------------------------------------------------------------------------
// Where the money went

export interface SpendingSlice {
  category: Category | null;
  categoryId: string;
  total: Cents;
  share: number;
  count: number;
}

export function spendingByCategory(data: AppData, start: ISODate, end: ISODate): SpendingSlice[] {
  const byId = new Map<string, { total: Cents; count: number }>();
  let grand = 0;
  for (const tx of data.transactions) {
    if (tx.type !== 'expense' || !isBetween(tx.date, start, end)) continue;
    const entry = byId.get(tx.categoryId) ?? { total: 0, count: 0 };
    entry.total += tx.amount;
    entry.count++;
    byId.set(tx.categoryId, entry);
    grand += tx.amount;
  }
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  return [...byId.entries()]
    .map(([categoryId, { total, count }]) => ({
      categoryId,
      category: cats.get(categoryId) ?? null,
      total,
      count,
      share: grand > 0 ? total / grand : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface MonthTotals {
  month: ISODate;
  income: Cents;
  spent: Cents;
}

/** Income received and spending for the `count` months ending with today's month. */
export function monthlyTrend(data: AppData, today: ISODate, count = 6, endOffset = 0): MonthTotals[] {
  const months: MonthTotals[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const p = monthPeriod(today, endOffset - i);
    months.push({ month: p.start, income: 0, spent: 0 });
  }
  const byKey = new Map(months.map((m) => [m.month.slice(0, 7), m]));
  for (const tx of data.transactions) {
    const m = byKey.get(periodDate(tx).slice(0, 7));
    if (!m) continue;
    if (tx.type === 'income') m.income += tx.amount;
    else m.spent += tx.amount;
  }
  return months;
}

export interface PayeeTotal {
  payee: string;
  total: Cents;
  count: number;
}

/** Where everyday spending went, by merchant. Bill payments are left out (they have their own page). */
export function topPayees(data: AppData, start: ISODate, end: ISODate, limit = 5): PayeeTotal[] {
  const map = new Map<string, PayeeTotal>();
  for (const tx of data.transactions) {
    if (tx.type !== 'expense' || tx.link || !tx.payee || !isBetween(tx.date, start, end)) continue;
    const key = tx.payee.trim().toLowerCase();
    const entry = map.get(key) ?? { payee: tx.payee.trim(), total: 0, count: 0 };
    entry.total += tx.amount;
    entry.count++;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Monthly plan

export interface MonthPlan {
  /** Income recorded plus paydays still expected this month. */
  expectedIncome: Cents;
  received: Cents;
  planned: Cents;
  spent: Cents;
  /** Expected income not yet given a spending limit. */
  unplanned: Cents;
}

export function monthPlan(data: AppData, period: Pick<Period, 'start' | 'end'>, today: ISODate): MonthPlan {
  const s = summarizePeriod(data, period, today);
  const planned = data.categories.filter((c) => c.type === 'expense').reduce((sum, c) => sum + c.planned, 0);
  const expectedIncome = s.incomeReceived + s.incomeExpected;
  return { expectedIncome, received: s.incomeReceived, planned, spent: s.spent, unplanned: expectedIncome - planned };
}

// ---------------------------------------------------------------------------
// Saving toward irregular bills

export interface SetAside {
  amount: Cents;
  per: 'paycheck' | 'month';
}

/** How much to put aside each paycheck (or month) so a quarterly/yearly/one-time bill is covered. */
export function setAsideFor(data: AppData, bill: RecurringItem, today: ISODate): SetAside | null {
  if (bill.kind !== 'bill' || bill.paused) return null;
  const primary = primaryIncome(data);
  if (bill.frequency === 'quarterly' || bill.frequency === 'yearly') {
    const perYear = occurrencesPerYear(bill.frequency);
    if (primary) return { amount: Math.ceil((bill.amount * perYear) / occurrencesPerYear(primary.frequency)), per: 'paycheck' };
    return { amount: Math.ceil((bill.amount * perYear) / 12), per: 'month' };
  }
  if (bill.frequency === 'once' && bill.startDate > addDays(today, 14)) {
    if (primary) {
      const paydays = occurrencesBetween(primary, today, addDays(bill.startDate, -1)).length;
      if (paydays > 0) return { amount: Math.ceil(bill.amount / paydays), per: 'paycheck' };
    }
    const months = Math.max(1, Math.round(daysBetween(today, bill.startDate) / 30.4));
    return { amount: Math.ceil(bill.amount / months), per: 'month' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Quick-entry helpers

export interface QuickFill {
  type: TxType;
  amount: Cents;
  categoryId: string;
  payee: string;
}

/** Recent distinct entries the person can repeat with one tap. */
export function recentQuickFills(data: AppData, limit = 4): QuickFill[] {
  const seen = new Set<string>();
  const out: QuickFill[] = [];
  const sorted = [...data.transactions].filter((t) => !t.link && t.payee).sort(byNewest);
  for (const tx of sorted) {
    const key = `${tx.type}|${tx.payee!.trim().toLowerCase()}|${tx.categoryId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: tx.type, amount: tx.amount, categoryId: tx.categoryId, payee: tx.payee!.trim() });
    if (out.length >= limit) break;
  }
  return out;
}

/** Known payees, most recent first, with the category last used for each. */
export function payeeSuggestions(data: AppData, type: TxType): { payee: string; categoryId: string }[] {
  const seen = new Set<string>();
  const out: { payee: string; categoryId: string }[] = [];
  for (const tx of [...data.transactions].sort(byNewest)) {
    if (tx.type !== type || !tx.payee) continue;
    const key = tx.payee.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ payee: tx.payee.trim(), categoryId: tx.categoryId });
  }
  return out;
}

/** Categories ordered by how often they were used recently, for quick picking. */
export function categoriesByUse(data: AppData, type: TxType, today: ISODate): Category[] {
  const since = addDays(today, -90);
  const counts = new Map<string, number>();
  for (const tx of data.transactions) {
    if (tx.type === type && tx.date >= since) counts.set(tx.categoryId, (counts.get(tx.categoryId) ?? 0) + 1);
  }
  const order = new Map(data.categories.map((c, i) => [c.id, i]));
  return data.categories
    .filter((c) => c.type === type)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || order.get(a.id)! - order.get(b.id)!);
}

export function byNewest(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

/**
 * Bill or income occurrences near `date` that a manually entered transaction
 * could settle. Used to avoid counting a paycheck twice (once as expected,
 * once as recorded).
 */
export function linkCandidates(
  data: AppData,
  type: TxType,
  date: ISODate,
  today: ISODate,
  editingId?: string,
): Occurrence[] {
  const kind = type === 'income' ? 'income' : 'bill';
  const index = linkIndex(data.transactions.filter((t) => t.id !== editingId));
  return occurrencesInRange(data, { kind, from: addDays(date, -10), to: addDays(date, 10), today }, index).filter(
    (o) => o.status === 'open',
  );
}

/** The candidate to pre-select: same category and within three days. */
export function suggestedLink(candidates: Occurrence[], categoryId: string, date: ISODate): Occurrence | null {
  let best: Occurrence | null = null;
  for (const o of candidates) {
    if (o.item.categoryId !== categoryId) continue;
    const distance = Math.abs(daysBetween(date, o.date));
    if (distance > 3) continue;
    if (!best || distance < Math.abs(daysBetween(date, best.date))) best = o;
  }
  return best;
}

/** Unpaid bills worth a reminder: overdue ones and those due within `days`. */
export function billsNeedingReminder(data: AppData, today: ISODate, days: number): Occurrence[] {
  return upcomingBills(data, today, days).filter((o) => o.status === 'open');
}
