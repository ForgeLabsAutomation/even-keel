import type { ISODate } from '../lib/dates';
import { nowStamp } from '../lib/ids';
import type { AppData, Category, CategoryColor, CategoryIcon, Settings } from './types';

/**
 * Category colours are named slots; the actual light/dark shades live in CSS
 * (validated for colour-blind separation on both themes). They only ever mark
 * identity beside a text label, never carry meaning on their own.
 */
export const CATEGORY_COLORS: { color: CategoryColor; label: string }[] = [
  { color: 'blue', label: 'Blue' },
  { color: 'orange', label: 'Orange' },
  { color: 'aqua', label: 'Aqua' },
  { color: 'yellow', label: 'Yellow' },
  { color: 'magenta', label: 'Pink' },
  { color: 'green', label: 'Green' },
  { color: 'violet', label: 'Violet' },
  { color: 'red', label: 'Red' },
  { color: 'slate', label: 'Gray' },
];

export const CATEGORY_ICONS: { icon: CategoryIcon; label: string }[] = [
  { icon: 'home', label: 'Home' },
  { icon: 'zap', label: 'Utilities' },
  { icon: 'cart', label: 'Shopping cart' },
  { icon: 'car', label: 'Car' },
  { icon: 'health', label: 'Health' },
  { icon: 'dining', label: 'Dining' },
  { icon: 'personal', label: 'Personal' },
  { icon: 'savings', label: 'Savings' },
  { icon: 'phone', label: 'Phone' },
  { icon: 'shield', label: 'Insurance' },
  { icon: 'kids', label: 'Kids' },
  { icon: 'pet', label: 'Pets' },
  { icon: 'fun', label: 'Fun' },
  { icon: 'education', label: 'Education' },
  { icon: 'travel', label: 'Travel' },
  { icon: 'gift', label: 'Gift' },
  { icon: 'paycheck', label: 'Paycheck' },
  { icon: 'other', label: 'Other' },
];

export const STARTER_CATEGORIES: Category[] = [
  { id: 'cat-housing', name: 'Housing', type: 'expense', color: 'blue', icon: 'home', planned: 0 },
  { id: 'cat-utilities', name: 'Utilities', type: 'expense', color: 'yellow', icon: 'zap', planned: 0 },
  { id: 'cat-groceries', name: 'Groceries', type: 'expense', color: 'green', icon: 'cart', planned: 0 },
  { id: 'cat-transportation', name: 'Transportation', type: 'expense', color: 'aqua', icon: 'car', planned: 0 },
  { id: 'cat-health', name: 'Health', type: 'expense', color: 'red', icon: 'health', planned: 0 },
  { id: 'cat-dining', name: 'Dining', type: 'expense', color: 'orange', icon: 'dining', planned: 0 },
  { id: 'cat-personal', name: 'Personal', type: 'expense', color: 'magenta', icon: 'personal', planned: 0 },
  { id: 'cat-savings', name: 'Savings', type: 'expense', color: 'violet', icon: 'savings', planned: 0 },
  { id: 'cat-other', name: 'Other', type: 'expense', color: 'slate', icon: 'other', planned: 0 },
  { id: 'cat-paycheck', name: 'Paycheck', type: 'income', color: 'green', icon: 'paycheck', planned: 0 },
  { id: 'cat-other-income', name: 'Other income', type: 'income', color: 'aqua', icon: 'gift', planned: 0 },
];

export function defaultSettings(today: ISODate): Settings {
  return {
    currency: guessCurrency(),
    openingBalance: 0,
    balanceAsOf: today,
    defaultView: 'payperiod',
    theme: 'system',
    reminders: true,
    reminderDays: 3,
  };
}

export function createEmptyData(today: ISODate): AppData {
  return {
    version: 1,
    settings: defaultSettings(today),
    categories: STARTER_CATEGORIES.map((c) => ({ ...c })),
    transactions: [],
    recurring: [],
    meta: { createdAt: nowStamp(), setupDone: false },
  };
}

const REGION_CURRENCY: Record<string, string> = {
  US: 'USD',
  CA: 'CAD',
  GB: 'GBP',
  AU: 'AUD',
  NZ: 'NZD',
  MX: 'MXN',
  IN: 'INR',
  PH: 'PHP',
  ZA: 'ZAR',
  CH: 'CHF',
  SE: 'SEK',
  JP: 'JPY',
  BR: 'BRL',
  IE: 'EUR',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  PT: 'EUR',
  FI: 'EUR',
};

function guessCurrency(): string {
  try {
    const locale = new Intl.NumberFormat().resolvedOptions().locale;
    const region = new Intl.Locale(locale).maximize().region;
    return (region && REGION_CURRENCY[region]) || 'USD';
  } catch {
    return 'USD';
  }
}
