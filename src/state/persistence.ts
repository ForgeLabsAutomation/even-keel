/**
 * Loading and saving.
 *
 * In the desktop app, data lives in a JSON file in the user's app-data folder
 * (written atomically by the main process, with a backup copy). When the UI
 * runs in a plain browser (development and tests) it falls back to
 * localStorage.
 *
 * Whatever is loaded is validated and repaired by `normalizeData`, so a
 * hand-edited or partially corrupted file can't crash the app.
 */
import { isValidISODate, type ISODate } from '../lib/dates';
import { MAX_AMOUNT_CENTS } from '../lib/money';
import { CATEGORY_COLORS, CATEGORY_ICONS, STARTER_CATEGORIES, createEmptyData, defaultSettings } from './defaults';
import type { AppData, Category, CategoryColor, CategoryIcon, Frequency, Meta, RecurringItem, Settings, Transaction } from './types';

export const DATA_VERSION = 1;
const STORAGE_KEY = 'even-keel-data';

const FREQUENCIES: Frequency[] = ['once', 'weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly'];
const ICONS = new Set<CategoryIcon>(CATEGORY_ICONS.map((i) => i.icon));

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
};
const cents = (v: unknown, { allowNegative = false, allowZero = false } = {}): number | undefined => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = Math.round(v);
  if (Math.abs(n) > MAX_AMOUNT_CENTS) return undefined;
  if (!allowNegative && n < 0) return undefined;
  if (!allowZero && n === 0) return undefined;
  return n;
};
const COLORS = new Set<CategoryColor>(CATEGORY_COLORS.map((c) => c.color));
const isCategoryColor = (v: unknown): v is CategoryColor => typeof v === 'string' && COLORS.has(v as CategoryColor);

