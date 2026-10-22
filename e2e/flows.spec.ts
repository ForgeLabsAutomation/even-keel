/**
 * End-to-end flows against the real desktop app (built renderer + Electron
 * main process + file storage). "Today" is pinned to Wed, Oct 21 2026.
 */
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { freshDataDir, launchApp, readSavedData, setWindowSize } from './launch';

async function addViaShortcut(page: Page, { amount, category, payee }: { amount: string; category: string; payee?: string }) {
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'Add transaction' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Amount').fill(amount);
  await dialog.getByRole('radio', { name: category }).check();
  if (payee) await dialog.getByLabel('Merchant or payee').fill(payee);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function nav(page: Page, name: string) {
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
}

test.describe.configure({ mode: 'serial' });

test('first run: set up, record spending, pay a bill, record pay, and it all persists', async () => {
  const userData = freshDataDir();
  let { app, page } = await launchApp(userData);
  await setWindowSize(app, 1280, 900);

  // Welcome steps are shown on first run.
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();

  // 1. Starting balance
  await page.getByLabel('Current balance').fill('500');
  await page.getByRole('button', { name: 'Save balance' }).click();
  await expect(page.getByTestId('balance')).toHaveText('$500.00');

  // 2. Weekly paycheck, next payday Friday
  await page.getByRole('button', { name: 'Add paycheck' }).click();
  let dialog = page.getByRole('dialog', { name: 'Add income' });
  await dialog.getByLabel('Name').fill('Paycheck');
  await dialog.getByLabel('Usual amount').fill('700');
  await dialog.getByLabel('Next payday').fill('2026-10-23');
  await expect(dialog.getByText('Every Friday')).toBeVisible();
  await dialog.getByRole('button', { name: 'Add income' }).click();
  await expect(dialog).toBeHidden();

  // 3. A bill due tomorrow
  await page.getByRole('button', { name: 'Add a bill' }).first().click();
  dialog = page.getByRole('dialog', { name: 'Add a bill' });
  await dialog.getByLabel('Name').fill('Phone');
  await dialog.getByLabel('Amount').fill('50');
  await dialog.getByLabel('Category').selectOption({ label: 'Utilities' });
  await dialog.getByLabel('Next due date').fill('2026-10-22');
  await dialog.getByRole('button', { name: 'Add bill' }).click();
  await expect(dialog).toBeHidden();

  // Left to spend = balance - bills due before payday.
  await expect(page.getByTestId('left-to-spend')).toHaveText('$450.00');
  await expect(page.getByText('About $225.00 a day for 2 days, until Fri, Oct 23')).toBeVisible();

  // 4. Quick expense with the keyboard shortcut
  await addViaShortcut(page, { amount: '12.50', category: 'Groceries', payee: 'Corner Market' });
  await expect(page.getByTestId('balance')).toHaveText('$487.50');
  await expect(page.getByTestId('left-to-spend')).toHaveText('$437.50');
  await expect(page.getByTestId('stat-spent')).toHaveText('$12.50');

  // Mark the bill paid: balance drops, left to spend doesn't change, and Undo works.
  const paid = page.getByRole('checkbox', { name: /Phone, Thu, Oct 22: paid/ });
  await paid.check();
  await expect(page.getByTestId('balance')).toHaveText('$437.50');
  await expect(page.getByTestId('left-to-spend')).toHaveText('$437.50');
  await page.getByRole('button', { name: 'Undo' }).last().click();
  await expect(page.getByTestId('balance')).toHaveText('$487.50');
  await paid.check();
  await expect(page.getByTestId('balance')).toHaveText('$437.50');
  // The schedule continues: next month's phone bill is still there.
  await nav(page, 'Bills');
  await expect(page.getByText(/Next: Sun, Nov 22/)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Phone, Thu, Oct 22: paid/ })).toBeChecked();

  // 5. Edit and delete a transaction from Activity.
  await nav(page, 'Activity');
  await page.getByRole('button', { name: /Edit Corner Market/ }).click();
  dialog = page.getByRole('dialog', { name: 'Edit transaction' });
  await dialog.getByLabel('Amount').fill('20');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await nav(page, 'Overview');
  await expect(page.getByTestId('balance')).toHaveText('$430.00');
  await nav(page, 'Activity');
  await page.getByRole('button', { name: /Edit Corner Market/ }).click();
  await page.getByRole('dialog', { name: 'Edit transaction' }).getByRole('button', { name: 'Delete' }).click();
  await nav(page, 'Overview');
  await expect(page.getByTestId('balance')).toHaveText('$450.00');

  // 6. Record the paycheck that actually arrived (a bit more than usual).
  await nav(page, 'Income');
  await page.getByRole('button', { name: /Record pay for Paycheck, Fri, Oct 23/ }).click();
  dialog = page.getByRole('dialog', { name: 'Record pay received' });
  await dialog.getByLabel('Amount received').fill('712.40');
  await dialog.getByRole('button', { name: 'Record pay' }).click();
  await expect(page.getByTestId('income-received')).toHaveText('$712.40');
  await nav(page, 'Overview');
  await expect(page.getByTestId('balance')).toHaveText('$1,162.40');
  await expect(page.getByText(/Fri, Oct 30/).first()).toBeVisible();

  // Give the debounced save a moment, then restart the app.
  await page.waitForTimeout(600);
  await app.close();
  const saved = readSavedData(userData);
  expect(saved.recurring).toHaveLength(2);
  expect(saved.transactions).toHaveLength(2); // phone payment + paycheck
  expect(saved.settings.openingBalance).toBe(50000);

  ({ app, page } = await launchApp(userData));
  await expect(page.getByTestId('balance')).toHaveText('$1,162.40');
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible(); // setup not dismissed yet
  await expect(page.getByText('4 of 4 done')).toBeVisible();
  await page.getByRole('button', { name: 'All set. Hide this' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeHidden();
  // A daily backup copy exists.
  expect(fs.readdirSync(path.join(userData, 'backups')).length).toBeGreaterThan(0);
  await app.close();
});

test('validation explains problems next to the field', async () => {
  const { app, page } = await launchApp();
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'Add transaction' });
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const amount = dialog.getByLabel('Amount');
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await expect(amount).toHaveAccessibleDescription('Enter an amount.');
  await expect(dialog.getByText('Pick a category.')).toBeVisible();
  await expect(amount).toBeFocused();

  await amount.fill('12.345');
  await expect(amount).toHaveAccessibleDescription('Use at most 2 decimal places.');
  await amount.fill('-4');
  await expect(dialog.getByText(/without a minus sign/)).toBeVisible();
  await amount.fill('4');
  await dialog.getByLabel('Date', { exact: true }).fill('2029-01-01');
  await expect(dialog.getByText(/more than 1 year away/)).toBeVisible();
  await app.close();
});

