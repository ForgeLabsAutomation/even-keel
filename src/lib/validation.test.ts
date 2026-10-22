import { describe, expect, it } from 'vitest';
import { pastDateHint, validateRecurring, validateTransaction, type RecurringInput, type TransactionInput } from './validation';
import { STARTER_CATEGORIES } from '../state/defaults';

const TODAY = '2026-10-21';
const cats = STARTER_CATEGORIES;

const txInput = (patch: Partial<TransactionInput> = {}): TransactionInput => ({
  type: 'expense',
  amount: '12.50',
  categoryId: 'cat-groceries',
  date: TODAY,
  payee: '  Market ',
  note: '',
  ...patch,
});

describe('validateTransaction', () => {
  it('returns a clean value for good input', () => {
    expect(validateTransaction(txInput(), cats, TODAY)).toEqual({
      errors: {},
      value: { type: 'expense', amount: 1250, categoryId: 'cat-groceries', date: TODAY, payee: 'Market' },
    });
  });

  it('explains each problem next to its field', () => {
    const { errors, value } = validateTransaction(txInput({ amount: '', categoryId: '', date: '' }), cats, TODAY);
    expect(value).toBeUndefined();
    expect(errors.amount).toBe('Enter an amount.');
    expect(errors.categoryId).toBe('Pick a category.');
    expect(errors.date).toBe('Choose a date.');
  });

  it('catches mismatched categories and unlikely dates', () => {
    expect(validateTransaction(txInput({ categoryId: 'cat-paycheck' }), cats, TODAY).errors.categoryId).toMatch(/expense category/);
    expect(validateTransaction(txInput({ date: '2028-01-01' }), cats, TODAY).errors.date).toMatch(/Check the year/);
    expect(validateTransaction(txInput({ date: '1980-01-01' }), cats, TODAY).errors.date).toMatch(/Check the year/);
    expect(validateTransaction(txInput({ date: '2026-02-31' }), cats, TODAY).errors.date).toMatch(/real date/);
    expect(validateTransaction(txInput({ note: 'x'.repeat(501) }), cats, TODAY).errors.note).toBeDefined();
  });
});

const recInput = (patch: Partial<RecurringInput> = {}): RecurringInput => ({
  name: 'Rent',
  amount: '1200',
  categoryId: 'cat-housing',
  frequency: 'monthly',
  startDate: '2026-11-01',
  secondDay: '',
  note: '',
  ...patch,
});

describe('validateRecurring', () => {
  it('accepts a monthly bill', () => {
    expect(validateRecurring(recInput(), 'bill', cats, TODAY).value).toEqual({
      name: 'Rent',
      amount: 120000,
      categoryId: 'cat-housing',
      frequency: 'monthly',
      startDate: '2026-11-01',
    });
  });

  it('requires a name and the right kind of category', () => {
    const { errors } = validateRecurring(recInput({ name: ' ', categoryId: 'cat-paycheck' }), 'bill', cats, TODAY);
    expect(errors.name).toBeDefined();
    expect(errors.categoryId).toBeDefined();
  });

  it('checks the second payday of twice-a-month schedules', () => {
    const base = recInput({ name: 'Pay', categoryId: 'cat-paycheck', frequency: 'semimonthly', startDate: '2026-11-01' });
    expect(validateRecurring({ ...base, secondDay: '' }, 'income', cats, TODAY).errors.secondDay).toBeDefined();
    expect(validateRecurring({ ...base, secondDay: '4' }, 'income', cats, TODAY).errors.secondDay).toMatch(/a week apart/);
    expect(validateRecurring({ ...base, secondDay: '15' }, 'income', cats, TODAY).value?.secondDay).toBe(15);
  });

  it('gives a gentle hint for past dates', () => {
    expect(pastDateHint('bill', '2026-10-01', TODAY)).toMatch(/overdue/);
    expect(pastDateHint('bill', '2026-11-01', TODAY)).toBeUndefined();
  });
});