function validCurrency(code: unknown): code is string {
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat(undefined, { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

export interface NormalizeResult {
  data: AppData;
  /** Human-readable notes about anything that had to be repaired. */
  warnings: string[];
}

export function normalizeData(raw: unknown, today: ISODate): NormalizeResult {
  const warnings: string[] = [];
  if (!isObj(raw)) return { data: createEmptyData(today), warnings: ['Saved data was unreadable, so a fresh budget was started.'] };

  // --- settings
  const defaults = defaultSettings(today);
  const s = isObj(raw.settings) ? raw.settings : {};
  const settings: Settings = {
    currency: validCurrency(s.currency) ? s.currency : defaults.currency,
    openingBalance: cents(s.openingBalance, { allowNegative: true, allowZero: true }) ?? 0,
    balanceAsOf: isValidISODate(s.balanceAsOf) ? s.balanceAsOf : today,
    defaultView: s.defaultView === 'month' || s.defaultView === 'payperiod' ? s.defaultView : defaults.defaultView,
    theme: s.theme === 'light' || s.theme === 'dark' || s.theme === 'system' ? s.theme : 'system',
    reminders: typeof s.reminders === 'boolean' ? s.reminders : true,
    reminderDays:
      typeof s.reminderDays === 'number' && Number.isInteger(s.reminderDays) && s.reminderDays >= 0 && s.reminderDays <= 30
        ? s.reminderDays
        : defaults.reminderDays,
    primaryIncomeId: str(s.primaryIncomeId, 100),
  };

  // --- categories
  const categories: Category[] = [];
  const catIds = new Set<string>();
  for (const c of Array.isArray(raw.categories) ? raw.categories : []) {
    if (!isObj(c)) continue;
    const id = str(c.id, 100);
    const name = str(c.name, 40);
    const type = c.type === 'income' || c.type === 'expense' ? c.type : undefined;
    if (!id || !name || !type || catIds.has(id)) {
      warnings.push('A category with missing details was removed.');
      continue;
    }
    catIds.add(id);
    categories.push({
      id,
      name,
      type,
      color: isCategoryColor(c.color) ? c.color : 'slate',
      icon: ICONS.has(c.icon as CategoryIcon) ? (c.icon as CategoryIcon) : 'other',
      planned: type === 'expense' ? (cents(c.planned, { allowZero: true }) ?? 0) : 0,
      ...(c.demo === true ? { demo: true } : {}),
    });
  }
  for (const type of ['expense', 'income'] as const) {
    if (!categories.some((c) => c.type === type)) {
      for (const starter of STARTER_CATEGORIES.filter((c) => c.type === type)) {
        if (!catIds.has(starter.id)) {
          categories.push({ ...starter });
          catIds.add(starter.id);
        }
      }
    }
  }
  const fallbackCategory = (type: Category['type']) =>
    (categories.find((c) => c.type === type && /^other/i.test(c.name)) ?? categories.find((c) => c.type === type))!.id;
  const categoryFor = (id: unknown, type: Category['type']): string => {
    const found = typeof id === 'string' ? categories.find((c) => c.id === id) : undefined;
    return found && found.type === type ? found.id : fallbackCategory(type);
  };

  // --- recurring
  const recurring: RecurringItem[] = [];
  const recIds = new Set<string>();
  for (const r of Array.isArray(raw.recurring) ? raw.recurring : []) {
    if (!isObj(r)) continue;
    const id = str(r.id, 100);
    const kind = r.kind === 'bill' || r.kind === 'income' ? r.kind : undefined;
    const name = str(r.name, 60);
    const amount = cents(r.amount);
    const frequency = FREQUENCIES.includes(r.frequency as Frequency) ? (r.frequency as Frequency) : undefined;
    if (!id || !kind || !name || amount === undefined || !frequency || !isValidISODate(r.startDate) || recIds.has(id)) {
      warnings.push('A bill or income source with missing details was removed.');
      continue;
    }
    recIds.add(id);
    const secondDay = typeof r.secondDay === 'number' && Number.isInteger(r.secondDay) && r.secondDay >= 1 && r.secondDay <= 31 ? r.secondDay : undefined;
    recurring.push({
      id,
      kind,
      name,
      amount,
      categoryId: categoryFor(r.categoryId, kind === 'income' ? 'income' : 'expense'),
      frequency,
      startDate: r.startDate,
      ...(frequency === 'semimonthly' && secondDay ? { secondDay } : {}),
      paused: r.paused === true,
      ...(r.paused === true && isValidISODate(r.pausedOn) ? { pausedOn: r.pausedOn } : {}),
      skipped: Array.isArray(r.skipped) ? [...new Set(r.skipped.filter(isValidISODate))].sort() : [],
      note: str(r.note, 500),
      createdAt: str(r.createdAt, 40) ?? new Date(0).toISOString(),
      ...(r.demo === true ? { demo: true } : {}),
    });
  }
  if (settings.primaryIncomeId && !recurring.some((r) => r.id === settings.primaryIncomeId && r.kind === 'income')) {
    settings.primaryIncomeId = undefined;
  }

  // --- transactions
  const transactions: Transaction[] = [];
  const txIds = new Set<string>();
  const linked = new Set<string>();
  let dropped = 0;
  for (const t of Array.isArray(raw.transactions) ? raw.transactions : []) {
    if (!isObj(t)) {
      dropped++;
      continue;
    }
    const id = str(t.id, 100);
    const type = t.type === 'income' || t.type === 'expense' ? t.type : undefined;
    const amount = cents(t.amount);
    if (!id || !type || amount === undefined || !isValidISODate(t.date) || txIds.has(id)) {
      dropped++;
      continue;
    }
    txIds.add(id);
    let link: Transaction['link'];
    if (isObj(t.link) && typeof t.link.recurringId === 'string' && isValidISODate(t.link.date)) {
      const item = recurring.find((r) => r.id === (t.link as Obj).recurringId);
      const key = `${t.link.recurringId}|${t.link.date}`;
      if (item && (item.kind === 'income') === (type === 'income') && !linked.has(key)) {
        linked.add(key);
        link = { recurringId: item.id, date: t.link.date };
      }
    }
    transactions.push({
      id,
      type,
      amount,
      categoryId: categoryFor(t.categoryId, type),
      date: t.date,
      payee: str(t.payee, 80),
      note: str(t.note, 500),
      ...(link ? { link } : {}),
      createdAt: str(t.createdAt, 40) ?? new Date(0).toISOString(),
      ...(str(t.updatedAt, 40) ? { updatedAt: str(t.updatedAt, 40) } : {}),
      ...(t.demo === true ? { demo: true } : {}),
    });
  }
  if (dropped > 0) warnings.push(`${dropped} unreadable transaction${dropped === 1 ? ' was' : 's were'} skipped.`);

  // --- meta
  const m = isObj(raw.meta) ? raw.meta : {};
  const meta: Meta = {
    createdAt: str(m.createdAt, 40) ?? new Date().toISOString(),
    setupDone: typeof m.setupDone === 'boolean' ? m.setupDone : transactions.length > 0 || recurring.length > 0,
    ...(isValidISODate(m.lastReminderDate) ? { lastReminderDate: m.lastReminderDate } : {}),
  };
  if (isObj(m.demo) && isObj(m.demo.planned)) {
    const plannedMap = (raw: Obj) => {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw)) {
        const n = cents(v, { allowZero: true });
        if (n !== undefined) out[k] = n;
      }
      return out;
    };
    const a = m.demo.applied;
    meta.demo = {
      openingBalance: cents(m.demo.openingBalance, { allowNegative: true, allowZero: true }) ?? 0,
      balanceAsOf: isValidISODate(m.demo.balanceAsOf) ? m.demo.balanceAsOf : today,
      planned: plannedMap(m.demo.planned),
      ...(isObj(a) && isObj(a.planned) && isValidISODate(a.balanceAsOf)
        ? {
            applied: {
              openingBalance: cents(a.openingBalance, { allowNegative: true, allowZero: true }) ?? 0,
              balanceAsOf: a.balanceAsOf,
              planned: plannedMap(a.planned),
            },
          }
        : {}),
    };
  }

  return {
    data: { version: DATA_VERSION, settings, categories, transactions, recurring, meta },
    warnings: [...new Set(warnings)],
  };
}

export function serialize(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

/** Parse a backup file chosen by the person, rejecting files that aren't Even Keel backups. */
export function parseBackup(text: string, today: ISODate): NormalizeResult | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "That file isn't a valid backup (it couldn't be read as JSON)." };
  }
  if (!isObj(raw) || !Array.isArray(raw.categories) || !Array.isArray(raw.transactions) || !isObj(raw.settings)) {
    return { error: "That file doesn't look like an Even Keel backup." };
  }
  if (typeof raw.version === 'number' && raw.version > DATA_VERSION) {
    return { error: 'That backup was made by a newer version of Even Keel. Update the app first.' };
  }
  return normalizeData(raw, today);
}

