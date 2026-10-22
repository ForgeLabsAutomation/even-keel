import { addDays, daysBetween, isValidISODate, parts, type ISODate } from './dates';
import { parseAmount, type Cents } from './money';
import type { Category, Frequency, TxType } from '../state/types';

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export const MAX_PAYEE = 80;
export const MAX_NOTE = 500;
export const MAX_NAME = 60;

function validateDate(value: string, today: ISODate, { label, maxDaysAhead, maxDaysBack }: { label: string; maxDaysAhead: number; maxDaysBack: number }) {
  if (!value) return `Choose ${label}.`;
  if (!isValidISODate(value)) return 'Enter a real date, like 2026-10-21.';
  if (daysBetween(value, today) > maxDaysBack) return `That's more than ${Math.round(maxDaysBack / 365)} years ago. Check the year.`;
  if (daysBetween(today, value) > maxDaysAhead) {
    return maxDaysAhead >= 365 ? `That's more than ${Math.round(maxDaysAhead / 365)} year${maxDaysAhead >= 730 ? 's' : ''} away. Check the year.` : 'That date is too far ahead.';
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Transactions

export interface TransactionInput {
  type: TxType;
  amount: string;
  categoryId: string;
  date: string;
  payee: string;
  note: string;
}

export interface ValidTransaction {
  type: TxType;
  amount: Cents;
  categoryId: string;
  date: ISODate;
  payee?: string;
  note?: string;
}

export type TransactionField = 'amount' | 'categoryId' | 'date' | 'payee' | 'note';

export function validateTransaction(
  input: TransactionInput,
  categories: Category[],
  today: ISODate,
): { errors: FieldErrors<TransactionField>; value?: ValidTransaction } {
  const errors: FieldErrors<TransactionField> = {};
  const amount = parseAmount(input.amount);
  if (!amount.ok) errors.amount = amount.error;

  const category = categories.find((c) => c.id === input.categoryId);
  if (!category) errors.categoryId = 'Pick a category.';
  else if (category.type !== input.type) errors.categoryId = `Pick an ${input.type === 'income' ? 'income' : 'expense'} category.`;

  const dateError = validateDate(input.date, today, { label: 'a date', maxDaysAhead: 365, maxDaysBack: 365 * 30 });
  if (dateError) errors.date = dateError;

  const payee = input.payee.trim();
  if (payee.length > MAX_PAYEE) errors.payee = `Keep this under ${MAX_PAYEE} characters.`;
  const note = input.note.trim();
  if (note.length > MAX_NOTE) errors.note = `Keep notes under ${MAX_NOTE} characters.`;

  if (Object.keys(errors).length > 0 || !amount.ok) return { errors };
  return {
    errors,
    value: {
      type: input.type,
      amount: amount.cents,
      categoryId: input.categoryId,
      date: input.date,
      ...(payee ? { payee } : {}),
      ...(note ? { note } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Bills and income sources

export interface RecurringInput {
  name: string;
  amount: string;
  categoryId: string;
  frequency: Frequency;
  startDate: string;
  secondDay: string;
  note: string;
}

export interface ValidRecurring {
  name: string;
  amount: Cents;
  categoryId: string;
  frequency: Frequency;
  startDate: ISODate;
  secondDay?: number;
  note?: string;
}

export type RecurringField = 'name' | 'amount' | 'categoryId' | 'frequency' | 'startDate' | 'secondDay' | 'note';

export function validateRecurring(
  input: RecurringInput,
  kind: 'bill' | 'income',
  categories: Category[],
  today: ISODate,
  /** When editing and the schedule's original start date is kept, it may be long past. */
  { keepStartDate = false }: { keepStartDate?: boolean } = {},
): { errors: FieldErrors<RecurringField>; value?: ValidRecurring } {
  const errors: FieldErrors<RecurringField> = {};
  const name = input.name.trim();
  if (!name) errors.name = kind === 'bill' ? 'Give the bill a name, like "Rent".' : 'Give it a name, like "Paycheck".';
  else if (name.length > MAX_NAME) errors.name = `Keep the name under ${MAX_NAME} characters.`;

  const amount = parseAmount(input.amount);
  if (!amount.ok) errors.amount = amount.error;

  const wantType = kind === 'income' ? 'income' : 'expense';
  const category = categories.find((c) => c.id === input.categoryId);
  if (!category || category.type !== wantType) errors.categoryId = 'Pick a category.';

  const dateLabel = kind === 'bill' ? 'the next due date' : 'the next payday';
  const dateError = keepStartDate
    ? isValidISODate(input.startDate)
      ? undefined
      : 'Enter a real date, like 2026-10-21.'
    : validateDate(input.startDate, today, { label: dateLabel, maxDaysAhead: 730, maxDaysBack: 365 });
  if (dateError) errors.startDate = dateError;

  let secondDay: number | undefined;
  if (input.frequency === 'semimonthly') {
    const n = Number(input.secondDay);
    if (!input.secondDay || !Number.isInteger(n) || n < 1 || n > 31) {
      errors.secondDay = 'Choose the second day of the month (1–31).';
    } else if (!errors.startDate) {
      const first = parts(input.startDate)[2];
      if (Math.abs(first - n) < 7) errors.secondDay = 'The two days should be at least a week apart.';
      else secondDay = n;
    } else {
      secondDay = n;
    }
  }

  const note = input.note.trim();
  if (note.length > MAX_NOTE) errors.note = `Keep notes under ${MAX_NOTE} characters.`;

  if (Object.keys(errors).length > 0 || !amount.ok) return { errors };
  return {
    errors,
    value: {
      name,
      amount: amount.cents,
      categoryId: input.categoryId,
      frequency: input.frequency,
      startDate: input.startDate,
      ...(secondDay ? { secondDay } : {}),
      ...(note ? { note } : {}),
    },
  };
}

/** A gentle heads-up (not an error) for dates in the past. */
export function pastDateHint(kind: 'bill' | 'income', startDate: string, today: ISODate): string | undefined {
  if (!isValidISODate(startDate) || startDate >= today) return undefined;
  return kind === 'bill'
    ? 'This date has passed, so it will show as overdue until you mark it paid or skip it.'
    : 'This payday has passed. You can record it as received once it’s saved.';
}

export function yesterday(today: ISODate): ISODate {
  return addDays(today, -1);
}
