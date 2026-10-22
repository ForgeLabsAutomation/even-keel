/**
 * Calendar-date helpers.
 *
 * Every date in the app is a plain ISO calendar date string ("2026-10-21").
 * Arithmetic is done on whole days counted from the Unix epoch in UTC, so
 * daylight-saving changes and time zones can never shift a due date.
 */

export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function parts(date: ISODate): [year: number, month: number, day: number] {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function makeDate(year: number, month: number, day: number): ISODate {
  // Normalise month overflow (month 13 -> January next year, month 0 -> December).
  const y = year + Math.floor((month - 1) / 12);
  const mo = ((((month - 1) % 12) + 12) % 12) + 1;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toDayNumber(date: ISODate): number {
  const [y, m, d] = parts(date);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNumber(dayNumber: number): ISODate {
  const dt = new Date(dayNumber * MS_PER_DAY);
  return makeDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * Move by whole months, keeping the preferred day of month where it exists and
 * otherwise using the last day of the month. Passing the original anchor day
 * means a "31st" schedule returns to the 31st after a short month instead of
 * drifting to the 28th forever.
 */
export function addMonthsClamped(date: ISODate, months: number, preferredDay?: number): ISODate {
  const [y, m, d] = parts(date);
  const day = preferredDay ?? d;
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return makeDate(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

/** Whole calendar months from a to b, ignoring the day of month. */
export function monthsBetween(a: ISODate, b: ISODate): number {
  const [ay, am] = parts(a);
  const [by, bm] = parts(b);
  return (by - ay) * 12 + (bm - am);
}

export function startOfMonth(date: ISODate): ISODate {
  const [y, m] = parts(date);
  return makeDate(y, m, 1);
}

export function endOfMonth(date: ISODate): ISODate {
  const [y, m] = parts(date);
  return makeDate(y, m, daysInMonth(y, m));
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function isBetween(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(date: ISODate): number {
  return new Date(toDayNumber(date) * MS_PER_DAY).getUTCDay();
}

let todayOverride: ISODate | null = null;

/** Used by end-to-end tests to pin "today". */
export function setTodayOverride(date: ISODate | null): void {
  todayOverride = date && isValidISODate(date) ? date : null;
}

export function todayISO(now: Date = new Date()): ISODate {
  if (todayOverride) return todayOverride;
  return makeDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function utcDate(date: ISODate): Date {
  return new Date(toDayNumber(date) * MS_PER_DAY);
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });
    formatterCache.set(key, f);
  }
  return f;
}

/** "Oct 21" */
export function formatShort(date: ISODate): string {
  return formatter({ month: 'short', day: 'numeric' }).format(utcDate(date));
}

/** "Wed, Oct 21" */
export function formatWithWeekday(date: ISODate): string {
  return formatter({ weekday: 'short', month: 'short', day: 'numeric' }).format(utcDate(date));
}

/** "Oct 21, 2026" */
export function formatLong(date: ISODate): string {
  return formatter({ month: 'short', day: 'numeric', year: 'numeric' }).format(utcDate(date));
}

/** "Wednesday, October 21" */
export function formatFullDay(date: ISODate): string {
  return formatter({ weekday: 'long', month: 'long', day: 'numeric' }).format(utcDate(date));
}

/** "October 2026" */
export function formatMonthYear(date: ISODate): string {
  return formatter({ month: 'long', year: 'numeric' }).format(utcDate(date));
}

/** "Oct" */
export function formatMonthShort(date: ISODate): string {
  return formatter({ month: 'short' }).format(utcDate(date));
}

export function formatWeekdayShort(date: ISODate): string {
  return formatter({ weekday: 'short' }).format(utcDate(date));
}

export function formatDayOfMonth(date: ISODate): string {
  return String(parts(date)[2]);
}

/** "Oct 17 – Oct 23" (adds the year when the range crosses years). */
export function formatRange(start: ISODate, end: ISODate): string {
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${formatLong(start)} – ${formatLong(end)}`;
  return `${formatShort(start)} – ${formatShort(end)}`;
}

/** Friendly relative label: "Today", "Tomorrow", "In 3 days", "2 days ago". */
export function relativeDay(date: ISODate, today: ISODate): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1) return `In ${diff} days`;
  return `${-diff} days ago`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
