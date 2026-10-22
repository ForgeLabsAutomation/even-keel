import { describe, expect, it } from 'vitest';
import {
  describeSchedule,
  monthlyEquivalent,
  nextOnOrAfter,
  occurrencesBetween,
  previousOnOrBefore,
  type Schedule,
} from './recurrence';

const s = (frequency: Schedule['frequency'], startDate: string, secondDay?: number): Schedule => ({ frequency, startDate, secondDay });

describe('weekly and every-two-weeks schedules', () => {
  it('repeats every 7 days from the start date', () => {
    expect(occurrencesBetween(s('weekly', '2026-10-02'), '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-02',
      '2026-10-09',
      '2026-10-16',
      '2026-10-23',
      '2026-10-30',
    ]);
  });

  it('repeats every 14 days and stays in phase far into the future', () => {
    const pay = s('biweekly', '2026-10-09');
    expect(occurrencesBetween(pay, '2026-10-01', '2026-11-30')).toEqual(['2026-10-09', '2026-10-23', '2026-11-06', '2026-11-20']);
    // 26 two-week steps later lands on the same weekday.
    expect(occurrencesBetween(pay, '2027-10-01', '2027-10-31')).toEqual(['2027-10-08', '2027-10-22']);
  });

  it('never produces dates before the start unless asked to', () => {
    expect(occurrencesBetween(s('weekly', '2026-10-16'), '2026-10-01', '2026-10-20')).toEqual(['2026-10-16']);
    expect(occurrencesBetween(s('weekly', '2026-10-16'), '2026-10-01', '2026-10-20', { allowBeforeStart: true })).toEqual([
      '2026-10-02',
      '2026-10-09',
      '2026-10-16',
    ]);
  });
});

describe('monthly schedules', () => {
  it('uses the last day of the month when the due day does not exist', () => {
    expect(occurrencesBetween(s('monthly', '2026-01-31'), '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]);
  });

  it('handles the 29th and 30th, including leap years', () => {
    expect(occurrencesBetween(s('monthly', '2027-12-30'), '2028-01-01', '2028-03-31')).toEqual([
      '2028-01-30',
      '2028-02-29',
      '2028-03-30',
    ]);
    expect(occurrencesBetween(s('monthly', '2026-01-29'), '2026-02-01', '2026-03-31')).toEqual(['2026-02-28', '2026-03-29']);
  });

  it('gives identical results for overlapping windows (no duplicates when the view changes)', () => {
    const rent = s('monthly', '2026-01-31');
    const a = occurrencesBetween(rent, '2026-01-01', '2026-04-15');
    const b = occurrencesBetween(rent, '2026-03-01', '2026-06-30');
    const merged = [...new Set([...a, ...b])].sort();
    expect(merged).toEqual(occurrencesBetween(rent, '2026-01-01', '2026-06-30'));
    expect(new Set(merged).size).toBe(merged.length);
  });

  it('supports every-3-months and yearly schedules, including Feb 29', () => {
    expect(occurrencesBetween(s('quarterly', '2026-01-31'), '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-31',
      '2026-04-30',
      '2026-07-31',
      '2026-10-31',
    ]);
    expect(occurrencesBetween(s('yearly', '2028-02-29'), '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });
});

describe('twice-a-month schedules', () => {
  it('produces both days each month in order', () => {
    expect(occurrencesBetween(s('semimonthly', '2026-10-01', 15), '2026-10-01', '2026-11-30')).toEqual([
      '2026-10-01',
      '2026-10-15',
      '2026-11-01',
      '2026-11-15',
    ]);
  });

  it('treats 31 as the last day of the month', () => {
    expect(occurrencesBetween(s('semimonthly', '2026-01-15', 31), '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-15',
      '2026-01-31',
      '2026-02-15',
      '2026-02-28',
      '2026-03-15',
      '2026-03-31',
    ]);
  });

  it('starts from the start date even when the second day comes first in the month', () => {
    expect(occurrencesBetween(s('semimonthly', '2026-10-20', 5), '2026-10-01', '2026-11-30')).toEqual([
      '2026-10-20',
      '2026-11-05',
      '2026-11-20',
    ]);
  });
});

describe('one-time items', () => {
  it('occur once', () => {
    const once = s('once', '2026-11-03');
    expect(occurrencesBetween(once, '2026-10-01', '2026-12-31')).toEqual(['2026-11-03']);
    expect(occurrencesBetween(once, '2026-11-04', '2026-12-31')).toEqual([]);
    expect(occurrencesBetween(once, '2026-10-01', '2026-12-31', { allowBeforeStart: true })).toEqual(['2026-11-03']);
    expect(nextOnOrAfter(once, '2026-11-04')).toBeNull();
  });
});

describe('next and previous occurrence', () => {
  it('finds the next occurrence on or after a date', () => {
    const pay = s('weekly', '2026-10-02');
    expect(nextOnOrAfter(pay, '2026-10-21')).toBe('2026-10-23');
    expect(nextOnOrAfter(pay, '2026-10-23')).toBe('2026-10-23');
    expect(nextOnOrAfter(pay, '2026-09-01')).toBe('2026-10-02');
    expect(nextOnOrAfter(s('yearly', '2026-03-15'), '2026-03-16')).toBe('2027-03-15');
  });

  it('finds the previous occurrence, optionally before the start', () => {
    const pay = s('biweekly', '2026-10-09');
    expect(previousOnOrBefore(pay, '2026-10-21')).toBe('2026-10-09');
    expect(previousOnOrBefore(pay, '2026-10-01')).toBeNull();
    expect(previousOnOrBefore(pay, '2026-10-01', { allowBeforeStart: true })).toBe('2026-09-25');
  });
});

describe('helpers', () => {
  it('converts amounts to a monthly average', () => {
    expect(monthlyEquivalent(100_00, 'weekly')).toBe(433_33);
    expect(monthlyEquivalent(100_00, 'biweekly')).toBe(216_67);
    expect(monthlyEquivalent(100_00, 'monthly')).toBe(100_00);
    expect(monthlyEquivalent(1200_00, 'yearly')).toBe(100_00);
    expect(monthlyEquivalent(100_00, 'once')).toBe(0);
  });

  it('describes schedules in plain language', () => {
    expect(describeSchedule(s('weekly', '2026-10-23'))).toBe('Every Friday');
    expect(describeSchedule(s('biweekly', '2026-10-23'))).toBe('Every other Friday');
    expect(describeSchedule(s('monthly', '2026-10-31'))).toBe('Monthly on the 31st (or the last day of shorter months)');
    expect(describeSchedule(s('semimonthly', '2026-10-15', 31))).toBe('Twice a month on the 15th and last day');
  });
});
