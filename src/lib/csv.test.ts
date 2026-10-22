import { describe, expect, it } from 'vitest';
import { csvCell, transactionsToCsv } from './csv';
import { bill, emptyData, tx, withItems } from '../test/factory';

describe('csvCell', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('neutralises spreadsheet formulas in text but not in numbers', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-12.00', { text: false })).toBe('-12.00');
  });
});

describe('transactionsToCsv', () => {
  it('exports every transaction in date order with readable columns', () => {
    const data = withItems(emptyData('2026-10-21'), {
      recurring: [bill({ id: 'rent', name: 'Rent', amount: 1200_00, startDate: '2026-10-01', categoryId: 'cat-housing' })],
      transactions: [
        tx({ amount: 12_34, date: '2026-10-05', payee: 'Corner, Market', note: 'Milk "2%"' }),
        tx({ type: 'income', amount: 700_00, date: '2026-10-02', payee: 'Work' }),
        tx({ amount: 1200_00, date: '2026-10-01', categoryId: 'cat-housing', payee: 'Rent', link: { recurringId: 'rent', date: '2026-10-01' } }),
      ],
    });
    const csv = transactionsToCsv(data);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Date,Type,Amount,Signed amount,Currency,Category,Payee,Note,Bill or income,Scheduled date');
    expect(lines[1]).toBe('2026-10-01,Expense,1200.00,-1200.00,USD,Housing,Rent,,Rent,2026-10-01');
    expect(lines[2]).toBe('2026-10-02,Income,700.00,700.00,USD,Paycheck,Work,,,');
    expect(lines[3]).toBe('2026-10-05,Expense,12.34,-12.34,USD,Groceries,"Corner, Market","Milk ""2%""",,');
  });
});
