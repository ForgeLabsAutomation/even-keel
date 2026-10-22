import { describe, expect, it } from 'vitest';
import {
  categoryRows,
  currentBalance,
  linkCandidates,
  monthPeriod,
  monthlyTrend,
  nextPayday,
  occurrencesInRange,
  openingBalanceFor,
  paydayOutlook,
  payPeriod,
  primaryIncome,
  projectedBalanceAt,
  recentQuickFills,
  setAsideFor,
  spendingByCategory,
  suggestedLink,
  summarizePeriod,
  upcomingBills,
} from './budget';
import { bill, emptyData, income, tx, withItems } from '../test/factory';

const TODAY = '2026-10-21'; // a Wednesday

describe('currentBalance', () => {
  it('adds everything recorded from the starting-balance date up to today', () => {
    const data = withItems(emptyData(TODAY, { openingBalance: 500_00, balanceAsOf: '2026-10-01' }), {
      transactions: [
        tx({ type: 'income', amount: 700_00, date: '2026-10-09' }),
        tx({ amount: 50_00, date: '2026-10-10' }),
        tx({ amount: 20_00, date: '2026-09-30' }), // before the starting balance: already counted in it
        tx({ amount: 30_00, date: '2026-10-25' }), // future-dated: not money spent yet
      ],
    });
    expect(currentBalance(data, TODAY)).toBe(1150_00);
  });

  it('can be reconciled to an actual bank balance', () => {
    const data = withItems(emptyData(TODAY, { openingBalance: 500_00, balanceAsOf: '2026-10-01' }), {
      transactions: [tx({ type: 'income', amount: 700_00, date: '2026-10-09' }), tx({ amount: 50_00, date: '2026-10-10' })],
    });
    const opening = openingBalanceFor(data, 1000_00, TODAY);
    expect(opening).toBe(350_00);
    expect(currentBalance({ ...data, settings: { ...data.settings, openingBalance: opening } }, TODAY)).toBe(1000_00);
  });
});

describe('occurrencesInRange', () => {
  const rent = bill({ id: 'rent', name: 'Rent', amount: 1200_00, startDate: '2026-09-05', categoryId: 'cat-housing' });

  it('combines the schedule with recorded payments', () => {
    const data = withItems(emptyData(TODAY), {
      recurring: [rent],
      transactions: [tx({ amount: 1180_00, date: '2026-09-04', link: { recurringId: 'rent', date: '2026-09-05' } })],
    });
    const list = occurrencesInRange(data, { kind: 'bill', from: '2026-09-01', to: '2026-11-30', today: TODAY });
    expect(list.map((o) => [o.date, o.status, o.amount, o.overdue])).toEqual([
      ['2026-09-05', 'settled', 1180_00, false], // actual amount paid
      ['2026-10-05', 'open', 1200_00, true],
      ['2026-11-05', 'open', 1200_00, false],
    ]);
  });

  it('respects skipped and paused items', () => {
    const skipped = { ...rent, skipped: ['2026-10-05'] };
    const data = withItems(emptyData(TODAY), { recurring: [skipped] });
    const list = occurrencesInRange(data, { kind: 'bill', from: '2026-10-01', to: '2026-10-31', today: TODAY });
    expect(list.map((o) => [o.date, o.status, o.overdue])).toEqual([['2026-10-05', 'skipped', false]]);

    const paused = withItems(emptyData(TODAY), {
      recurring: [{ ...rent, paused: true }],
      transactions: [tx({ amount: 1200_00, date: '2026-09-05', link: { recurringId: 'rent', date: '2026-09-05' } })],
    });
    const pausedList = occurrencesInRange(paused, { kind: 'bill', from: '2026-09-01', to: '2026-11-30', today: TODAY });
    expect(pausedList.map((o) => [o.date, o.status])).toEqual([['2026-09-05', 'settled']]);
  });

  it('keeps payments for dates that are no longer on an edited schedule, without duplicating', () => {
    const moved = { ...rent, startDate: '2026-10-07' };
    const data = withItems(emptyData(TODAY), {
      recurring: [moved],
      transactions: [tx({ amount: 1200_00, date: '2026-09-05', link: { recurringId: 'rent', date: '2026-09-05' } })],
    });
    const list = occurrencesInRange(data, { kind: 'bill', from: '2026-09-01', to: '2026-10-31', today: TODAY });
    expect(list.map((o) => [o.date, o.status])).toEqual([
      ['2026-09-05', 'settled'],
      ['2026-10-07', 'open'],
    ]);
    const keys = list.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lists overdue and upcoming bills, and paid ones still ahead', () => {
    const phone = bill({ id: 'phone', amount: 50_00, startDate: '2026-10-25' });
    const data = withItems(emptyData(TODAY), {
      recurring: [rent, phone],
      transactions: [tx({ amount: 50_00, date: TODAY, link: { recurringId: 'phone', date: '2026-10-25' } })],
    });
    const list = upcomingBills(data, TODAY, 14);
    expect(list.map((o) => [o.item.id, o.date, o.status])).toEqual([
      ['rent', '2026-09-05', 'open'],
      ['rent', '2026-10-05', 'open'],
      ['phone', '2026-10-25', 'settled'],
    ]);
  });
});