test('keyboard only: add an expense without the mouse', async () => {
  const { app, page } = await launchApp();
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'Add transaction' });
  await expect(dialog.getByLabel('Amount')).toBeFocused();
  await page.keyboard.type('8');
  // Tab into the category radio group and pick the first one with Space.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('balance')).toHaveText('−$8.00');
  await app.close();
});

test('monthly bill on the 31st follows short months, and pausing removes it from totals', async () => {
  const { app, page } = await launchApp();
  await page.getByRole('button', { name: 'Hide setup' }).click();
  await nav(page, 'Bills');
  await page.getByRole('button', { name: 'Add your first bill' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a bill' });
  await dialog.getByLabel('Name').fill('Rent');
  await dialog.getByLabel('Amount').fill('1200');
  await dialog.getByLabel('Category').selectOption({ label: 'Housing' });
  await dialog.getByLabel('Next due date').fill('2026-10-31');
  await expect(dialog.getByText('Sat, Oct 31 · Mon, Nov 30 · Thu, Dec 31')).toBeVisible();
  await dialog.getByRole('button', { name: 'Add bill' }).click();

  await page.getByRole('checkbox', { name: /Rent, Sat, Oct 31: paid/ }).check();
  await expect(page.getByText(/Next: Mon, Nov 30/)).toBeVisible();

  await page.getByRole('button', { name: 'Pause Rent' }).click();
  await expect(page.getByText('Not counted in upcoming totals while paused.')).toBeVisible();
  await expect(page.getByText(/Next: Mon, Nov 30/)).toHaveCount(0);
  // The payment already made stays marked paid while paused.
  await expect(page.getByRole('checkbox', { name: /Rent, Sat, Oct 31: paid/ })).toBeChecked();
  await page.getByRole('button', { name: 'Resume Rent' }).click();
  await expect(page.getByText(/Next: Mon, Nov 30/)).toBeVisible();

  // Deleting keeps the payment already made.
  await page.getByRole('button', { name: 'Edit Rent' }).click();
  await page.getByRole('dialog', { name: 'Edit bill' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog', { name: 'Delete Rent?' }).getByRole('button', { name: 'Delete' }).click();
  await nav(page, 'Activity');
  await expect(page.getByRole('button', { name: /Edit Rent/ })).toBeVisible();
  await app.close();
});

test('CSV export writes every transaction', async () => {
  const { app, page } = await launchApp();
  await addViaShortcut(page, { amount: '4.50', category: 'Dining', payee: 'Cafe, "downtown"' });
  await addViaShortcut(page, { amount: '60', category: 'Groceries' });
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'even-keel-csv-')), 'export.csv');
  // Stand in for the native save dialog.
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: file })) as typeof dialog.showSaveDialog;
  }, out);
  await nav(page, 'Settings');
  await page.getByRole('button', { name: 'Export transactions (CSV)' }).click();
  await expect(page.getByText('Exported 2 transactions')).toBeVisible();
  const csv = fs.readFileSync(out, 'utf8');
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  expect(lines[0]).toBe('Date,Type,Amount,Signed amount,Currency,Category,Payee,Note,Bill or income,Scheduled date');
  expect(lines).toHaveLength(3);
  expect(csv).toContain('"Cafe, ""downtown"""');
  await app.close();
});

