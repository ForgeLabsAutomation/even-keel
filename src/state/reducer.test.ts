import { describe, expect, it } from 'vitest';
import { reducer } from './reducer';
import { currentBalance, occurrencesInRange } from '../lib/budget';
import { addDays } from '../lib/dates';
import { bill, emptyData, income, tx, withItems } from '../test/factory';
import type { AppData } from './types';

const TODAY = '2026-10-21';
const NOW = '2026-10-21T12:00:00.000Z';

function run(state: AppData, ...actions: Parameters<typeof reducer>[1][]): AppData {
  return actions.reduce(reducer, state);
}

describe('transactions', () => {
  it('adds, edits and deletes, updating the balance each time', () => {
    let s = emptyData(TODAY, { openingBalance: 100_00 });
    s = reducer(s, { type: 'tx/add', tx: tx({ id: 'a', amount: 30_00, date: TODAY }) });
    expect(currentBalance(s, TODAY)).toBe(70_00);
    s = reducer(s, { type: 'tx/update', tx: { ...s.transactions[0], amount: 45_00 } });
    expect(currentBalance(s, TODAY)).toBe(55_00);
    s = reducer(s, { type: 'tx/delete', id: 'a' });
    expect(currentBalance(s, TODAY)).toBe(100_00);
  });

  it('can undo a delete', () => {
    let s = reducer(emptyData(TODAY), { type: 'tx/add', tx: tx({ id: 'a', amount: 30_00, date: TODAY }) });
    const deleted = s.transactions[0];
    s = reducer(s, { type: 'tx/delete', id: 'a' });
    s = reducer(s, { type: 'tx/restore', tx: deleted });
    expect(s.transactions).toEqual([deleted]);
  });

  it('rejects a category of the wrong type', () => {
    const s = reducer(emptyData(TODAY), { type: 'tx/add', tx: tx({ amount: 5_00, date: TODAY, categoryId: 'cat-paycheck' }) });
    expect(s.transactions).toHaveLength(0);
  });

  it('never lets two transactions settle the same occurrence', () => {
    const s = run(
      withItems(emptyData(TODAY), { recurring: [bill({ id: 'b', amount: 50_00, startDate: '2026-10-25' })] }),
      { type: 'tx/add', tx: tx({ id: 'one', amount: 50_00, date: TODAY, link: { recurringId: 'b', date: '2026-10-25' } }) },
      { type: 'tx/add', tx: tx({ id: 'two', amount: 50_00, date: TODAY, link: { recurringId: 'b', date: '2026-10-25' } }) },
    );
    expect(s.transactions.find((t) => t.id === 'one')?.link).toBeDefined();
    expect(s.transactions.find((t) => t.id === 'two')?.link).toBeUndefined();
  });

  it('drops a link from an expense to an income source', () => {
    const s = reducer(withItems(emptyData(TODAY), { recurring: [income({ id: 'p', amount: 1_00, startDate: TODAY })] }), {
      type: 'tx/add',
      tx: tx({ amount: 5_00, date: TODAY, link: { recurringId: 'p', date: TODAY } }),
    });
    expect(s.transactions[0].link).toBeUndefined();
  });
});