describe('paydays', () => {
  const pay = income({ id: 'pay', amount: 700_00, startDate: '2026-10-02' }); // weekly on Fridays

  it('finds the next payday that has not been recorded', () => {
    const data = withItems(emptyData(TODAY), { recurring: [pay] });
    expect(nextPayday(data, TODAY)?.date).toBe('2026-10-23');

    // Recorded early: the following Friday becomes the next payday.
    const recorded = withItems(data, {
      transactions: [tx({ type: 'income', amount: 700_00, date: TODAY, link: { recurringId: 'pay', date: '2026-10-23' } })],
    });
    expect(nextPayday(recorded, TODAY)?.date).toBe('2026-10-30');
  });

  it('adds up paychecks that land on the same day', () => {
    const side = income({ id: 'side', amount: 150_00, startDate: '2026-10-23', frequency: 'biweekly' });
    const data = withItems(emptyData(TODAY), { recurring: [pay, side] });
    const next = nextPayday(data, TODAY)!;
    expect(next.date).toBe('2026-10-23');
    expect(next.total).toBe(850_00);
    expect(next.items).toHaveLength(2);
  });

  it('chooses the most frequent paycheck for pay periods unless one is picked', () => {
    const monthly = income({ id: 'monthly', amount: 2000_00, startDate: '2026-10-01', frequency: 'monthly' });
    const data = withItems(emptyData(TODAY), { recurring: [monthly, pay] });
    expect(primaryIncome(data)?.id).toBe('pay');
    expect(primaryIncome({ ...data, settings: { ...data.settings, primaryIncomeId: 'monthly' } })?.id).toBe('monthly');
    expect(primaryIncome({ ...data, recurring: [{ ...pay, paused: true }] })).toBeNull();
  });
});

