import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FAKE_TODAY = '2026-10-21'; // a Wednesday

export interface Launched {
  app: ElectronApplication;
  page: Page;
  userData: string;
}

export function freshDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'even-keel-e2e-'));
}

/** Launch the built app (dist/) with an isolated data folder and a pinned "today". */
export async function launchApp(userData = freshDataDir(), today = FAKE_TODAY): Promise<Launched> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  delete env.ELECTRON_RUN_AS_NODE;
  env.EVEN_KEEL_USER_DATA = userData;
  env.EVEN_KEEL_FAKE_TODAY = today;
  env.EVEN_KEEL_E2E = '1';
  const app = await electron.launch({ args: [ROOT], env });
  const page = await app.firstWindow();
  await page.waitForSelector('.shell');
  return { app, page, userData };
}

export function readSavedData(userData: string): any {
  return JSON.parse(fs.readFileSync(path.join(userData, 'even-keel-data.json'), 'utf8'));
}

export async function setWindowSize(app: ElectronApplication, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.unmaximize();
    win.setContentSize(size.width, size.height);
    win.showInactive();
  }, { width, height });
}