describe('bill occurrences', () => {
  const rent = bill({ id: 'rent', amount: 1200_00, startDate: '2026-10-01', categoryId: 'cat-housing' });
  const base = () => withItems(emptyData(TODAY, { openingBalance: 2000_00, balanceAsOf: '2026-10-01' }), { recurring: [rent] });
  const settle = { type: 'occurrence/settle', recurringId: 'rent', date: '2026-11-01', amount: 1200_00, paidOn: TODAY, txId: 't1', now: NOW } as const;

  it('marking paid records a payment and leaves the schedule untouched', () => {
    const s = reducer(base(), settle);
    expect(s.recurring).toEqual(base().recurring);
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0]).toMatchObject({
      type: 'expense',
      amount: 1200_00,
      categoryId: 'cat-housing',
      date: TODAY,
      link: { recurringId: 'rent', date: '2026-11-01' },
    });
    const list = occurrencesInRange(s, { kind: 'bill', from: '2026-10-01', to: '2026-12-31', today: TODAY });
    expect(list.map((o) => [o.date, o.status])).toEqual([
      ['2026-10-01', 'open'],
      ['2026-11-01', 'settled'],
      ['2026-12-01', 'open'],
    ]);
  });

  it('marking paid twice does not create a second payment', () => {
    const s = run(base(), settle, { ...settle, txId: 't2' });
    expect(s.transactions).toHaveLength(1);
  });

  it('marking unpaid removes only that payment', () => {
    const s = run(base(), settle, { ...settle, date: '2026-12-01', txId: 't2' }, { type: 'occurrence/unsettle', recurringId: 'rent', date: '2026-11-01' });
    expect(s.transactions.map((t) => t.link?.date)).toEqual(['2026-12-01']);
  });

  it('skipping and un-skipping an occurrence', () => {
    let s = reducer(base(), { type: 'occurrence/skip', recurringId: 'rent', date: '2026-11-01', skipped: true });
    expect(s.recurring[0].skipped).toEqual(['2026-11-01']);
    s = reducer(s, { type: 'occurrence/skip', recurringId: 'rent', date: '2026-11-01', skipped: true });
    expect(s.recurring[0].skipped).toEqual(['2026-11-01']);
    // Paying a skipped occurrence un-skips it.
    s = reducer(s, settle);
    expect(s.recurring[0].skipped).toEqual([]);
  });

  it('pausing stops future occurrences but keeps paid history', () => {
    const s = run(base(), { ...settle, date: '2026-10-01' }, { type: 'recurring/setPaused', id: 'rent', paused: true, today: TODAY });
    const list = occurrencesInRange(s, { kind: 'bill', from: '2026-10-01', to: '2026-12-31', today: TODAY });
    expect(list.map((o) => [o.date, o.status])).toEqual([['2026-10-01', 'settled']]);
  });

  it('resuming skips the dates missed while paused instead of making them overdue', () => {
    const gym = bill({ id: 'gym', amount: 50_00, startDate: '2026-07-05' });
    const s = run(
      withItems(emptyData(TODAY), { recurring: [gym] }),
      { type: 'occurrence/settle', recurringId: 'gym', date: '2026-07-05', amount: 50_00, paidOn: '2026-07-05', txId: 'g1', now: NOW },
      { type: 'recurring/setPaused', id: 'gym', paused: true, today: '2026-08-01' },
      { type: 'recurring/setPaused', id: 'gym', paused: false, today: TODAY },
    );
    expect(s.recurring[0].paused).toBe(false);
    expect(s.recurring[0].pausedOn).toBeUndefined();
    expect(s.recurring[0].skipped).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
    const open = occurrencesInRange(s, { kind: 'bill', from: '2026-07-01', to: '2026-11-30', today: TODAY }).filter((o) => o.status === 'open');
    expect(open.map((o) => o.date)).toEqual(['2026-11-05']);
  });

  it('deleting a bill keeps its past payments as ordinary spending', () => {
    const s = run(base(), settle, { type: 'recurring/delete', id: 'rent' });
    expect(s.recurring).toHaveLength(0);
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0].link).toBeUndefined();
    expect(s.transactions[0].amount).toBe(1200_00);
  });

  it('editing the amount does not rewrite payments already made', () => {
    const s = run(base(), settle, { type: 'recurring/update', item: { ...rent, amount: 1300_00 } });
    expect(s.transactions[0].amount).toBe(1200_00);
    const dec = occurrencesInRange(s, { kind: 'bill', from: '2026-12-01', to: '2026-12-31', today: TODAY });
    expect(dec[0].amount).toBe(1300_00);
  });
});

describe('income', () => {
  it('recording a paycheck turns expected income into received income', () => {
    const pay = income({ id: 'pay', amount: 700_00, startDate: '2026-10-23' });
    const s = reducer(withItems(emptyData(TODAY), { recurring: [pay] }), {
      type: 'occurrence/settle',
      recurringId: 'pay',
      date: '2026-10-23',
      amount: 712_40,
      paidOn: TODAY,
      txId: 'p1',
      now: NOW,
    });
    expect(s.transactions[0]).toMatchObject({ type: 'income', amount: 712_40, categoryId: 'cat-paycheck' });
    expect(currentBalance(s, TODAY)).toBe(712_40);
  });

  it('deleting the primary paycheck clears the preference', () => {
    const pay = income({ id: 'pay', amount: 700_00, startDate: TODAY });
    const s = run(withItems(emptyData(TODAY, { primaryIncomeId: 'pay' }), { recurring: [pay] }), { type: 'recurring/delete', id: 'pay' });
    expect(s.settings.primaryIncomeId).toBeUndefined();
  });
});