describe('payPeriod', () => {
  it('runs from the latest payday to the day before the next one', () => {
    const data = withItems(emptyData(TODAY), { recurring: [income({ amount: 700_00, startDate: '2026-10-02' })] });
    expect(payPeriod(data, TODAY)).toMatchObject({ start: '2026-10-16', end: '2026-10-22' });
    expect(payPeriod(data, TODAY, -1)).toMatchObject({ start: '2026-10-09', end: '2026-10-15' });
    expect(payPeriod(data, TODAY, 2)).toMatchObject({ start: '2026-10-30', end: '2026-11-05' });
  });

  it('extends the schedule backwards before the first recorded payday', () => {
    const data = withItems(emptyData(TODAY), { recurring: [income({ amount: 700_00, startDate: '2026-10-30' })] });
    expect(payPeriod(data, TODAY)).toMatchObject({ start: '2026-10-16', end: '2026-10-22' });
  });

  it('works for every-two-weeks and twice-a-month pay', () => {
    const biweekly = withItems(emptyData(TODAY), { recurring: [income({ amount: 1400_00, startDate: '2026-10-09', frequency: 'biweekly' })] });
    expect(payPeriod(biweekly, TODAY)).toMatchObject({ start: '2026-10-09', end: '2026-10-22' });
    const semi = withItems(emptyData(TODAY), {
      recurring: [income({ amount: 1500_00, startDate: '2026-10-01', frequency: 'semimonthly', secondDay: 15 })],
    });
    expect(payPeriod(semi, TODAY)).toMatchObject({ start: '2026-10-15', end: '2026-10-31' });
  });

  it('returns null without a recurring paycheck', () => {
    expect(payPeriod(emptyData(TODAY), TODAY)).toBeNull();
    expect(monthPeriod(TODAY)).toMatchObject({ start: '2026-10-01', end: '2026-10-31' });
    expect(monthPeriod(TODAY, -10)).toMatchObject({ start: '2025-12-01', end: '2025-12-31' });
  });
});

