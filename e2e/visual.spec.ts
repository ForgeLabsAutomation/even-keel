/**
 * Visual QA: screenshots of every page with demo data at desktop and phone
 * widths, light and dark. Output goes to e2e-artifacts/ for review.
 */
import { test } from '@playwright/test';
import path from 'node:path';
import { ROOT, launchApp, setWindowSize } from './launch';

const OUT = path.join(ROOT, 'e2e-artifacts');
const PAGES = [
  { nav: 'Overview', file: 'overview' },
  { nav: 'Activity', file: 'activity' },
  { nav: 'Bills', file: 'bills' },
  { nav: 'Income', file: 'income' },
  { nav: 'Budget', file: 'budget' },
];

test('screenshots of every page', async () => {
  const { app, page } = await launchApp();

  // Empty state first.
  await setWindowSize(app, 1280, 860);
  await page.screenshot({ path: path.join(OUT, 'desktop-empty.png'), fullPage: true });

  await page.getByRole('button', { name: 'Explore with demo data first' }).click();
  await page.locator('.toast__close').first().click();
  await page.waitForTimeout(300);
  // README screenshot: the first screen as a new user would see it with demo data.
  await page.screenshot({ path: path.join(ROOT, 'docs', 'screenshot.png') });

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    await setWindowSize(app, 1280, 860);
    for (const p of PAGES) {
      await page.locator('.sidebar').getByRole('button', { name: p.nav }).click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, `desktop-${theme}-${p.file}.png`), fullPage: true });
    }
    await page.locator('.sidebar').getByRole('button', { name: 'Settings' }).click();
    await page.screenshot({ path: path.join(OUT, `desktop-${theme}-settings.png`), fullPage: true });

    await setWindowSize(app, 390, 844);
    for (const p of PAGES) {
      await page.locator('.bottom-nav').getByRole('button', { name: p.nav }).click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, `mobile-${theme}-${p.file}.png`), fullPage: true });
    }
  }

  // Dialogs
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await setWindowSize(app, 1280, 860);
  await page.locator('.sidebar').getByRole('button', { name: 'Overview' }).click();
  await page.keyboard.press('n');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'desktop-add-transaction.png') });
  await page.keyboard.press('Escape');
  await page.locator('.sidebar').getByRole('button', { name: 'Bills' }).click();
  await page.getByRole('button', { name: 'Add bill' }).click();
  await page.getByLabel('Name').fill('Car insurance');
  await page.getByLabel('Amount').fill('540');
  await page.getByLabel('How often').selectOption('quarterly');
  await page.getByLabel('Next due date').fill('2026-10-31');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, 'desktop-add-bill.png') });
  await page.keyboard.press('Escape');

  await setWindowSize(app, 390, 844);
  await page.locator('.fab').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'mobile-add-transaction.png') });

  await app.close();
});
