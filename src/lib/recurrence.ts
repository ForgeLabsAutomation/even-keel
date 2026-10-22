/**
 * Recurring schedules.
 *
 * A schedule is anchored on `startDate`. Occurrences are always computed from
 * the anchor (never from the previous occurrence), so they are deterministic:
 * asking for overlapping ranges, or for the same range twice, always yields
 * the same dates and never duplicates.
 *
 * Month-based schedules keep the anchor's day of month and use the last day of
 * shorter months, e.g. a bill due on the 31st is due Feb 28 (or 29) and then
 * Mar 31 again.
 */
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  daysInMonth,
  formatLong,
  formatShort,
  isValidISODate,
  makeDate,
  maxDate,
  monthsBetween,
  ordinal,
  parts,
  weekday,
  type ISODate,
} from './dates';
import type { Frequency } from '../state/types';

export interface Schedule {
  frequency: Frequency;
  startDate: ISODate;
  secondDay?: number;
}

export interface RangeOptions {
  /** Extend the schedule backwards before its start date (used for pay periods). */
  allowBeforeStart?: boolean;
}

const STEP_DAYS: Partial<Record<Frequency, number>> = { weekly: 7, biweekly: 14 };
const STEP_MONTHS: Partial<Record<Frequency, number>> = { monthly: 1, quarterly: 3, yearly: 12 };
const MAX_RESULTS = 2000;

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  once: 'One time',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  yearly: 'Yearly',
};

export const BILL_FREQUENCIES: Frequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly', 'once'];
export const INCOME_FREQUENCIES: Frequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly', 'once'];

export function occurrencesPerYear(frequency: Frequency): number {
  switch (frequency) {
    case 'weekly':
      return 52;
    case 'biweekly':
      return 26;
    case 'semimonthly':
      return 24;
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'yearly':
      return 1;
    case 'once':
      return 0;
  }
}

/** Average monthly cost of a recurring amount (one-time items count as 0). */
export function monthlyEquivalent(amount: number, frequency: Frequency): number {
  return Math.round((amount * occurrencesPerYear(frequency)) / 12);
}

/** Sensible default for the second payday of a twice-a-month schedule. */
export function defaultSecondDay(firstDay: number): number {
  if (firstDay <= 14) return firstDay + 14;
  if (firstDay === 15) return 31;
  return firstDay - 14;
}

function semimonthlyDays(schedule: Schedule): [number, number] {
  const first = parts(schedule.startDate)[2];
  const second = schedule.secondDay && schedule.secondDay >= 1 && schedule.secondDay <= 31 ? schedule.secondDay : defaultSecondDay(first);
  return first <= second ? [first, second] : [second, first];
}

/** All occurrence dates within [from, to], inclusive and in ascending order. */
export function occurrencesBetween(schedule: Schedule, from: ISODate, to: ISODate, options: RangeOptions = {}): ISODate[] {
  const { frequency, startDate } = schedule;
  if (!isValidISODate(startDate) || !isValidISODate(from) || !isValidISODate(to)) return [];
  const lo = options.allowBeforeStart && frequency !== 'once' ? from : maxDate(from, startDate);
  if (lo > to) return [];
  const out: ISODate[] = [];

  if (frequency === 'once') {
    if (startDate >= lo && startDate <= to) out.push(startDate);
    return out;
  }

  const stepDays = STEP_DAYS[frequency];
  if (stepDays) {
    const k = Math.ceil(daysBetween(startDate, lo) / stepDays);
    for (let d = addDays(startDate, k * stepDays); d <= to && out.length < MAX_RESULTS; d = addDays(d, stepDays)) {
      out.push(d);
    }
    return out;
  }

  const stepMonths = STEP_MONTHS[frequency];
  if (stepMonths) {
    const anchorDay = parts(startDate)[2];
    let k = Math.floor(monthsBetween(startDate, lo) / stepMonths) - 1;
    for (let guard = 0; guard < MAX_RESULTS * 2; guard++, k++) {
      const d = addMonthsClamped(startDate, k * stepMonths, anchorDay);
      if (d > to) break;
      if (d >= lo) out.push(d);
    }
    return out;
  }

  // Twice a month.
  const [dayA, dayB] = semimonthlyDays(schedule);
  const [ly, lm] = parts(lo);
  const months = monthsBetween(lo, to);
  for (let i = 0; i <= months && out.length < MAX_RESULTS; i++) {
    const y = ly + Math.floor((lm - 1 + i) / 12);
    const m = ((lm - 1 + i) % 12) + 1;
    const dim = daysInMonth(y, m);
    for (const day of [dayA, dayB]) {
      const d = makeDate(y, m, Math.min(day, dim));
      if (d >= lo && d <= to && out[out.length - 1] !== d) out.push(d);
    }
  }
  return out;
}

/** The first occurrence on or after `date`, or null when there is none. */
export function nextOnOrAfter(schedule: Schedule, date: ISODate, options: RangeOptions = {}): ISODate | null {
  if (schedule.frequency === 'once') return schedule.startDate >= date ? schedule.startDate : null;
  const from = options.allowBeforeStart ? date : maxDate(date, schedule.startDate);
  return occurrencesBetween(schedule, from, addDays(from, 370), options)[0] ?? null;
}

/** The last occurrence on or before `date`, or null when there is none. */
export function previousOnOrBefore(schedule: Schedule, date: ISODate, options: RangeOptions = {}): ISODate | null {
  const list = occurrencesBetween(schedule, addDays(date, -370), date, options);
  return list[list.length - 1] ?? null;
}

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayOfMonthText(day: number): string {
  return day >= 31 ? 'last day' : ordinal(day);
}

/** Human description, e.g. "Monthly on the 31st (last day in shorter months)". */
export function describeSchedule(schedule: Schedule): string {
  const { frequency, startDate } = schedule;
  if (!isValidISODate(startDate)) return FREQUENCY_LABELS[frequency];
  const day = parts(startDate)[2];
  const shortMonthNote = day >= 29 ? ' (or the last day of shorter months)' : '';
  switch (frequency) {
    case 'once':
      return `One time on ${formatLong(startDate)}`;
    case 'weekly':
      return `Every ${weekdayNames[weekday(startDate)]}`;
    case 'biweekly':
      return `Every other ${weekdayNames[weekday(startDate)]}`;
    case 'semimonthly': {
      const [a, b] = semimonthlyDays(schedule);
      return `Twice a month on the ${dayOfMonthText(a)} and ${dayOfMonthText(b)}`;
    }
    case 'monthly':
      return `Monthly on the ${ordinal(day)}${shortMonthNote}`;
    case 'quarterly':
      return `Every 3 months on the ${ordinal(day)}${shortMonthNote}`;
    case 'yearly':
      return `Yearly on ${formatShort(startDate)}`;
  }
}
