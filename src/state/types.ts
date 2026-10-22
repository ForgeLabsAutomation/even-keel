import type { ISODate } from '../lib/dates';
import type { Cents } from '../lib/money';

export type TxType = 'expense' | 'income';

export type Frequency = 'once' | 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'yearly';

export type CategoryIcon =
  | 'home'
  | 'zap'
  | 'cart'
  | 'car'
  | 'health'
  | 'dining'
  | 'personal'
  | 'savings'
  | 'other'
  | 'paycheck'
  | 'gift'
  | 'phone'
  | 'shield'
  | 'kids'
  | 'pet'
  | 'fun'
  | 'education'
  | 'travel';

export type CategoryColor = 'blue' | 'orange' | 'aqua' | 'yellow' | 'magenta' | 'green' | 'violet' | 'red' | 'slate';

export interface Category {
  id: string;
  name: string;
  type: TxType;
  color: CategoryColor;
  icon: CategoryIcon;
  /** Monthly spending limit in cents (0 = no limit set). Expense categories only. */
  planned: Cents;
  demo?: boolean;
}

/** Ties a transaction to one occurrence of a recurring bill or paycheck. */
export interface OccurrenceLink {
  recurringId: string;
  /** The scheduled date of the occurrence this transaction settles. */
  date: ISODate;
}

export interface Transaction {
  id: string;
  type: TxType;
  /** Always positive; `type` decides the direction. */
  amount: Cents;
  categoryId: string;
  date: ISODate;
  payee?: string;
  note?: string;
  link?: OccurrenceLink;
  createdAt: string;
  updatedAt?: string;
  demo?: boolean;
}

/**
 * A recurring definition: a bill (money out) or an income source (money in).
 * Individual occurrences are generated from the schedule and are never stored,
 * so marking one paid can't alter the schedule or create duplicates.
 */
export interface RecurringItem {
  id: string;
  kind: 'bill' | 'income';
  name: string;
  /** Usual amount in cents. */
  amount: Cents;
  categoryId: string;
  frequency: Frequency;
  /** First (or next) scheduled date; the schedule is anchored on it. */
  startDate: ISODate;
  /** Second day of the month for twice-a-month schedules. */
  secondDay?: number;
  paused: boolean;
  /** When it was paused; dates missed while paused are skipped on resume. */
  pausedOn?: ISODate;
  /** Occurrence dates the user chose to skip. */
  skipped: ISODate[];
  note?: string;
  createdAt: string;
  demo?: boolean;
}

export type PeriodMode = 'month' | 'payperiod';
export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  currency: string;
  /** Balance the person told us they had at the start of `balanceAsOf`. */
  openingBalance: Cents;
  balanceAsOf: ISODate;
  defaultView: PeriodMode;
  theme: ThemePreference;
  reminders: boolean;
  /** Remind about unpaid bills due within this many days. */
  reminderDays: number;
  /** Income source that defines pay periods. Falls back to the most frequent one. */
  primaryIncomeId?: string;
}

export interface DemoSnapshot {
  /** Values from before demo data was loaded. */
  openingBalance: Cents;
  balanceAsOf: ISODate;
  planned: Record<string, Cents>;
  /** What the demo set, so removal only restores values the person hasn't changed since. */
  applied?: {
    openingBalance: Cents;
    balanceAsOf: ISODate;
    planned: Record<string, Cents>;
  };
}

export interface Meta {
  createdAt: string;
  /** True once the person has finished or dismissed the welcome setup. */
  setupDone: boolean;
  /** Present while demo data is loaded so it can be removed cleanly. */
  demo?: DemoSnapshot;
  lastReminderDate?: ISODate;
}

export interface AppData {
  version: 1;
  settings: Settings;
  categories: Category[];
  transactions: Transaction[];
  recurring: RecurringItem[];
  meta: Meta;
}
