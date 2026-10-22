import { describe, expect, it } from 'vitest';
import { normalizeData, parseBackup, serialize } from './persistence';
import { reducer } from './reducer';
import { bill, emptyData, tx, withItems } from '../test/factory';

const TODAY = '2026-10-21';

describe('normalizeData', () => {
  it('round-trips saved data unchanged', () => {
    const data = reducer(emptyData(TODAY), { type: 'demo/load', today: TODAY, now: '2026-10-21T00:00:00.000Z' });
    const { data: loaded, warnings } = normalizeData(JSON.parse(serialize(data)), TODAY);
    expect(warnings).toEqual([]);
    expect(loaded).toEqual(JSON.parse(serialize(data)));
  });

  it('starts fresh when the data is not an object', () => {
    const { data, warnings } = normalizeData('garbage', TODAY);
    expect(data.categories.length).toBeGreaterThan(5);
    expect(warnings).toHaveLength(1);
  });

  it('repairs bad records instead of crashing', () => {
    const good = emptyData(TODAY);
    const raw = {
      ...good,
      settings: { ...good.settings, currency: 'NOPE', reminderDays: 99, theme: 'neon' },
      transactions: [
        tx({ id: 'ok', amount: 5_00, date: TODAY }),
        { id: 'bad-date', type: 'expense', amount: 5_00, date: '2026-02-30', categoryId: 'cat-other' },
        { id: 'neg', type: 'expense', amount: -5, date: TODAY, categoryId: 'cat-other' },
        { id: 'lost-category', type: 'expense', amount: 7_00, date: TODAY, categoryId: 'missing' },
        { id: 'ok', type: 'expense', amount: 1_00, date: TODAY, categoryId: 'cat-other' }, // duplicate id
        null,
      ],
      recurring: [bill({ id: 'b', amount: 10_00, startDate: TODAY }), { id: 'x', kind: 'bill', name: '', amount: 1 }],
    };
    const { data, warnings } = normalizeData(raw, TODAY);
    expect(data.transactions.map((t) => t.id)).toEqual(['ok', 'lost-category']);
    expect(data.transactions[1].categoryId).toBe('cat-other');
    expect(data.recurring.map((r) => r.id)).toEqual(['b']);
    expect(data.settings.currency).not.toBe('NOPE');
    expect(data.settings.reminderDays).toBe(3);
    expect(data.settings.theme).toBe('system');
    expect(warnings.join(' ')).toMatch(/4 unreadable transactions/);
  });

  it('removes duplicate payment links when loading', () => {
    const data = withItems(emptyData(TODAY), {
      recurring: [bill({ id: 'b', amount: 10_00, startDate: TODAY })],
      transactions: [
        tx({ id: 'one', amount: 10_00, date: TODAY, link: { recurringId: 'b', date: TODAY } }),
        tx({ id: 'two', amount: 10_00, date: TODAY, link: { recurringId: 'b', date: TODAY } }),
        tx({ id: 'ghost', amount: 10_00, date: TODAY, link: { recurringId: 'gone', date: TODAY } }),
      ],
    });
    const { data: loaded } = normalizeData(JSON.parse(serialize(data)), TODAY);
    expect(loaded.transactions.map((t) => !!t.link)).toEqual([true, false, false]);
  });

  it('restores missing starter categories so the app always has somewhere to put money', () => {
    const { data } = normalizeData({ ...emptyData(TODAY), categories: [] }, TODAY);
    expect(data.categories.some((c) => c.type === 'expense')).toBe(true);
    expect(data.categories.some((c) => c.type === 'income')).toBe(true);
  });
});

describe('parseBackup', () => {
  it('accepts an exported backup', () => {
    const result = parseBackup(serialize(emptyData(TODAY)), TODAY);
    expect('data' in result).toBe(true);
  });

  it('rejects files that are not backups', () => {
    expect(parseBackup('not json', TODAY)).toMatchObject({ error: expect.stringContaining('valid backup') });
    expect(parseBackup('{"hello":1}', TODAY)).toMatchObject({ error: expect.stringContaining("doesn't look like") });
    expect(parseBackup(JSON.stringify({ ...emptyData(TODAY), version: 99 }), TODAY)).toMatchObject({
      error: expect.stringContaining('newer version'),
    });
  });
});
