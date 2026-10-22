import { transactionsToCsv } from '../lib/csv';
import { todayISO } from '../lib/dates';
import { serialize } from '../state/persistence';
import type { AppData, Transaction } from '../state/types';

export interface FileResult {
  ok: boolean;
  canceled?: boolean;
  error?: string;
  content?: string;
}

function browserDownload(name: string, content: string, mime: string): FileResult {
  try {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true };
  } catch {
    return { ok: false, error: 'The file could not be saved.' };
  }
}

async function saveFile(name: string, content: string, filter: FileFilter, mime: string): Promise<FileResult> {
  const api = window.budgetApi;
  if (api) return api.saveFile({ defaultName: name, content, filters: [filter] });
  return browserDownload(name, content, mime);
}

export function exportTransactionsCsv(data: AppData, transactions: Transaction[], scope: 'all' | 'filtered'): Promise<FileResult> {
  const name = `even-keel-transactions-${scope === 'filtered' ? 'filtered-' : ''}${todayISO()}.csv`;
  return saveFile(name, transactionsToCsv(data, transactions), { name: 'CSV spreadsheet', extensions: ['csv'] }, 'text/csv;charset=utf-8');
}

export function exportBackup(data: AppData): Promise<FileResult> {
  return saveFile(`even-keel-backup-${todayISO()}.json`, serialize(data), { name: 'Even Keel backup', extensions: ['json'] }, 'application/json');
}

export async function pickBackupFile(): Promise<FileResult> {
  const api = window.budgetApi;
  if (api) return api.openFile({ filters: [{ name: 'Even Keel backup', extensions: ['json'] }] });
  return new Promise<FileResult>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve({ ok: false, canceled: true });
      try {
        resolve({ ok: true, content: await file.text() });
      } catch {
        resolve({ ok: false, error: "That file couldn't be opened." });
      }
    };
    input.oncancel = () => resolve({ ok: false, canceled: true });
    input.click();
  });
}