describe('categories', () => {
  it('moves transactions and bills when a category is deleted', () => {
    const s = run(
      withItems(emptyData(TODAY), {
        recurring: [bill({ id: 'b', amount: 10_00, startDate: TODAY, categoryId: 'cat-dining' })],
        transactions: [tx({ id: 't', amount: 5_00, date: TODAY, categoryId: 'cat-dining' })],
      }),
      { type: 'category/delete', id: 'cat-dining', moveTo: 'cat-other' },
    );
    expect(s.categories.some((c) => c.id === 'cat-dining')).toBe(false);
    expect(s.transactions[0].categoryId).toBe('cat-other');
    expect(s.recurring[0].categoryId).toBe('cat-other');
  });

  it('refuses to move into a category of the other type', () => {
    const before = emptyData(TODAY);
    expect(reducer(before, { type: 'category/delete', id: 'cat-dining', moveTo: 'cat-paycheck' })).toBe(before);
  });
});

describe('balance', () => {
  it('reconciles to the real account balance', () => {
    const s = run(
      withItems(emptyData(TODAY, { openingBalance: 100_00, balanceAsOf: '2026-10-01' }), {
        transactions: [tx({ amount: 40_00, date: '2026-10-05' })],
      }),
      { type: 'balance/reconcile', actual: 512_34, today: TODAY },
    );
    expect(currentBalance(s, TODAY)).toBe(512_34);
  });
});

describe('demo data', () => {
  it('loads clearly-flagged sample data and removes it completely', () => {
    const start = run(
      emptyData(TODAY, { openingBalance: 250_00, balanceAsOf: TODAY }),
      { type: 'category/update', id: 'cat-groceries', patch: { planned: 300_00 } },
      { type: 'tx/add', tx: tx({ id: 'mine', amount: 12_00, date: TODAY }) },
    );
    const demo = reducer(start, { type: 'demo/load', today: TODAY, now: NOW });
    expect(demo.meta.demo).toBeDefined();
    expect(demo.recurring.length).toBeGreaterThan(3);
    expect(demo.recurring.every((r) => r.demo && r.name.includes('(demo)'))).toBe(true);
    expect(demo.transactions.filter((t) => t.id !== 'mine').every((t) => t.demo)).toBe(true);
    expect(demo.transactions.filter((t) => t.date > TODAY)).toHaveLength(0);

    // Loading twice does nothing.
    expect(reducer(demo, { type: 'demo/load', today: TODAY, now: NOW })).toBe(demo);

    const cleared = reducer(demo, { type: 'demo/clear', today: TODAY });
    expect(cleared.recurring).toEqual([]);
    expect(cleared.transactions.map((t) => t.id)).toEqual(['mine']);
    expect(cleared.settings.openingBalance).toBe(250_00);
    expect(cleared.categories.find((c) => c.id === 'cat-groceries')?.planned).toBe(300_00);
    expect(cleared.meta.demo).toBeUndefined();
  });

  it('removing demo data keeps changes the person made while it was loaded', () => {
    let s = reducer(emptyData(TODAY), { type: 'demo/load', today: TODAY, now: NOW });
    s = run(
      s,
      { type: 'category/update', id: 'cat-groceries', patch: { planned: 600_00 } },
      { type: 'tx/add', tx: tx({ id: 'mine', amount: 25_00, date: TODAY }) },
      { type: 'balance/reconcile', actual: 2345_00, today: TODAY },
    );
    const cleared = reducer(s, { type: 'demo/clear', today: TODAY });
    expect(cleared.categories.find((c) => c.id === 'cat-groceries')?.planned).toBe(600_00);
    expect(cleared.categories.find((c) => c.id === 'cat-dining')?.planned).toBe(0); // demo value removed
    expect(currentBalance(cleared, TODAY)).toBe(2345_00); // the real balance they entered
    expect(cleared.transactions.map((t) => t.id)).toEqual(['mine']);
    expect(cleared.meta.setupDone).toBe(true);
  });

  it.each(['2026-10-21', '2026-01-31', '2026-03-01', '2028-02-29', '2026-12-05'])(
    'demo history is consistent on %s: every past paycheck and bill is settled exactly once',
    (today) => {
      const demo = reducer(emptyData(today), { type: 'demo/load', today, now: NOW });
      const keys = demo.transactions.filter((t) => t.link).map((t) => `${t.link!.recurringId}|${t.link!.date}`);
      expect(new Set(keys).size).toBe(keys.length);
      // Nothing overdue or unrecorded anywhere in the past.
      for (const kind of ['bill', 'income'] as const) {
        const open = occurrencesInRange(demo, { kind, from: '2020-01-01', to: addDays(today, -1), today }).filter((o) => o.status === 'open');
        expect(open).toEqual([]);
      }
      expect(demo.transactions.every((t) => t.date <= today)).toBe(true);
    },
  );
});
