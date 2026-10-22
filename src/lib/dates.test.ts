import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  daysInMonth,
  endOfMonth,
  isValidISODate,
  monthsBetween,
  ordinal,
  relativeDay,
  setTodayOverride,
  todayISO,
  weekday,
} from './dates';

describe('isValidISODate', () => {
  it('accepts real calendar dates', () => {
    expect(isValidISODate('2026-10-21')).toBe(true);
    expect(isValidISODate('2028-02-29')).toBe(true);
  });

  it('rejects impossible or malformed dates', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('2026-04-31')).toBe(false);
    expect(isValidISODate('2026-1-5')).toBe(false);
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate(undefined)).toBe(false);
    expect(isValidISODate(20261021)).toBe(false);
  });
});

describe('day arithmetic', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is not affected by daylight-saving changes', () => {
    // US DST ends Nov 1 2026 and starts Mar 8 2026.
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(addDays('2026-03-07', 7)).toBe('2026-03-14');
  });

  it('knows the days in each month', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });

  it('reports weekdays', () => {
    expect(weekday('2026-10-21')).toBe(3); // Wednesday
    expect(weekday('2026-10-23')).toBe(5); // Friday
  });
});

describe('addMonthsClamped', () => {
  it('uses the last day of shorter months', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('returns to the preferred day after a short month', () => {
    expect(addMonthsClamped('2026-02-28', 1, 31)).toBe('2026-03-31');
  });

  it('handles negative offsets and year changes', () => {
    expect(addMonthsClamped('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('counts calendar months between dates', () => {
    expect(monthsBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(monthsBetween('2026-10-21', '2025-10-21')).toBe(-12);
  });
});

describe('labels', () => {
  it('describes days relative to today', () => {
    expect(relativeDay('2026-10-21', '2026-10-21')).toBe('Today');
    expect(relativeDay('2026-10-22', '2026-10-21')).toBe('Tomorrow');
    expect(relativeDay('2026-10-20', '2026-10-21')).toBe('Yesterday');
    expect(relativeDay('2026-10-26', '2026-10-21')).toBe('In 5 days');
    expect(relativeDay('2026-10-18', '2026-10-21')).toBe('3 days ago');
  });

  it('builds ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '31st',
    ]);
  });
});

describe('todayISO', () => {
  it('uses the local calendar date', () => {
    expect(todayISO(new Date(2026, 9, 21, 23, 59))).toBe('2026-10-21');
    expect(todayISO(new Date(2026, 9, 22, 0, 1))).toBe('2026-10-22');
  });

  it('can be pinned for tests', () => {
    setTodayOverride('2030-01-02');
    expect(todayISO()).toBe('2030-01-02');
    setTodayOverride('not a date');
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
    setTodayOverride(null);
  });
});