// ---------------------------------------------------------------------------
// Platform adapter

export interface LoadResult {
  json: string | null;
  recoveredFromBackup?: boolean;
  error?: string;
}

export interface Storage {
  kind: 'desktop' | 'browser';
  load(): Promise<LoadResult>;
  save(json: string): Promise<{ ok: boolean; error?: string }>;
  /** Synchronous save used when the window is closing or before an update restart. */
  saveNow(json: string): { ok: boolean; error?: string };
}

function desktopStorage(api: BudgetApi): Storage {
  return {
    kind: 'desktop',
    load: () => api.loadData(),
    save: (json) => api.saveData(json),
    saveNow: (json) => {
      try {
        return api.saveDataSync(json) ?? { ok: false };
      } catch {
        return { ok: false, error: 'Your changes could not be saved.' };
      }
    },
  };
}

function browserStorage(): Storage {
  return {
    kind: 'browser',
    async load() {
      try {
        return { json: window.localStorage.getItem(STORAGE_KEY) };
      } catch {
        return { json: null, error: 'Browser storage is not available.' };
      }
    },
    async save(json) {
      try {
        window.localStorage.setItem(STORAGE_KEY, json);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Browser storage is full or blocked.' };
      }
    },
    saveNow(json) {
      try {
        window.localStorage.setItem(STORAGE_KEY, json);
        return { ok: true };
      } catch {
        return { ok: false, error: 'Browser storage is full or blocked.' };
      }
    },
  };
}

export function getStorage(): Storage {
  const api = typeof window !== 'undefined' ? window.budgetApi : undefined;
  return api ? desktopStorage(api) : browserStorage();
}
