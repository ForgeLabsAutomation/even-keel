import { centsToDecimal } from './money';
import type { AppData, Transaction } from '../state/types';

const HEADERS = ['Date', 'Type', 'Amount', 'Signed amount', 'Currency', 'Category', 'Payee', 'Note', 'Bill or income', 'Scheduled date'];

/**
 * Quote a CSV cell. Text that a spreadsheet could treat as a formula
 * (starting with =, +, -, @) is prefixed with an apostrophe.
 */
export function csvCell(value: string | number | undefined, { text = true } = {}): string {
  let s = value === undefined ? '' : String(value);
  if (text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function transactionsToCsv(data: AppData, transactions: Transaction[] = data.transactions): string {
  const categories = new Map(data.categories.map((c) => [c.id, c.name]));
  const recurring = new Map(data.recurring.map((r) => [r.id, r.name]));
  const rows = [...transactions].sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date < b.date ? -1 : 1));
  const lines = [HEADERS.map((h) => csvCell(h)).join(',')];
  for (const tx of rows) {
    lines.push(
      [
        csvCell(tx.date, { text: false }),
        csvCell(tx.type === 'income' ? 'Income' : 'Expense'),
        csvCell(centsToDecimal(tx.amount), { text: false }),
        csvCell(centsToDecimal(tx.type === 'income' ? tx.amount : -tx.amount), { text: false }),
        csvCell(data.settings.currency),
        csvCell(categories.get(tx.categoryId) ?? ''),
        csvCell(tx.payee),
        csvCell(tx.note),
        csvCell(tx.link ? (recurring.get(tx.link.recurringId) ?? '') : ''),
        csvCell(tx.link?.date, { text: false }),
      ].join(','),
    );
  }
  // The byte-order mark helps Excel open the file as UTF-8.
  return `﻿${lines.join('\r\n')}\r\n`;
}