describe('paydayOutlook', () => {
  const pay = income({ id: 'pay', amount: 700_00, startDate: '2026-10-23' });
  const base = () => emptyData(TODAY, { openingBalance: 1100_00, balanceAsOf: TODAY });

  it('subtracts unpaid bills due before payday', () => {
    const data = withItems(base(), {
      recurring: [pay, bill({ amount: 50_00, startDate: '2026-10-22' }), bill({ amount: 600_00, startDate: '2026-10-23' })],
    });
    const o = paydayOutlook(data, TODAY);
    expect(o.payday?.date).toBe('2026-10-23');
    expect(o.daysUntil).toBe(2);
    expect(o.billsTotal).toBe(50_00); // the bill due on payday is paid from the new paycheck
    expect(o.left).toBe(1050_00);
    expect(o.heldForLater).toBe(0);
    expect(o.perDay).toBe(525_00);
  });

  it('holds back the part of a payday bill the paycheck cannot cover', () => {
    const data = withItems(base(), { recurring: [pay, bill({ amount: 900_00, startDate: '2026-10-23', frequency: 'once' })] });
    const o = paydayOutlook(data, TODAY);
    expect(o.billsTotal).toBe(0);
    expect(o.heldForLater).toBe(200_00);
    expect(o.left).toBe(900_00);
    expect(o.lowPoint?.date).toBe('2026-10-23');
  });

  it('holds back money when a later bill is bigger than the paychecks before it', () => {
    const rent = bill({ id: 'rent', name: 'Rent', amount: 1500_00, startDate: '2026-11-01', categoryId: 'cat-housing' });
    const data = withItems(base(), { recurring: [pay, rent, bill({ amount: 50_00, startDate: '2026-10-22' })] });
    const o = paydayOutlook(data, TODAY);
    // 1100 - 50 = 1050 before payday; +700 (Oct 23) +700 (Oct 30) - 1500 (Nov 1) = 950 lowest point.
    expect(o.left).toBe(950_00);
    expect(o.heldForLater).toBe(100_00);
    expect(o.lowPoint?.date).toBe('2026-11-01');
    expect(o.lowPoint?.bills.map((b) => b.item.id)).toEqual(['rent']);
  });

  it('keeps planned everyday spending after payday in mind when a big bill is coming', () => {
    const rent = bill({ id: 'rent', name: 'Rent', amount: 1500_00, startDate: '2026-11-01', categoryId: 'cat-housing' });
    const data = withItems(base(), { recurring: [pay, rent] });
    // Without limits: 1100 + 700 + 700 - 1500 = 1000 on Nov 1, so 100 is held back.
    expect(paydayOutlook(data, TODAY).heldForLater).toBe(100_00);

    // With a $365/month grocery limit (= $12/day), Oct 23 - Nov 1 is 10 days of planned spending.
    data.categories = data.categories.map((c) => (c.id === 'cat-groceries' ? { ...c, planned: 365_00 } : c));
    const o = paydayOutlook(data, TODAY);
    // 1100 + 700 + 700 - 1500 - 10 x 12 = 880
    expect(o.left).toBe(880_00);
    expect(o.heldForLater).toBe(220_00);
    expect(o.lowPoint?.bills.map((b) => b.item.name)).toEqual(['Rent']);
    expect(o.plannedPerDay).toBeCloseTo(12_00);

    // Limits already covered by bills don't count twice.
    data.categories = data.categories.map((c) => (c.id === 'cat-housing' ? { ...c, planned: 1500_00 } : c));
    expect(paydayOutlook(data, TODAY).left).toBe(880_00);
  });

  it('includes overdue bills and future-dated spending already entered', () => {
    const data = withItems(base(), {
      recurring: [pay, bill({ amount: 80_00, startDate: '2026-10-10', frequency: 'once' })],
      transactions: [tx({ amount: 20_00, date: '2026-10-22' })],
    });
    const o = paydayOutlook(data, TODAY);
    expect(o.bills.map((b) => b.overdue)).toEqual([true]);
    expect(o.scheduled).toBe(20_00);
    expect(o.left).toBe(1000_00);
  });

  it('marking a bill paid moves money from "bills" to "spent" without changing what is left', () => {
    const phone = bill({ id: 'phone', amount: 50_00, startDate: '2026-10-22' });
    const before = paydayOutlook(withItems(base(), { recurring: [pay, phone] }), TODAY);
    const after = paydayOutlook(
      withItems(base(), {
        recurring: [pay, phone],
        transactions: [tx({ amount: 50_00, date: TODAY, link: { recurringId: 'phone', date: '2026-10-22' } })],
      }),
      TODAY,
    );
    expect(before.left).toBe(after.left);
    expect(after.balance).toBe(before.balance - 50_00);
    expect(after.billsTotal).toBe(0);
  });

  it('on payday, waits for the paycheck to be recorded', () => {
    const data = withItems(base(), { recurring: [pay] });
    const o = paydayOutlook(data, '2026-10-23');
    expect(o.payday?.date).toBe('2026-10-23');
    expect(o.daysUntil).toBe(0);
    expect(o.perDay).toBe(1100_00);
  });

  it('looks 30 days ahead when there is no income set up', () => {
    const data = withItems(base(), {
      recurring: [bill({ amount: 100_00, startDate: '2026-11-15' }), bill({ amount: 100_00, startDate: '2026-12-15', frequency: 'once' })],
    });
    const o = paydayOutlook(data, TODAY);
    expect(o.payday).toBeNull();
    expect(o.horizon).toBe('2026-11-20');
    expect(o.billsTotal).toBe(100_00);
    expect(o.left).toBe(1000_00);
  });
});