test('demo data is labelled and removed completely', async () => {
  const { app, page } = await launchApp();
  await page.getByRole('button', { name: 'Explore with demo data first' }).click();
  await expect(page.getByText('You’re looking at demo data.')).toBeVisible();
  await expect(page.getByText(/bills? (is|are) past due/)).toHaveCount(0); // demo has no overdue bills
  await nav(page, 'Bills');
  await expect(page.getByText('Rent (demo)').first()).toBeVisible();
  await page.getByRole('button', { name: 'Remove demo data' }).click();
  await page.getByRole('dialog', { name: 'Remove demo data?' }).getByRole('button', { name: 'Remove demo data' }).click();
  await expect(page.getByText('You’re looking at demo data.')).toBeHidden();
  await nav(page, 'Overview');
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await expect(page.getByTestId('balance')).toHaveText('$0.00');
  await app.close();
});

test('twice-a-month pay can still be edited after a payday is recorded', async () => {
  const { app, page } = await launchApp();
  await page.getByRole('button', { name: 'Hide setup' }).click();
  await nav(page, 'Income');
  await page.getByRole('button', { name: 'Add income source' }).click();
  let dialog = page.getByRole('dialog', { name: 'Add income' });
  await dialog.getByLabel('Name').fill('Salary');
  await dialog.getByLabel('Usual amount').fill('1500');
  await dialog.getByLabel('How often').selectOption('semimonthly');
  await dialog.getByLabel('Next payday').fill('2026-10-15');
  await dialog.getByLabel('Second day each month').selectOption('31');
  await expect(dialog.getByText('Twice a month on the 15th and last day')).toBeVisible();
  await dialog.getByRole('button', { name: 'Add income' }).click();

  await page.getByRole('button', { name: /Record pay for Salary, Thu, Oct 15/ }).click();
  await page.getByRole('dialog', { name: 'Record pay received' }).getByRole('button', { name: 'Record pay' }).click();

  await page.getByRole('button', { name: 'Edit Salary' }).click();
  dialog = page.getByRole('dialog', { name: 'Edit income' });
  await expect(dialog.getByLabel('Next payday')).toHaveValue('2026-10-31');
  await expect(dialog.getByText('Twice a month on the 15th and last day')).toBeVisible();
  await dialog.getByLabel('Name').fill('Salary (main job)');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Twice a month on the 15th and last day · Paycheck')).toBeVisible();
  await app.close();
});

test('budget limits: Enter saves, Escape cancels', async () => {
  const { app, page } = await launchApp();
  await nav(page, 'Budget');
  const groceries = page.getByLabel('Monthly limit for Groceries');
  await groceries.fill('400');
  await groceries.press('Enter');
  await expect(groceries).toHaveValue('400');
  await groceries.fill('999');
  await groceries.press('Escape');
  await expect(groceries).toHaveValue('400');
  await page.waitForTimeout(400);
  await nav(page, 'Overview');
  await nav(page, 'Budget');
  await expect(page.getByLabel('Monthly limit for Groceries')).toHaveValue('400');
  await app.close();
});

test('destructive confirmations start on Cancel', async () => {
  const { app, page } = await launchApp();
  await nav(page, 'Settings');
  await page.getByRole('button', { name: 'Erase everything' }).click();
  const dialog = page.getByRole('dialog', { name: 'Erase everything?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await app.close();
});

test('currency and theme preferences apply right away', async () => {
  const { app, page } = await launchApp();
  await addViaShortcut(page, { amount: '10', category: 'Other' });
  await nav(page, 'Settings');
  await page.getByLabel('Currency').selectOption('EUR');
  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await nav(page, 'Overview');
  await expect(page.getByTestId('balance')).toHaveText('−€10.00');
  await app.close();
});