describe('summaries and categories', () => {
  const pay = income({ id: 'pay', amount: 700_00, startDate: '2026-10-02' });
  const rent = bill({ id: 'rent', amount: 1200_00, startDate: '2026-10-01', categoryId: 'cat-housing' });

  const data = (() => {
    const d = withItems(emptyData(TODAY, { openingBalance: 0, balanceAsOf: '2026-10-01' }), {
      recurring: [pay, rent],
      transactions: [
        tx({ type: 'income', amount: 700_00, date: '2026-10-02', link: { recurringId: 'pay', date: '2026-10-02' } }),
        tx({ type: 'income', amount: 720_00, date: '2026-10-09', link: { recurringId: 'pay', date: '2026-10-09' } }),
        // Oct 16 paycheck not recorded yet.
        tx({ amount: 1200_00, date: '2026-10-01', categoryId: 'cat-housing', link: { recurringId: 'rent', date: '2026-10-01' } }),
        tx({ amount: 60_00, date: '2026-10-17', categoryId: 'cat-groceries', payee: 'Market' }),
        tx({ amount: 25_00, date: '2026-10-19', categoryId: 'cat-dining', payee: 'Cafe' }),
      ],
    });
    d.categories = d.categories.map((c) =>
      c.id === 'cat-housing' ? { ...c, planned: 1200_00 } : c.id === 'cat-groceries' ? { ...c, planned: 400_00 } : c,
    );
    return d;
  })();

  it('separates received, expected and unrecorded income', () => {
    const s = summarizePeriod(data, monthPeriod(TODAY), TODAY);
    expect(s.incomeReceived).toBe(1420_00);
    expect(s.incomeExpected).toBe(1400_00); // Oct 23 and Oct 30
    expect(s.incomeUnrecorded.map((o) => o.date)).toEqual(['2026-10-16']);
    expect(s.spent).toBe(1285_00);
    expect(s.billsPaid).toBe(1200_00);
    expect(s.billsUnpaid).toBe(0);
    expect(s.net).toBe(135_00);
  });

  it('counts a paycheck that arrived a day early in the pay period it was scheduled for', () => {
    const early = withItems(emptyData(TODAY, { balanceAsOf: '2026-10-01' }), {
      recurring: [pay],
      transactions: [tx({ type: 'income', amount: 700_00, date: '2026-10-15', link: { recurringId: 'pay', date: '2026-10-16' } })],
    });
    const thisPeriod = summarizePeriod(early, payPeriod(early, TODAY)!, TODAY); // Oct 16 - 22
    expect(thisPeriod.incomeReceived).toBe(700_00);
    expect(summarizePeriod(early, payPeriod(early, TODAY, -1)!, TODAY).incomeReceived).toBe(0);
    // The balance still counts it from the day it actually arrived.
    expect(currentBalance(early, '2026-10-15')).toBe(700_00);
  });

  it('compares spending to monthly limits', () => {
    const rows = categoryRows(data, monthPeriod(TODAY), TODAY);
    const housing = rows.find((r) => r.category.id === 'cat-housing')!;
    const groceries = rows.find((r) => r.category.id === 'cat-groceries')!;
    expect([housing.planned, housing.spent, housing.remaining]).toEqual([1200_00, 1200_00, 0]);
    expect([groceries.planned, groceries.spent, groceries.remaining]).toEqual([400_00, 60_00, 340_00]);
    expect(rows.every((r) => r.category.type === 'expense')).toBe(true);
  });

  it('prorates everyday limits for a pay period and plans bills when they are due', () => {
    const period = payPeriod(data, TODAY)!; // Oct 16 - Oct 22
    const rows = categoryRows(data, period, TODAY);
    const housing = rows.find((r) => r.category.id === 'cat-housing')!;
    const groceries = rows.find((r) => r.category.id === 'cat-groceries')!;
    expect(housing.planned).toBe(0); // rent isn't due this week and is fully covered by the bill
    expect(groceries.planned).toBe(Math.round((400_00 * 7 * 12) / 365));
    expect(groceries.spent).toBe(60_00);

    const rentWeek = categoryRows(data, payPeriod(data, '2026-09-30')!, TODAY).find((r) => r.category.id === 'cat-housing')!;
    expect(rentWeek.planned).toBe(1200_00);
  });

  it('projects the balance at the end of a period', () => {
    // Balance: 1420 - 1285 = 135. Plus Oct 23 and Oct 30 paydays; rent already paid.
    expect(projectedBalanceAt(data, '2026-10-31', TODAY)).toBe(135_00 + 1400_00);
    expect(projectedBalanceAt(data, '2026-09-30', TODAY)).toBeNull();
  });

  it('shows where the money went', () => {
    const slices = spendingByCategory(data, '2026-10-01', '2026-10-31');
    expect(slices.map((s) => s.categoryId)).toEqual(['cat-housing', 'cat-groceries', 'cat-dining']);
    expect(slices[0].share).toBeCloseTo(1200 / 1285);
    const trend = monthlyTrend(data, TODAY, 3);
    expect(trend.map((m) => m.month)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    expect(trend[2]).toMatchObject({ income: 1420_00, spent: 1285_00 });
  });
});

describe('saving toward irregular bills', () => {
  it('spreads yearly and quarterly bills across paychecks', () => {
    const insurance = bill({ amount: 1200_00, startDate: '2027-03-01', frequency: 'yearly' });
    const weekly = withItems(emptyData(TODAY), { recurring: [income({ amount: 700_00, startDate: '2026-10-02' }), insurance] });
    expect(setAsideFor(weekly, insurance, TODAY)).toEqual({ amount: Math.ceil(1200_00 / 52), per: 'paycheck' });

    const none = withItems(emptyData(TODAY), { recurring: [insurance] });
    expect(setAsideFor(none, insurance, TODAY)).toEqual({ amount: 100_00, per: 'month' });

    const quarterly = { ...insurance, frequency: 'quarterly' as const, amount: 300_00 };
    expect(setAsideFor(none, quarterly, TODAY)).toEqual({ amount: 100_00, per: 'month' });
  });

  it('divides a one-time bill by the paydays before it', () => {
    const repair = bill({ amount: 400_00, startDate: '2026-11-20', frequency: 'once' });
    const data = withItems(emptyData(TODAY), { recurring: [income({ amount: 700_00, startDate: '2026-10-02' }), repair] });
    // Paydays Oct 23, 30, Nov 6, 13 -> 4
    expect(setAsideFor(data, repair, TODAY)).toEqual({ amount: 100_00, per: 'paycheck' });
    expect(setAsideFor(data, { ...repair, startDate: '2026-10-25' }, TODAY)).toBeNull();
    expect(setAsideFor(data, bill({ amount: 50_00, startDate: '2026-10-25' }), TODAY)).toBeNull();
  });
});

describe('quick entry', () => {
  it('suggests linking a manual paycheck entry to the expected payday', () => {
    const pay = income({ id: 'pay', amount: 700_00, startDate: '2026-10-23' });
    const data = withItems(emptyData(TODAY), { recurring: [pay] });
    const candidates = linkCandidates(data, 'income', '2026-10-22', TODAY);
    expect(candidates.map((c) => c.date)).toEqual(['2026-10-23', '2026-10-30']);
    expect(suggestedLink(candidates, 'cat-paycheck', '2026-10-22')?.date).toBe('2026-10-23');
    expect(suggestedLink(candidates, 'cat-other-income', '2026-10-22')).toBeNull();
    expect(suggestedLink(candidates, 'cat-paycheck', '2026-10-12')).toBeNull();
  });

  it('offers recent entries without duplicates or bill payments', () => {
    const data = withItems(emptyData(TODAY), {
      recurring: [bill({ id: 'b', amount: 10_00, startDate: '2026-10-01' })],
      transactions: [
        tx({ amount: 4_50, date: '2026-10-20', payee: 'Cafe', categoryId: 'cat-dining' }),
        tx({ amount: 5_00, date: '2026-10-19', payee: 'cafe', categoryId: 'cat-dining' }),
        tx({ amount: 80_00, date: '2026-10-18', payee: 'Market' }),
        tx({ amount: 10_00, date: '2026-10-21', payee: 'Bill', link: { recurringId: 'b', date: '2026-10-01' } }),
      ],
    });
    expect(recentQuickFills(data).map((q) => [q.payee, q.amount])).toEqual([
      ['Cafe', 4_50],
      ['Market', 80_00],
    ]);
  });
});
