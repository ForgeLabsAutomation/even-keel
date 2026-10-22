import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setTodayOverride, todayISO } from './lib/dates';
import { getStorage, normalizeData } from './state/persistence';
import { createEmptyData } from './state/defaults';
import { StoreProvider } from './state/store';
import './styles/app.css';

async function start() {
  const root = createRoot(document.getElementById('root')!);
  if (window.budgetApi?.fakeToday) setTodayOverride(window.budgetApi.fakeToday);
  const today = todayISO();
  const storage = getStorage();
  const notes: string[] = [];

  let data = createEmptyData(today);
  try {
    const loaded = await storage.load();
    if (loaded.error) notes.push(loaded.error);
    if (loaded.recoveredFromBackup) notes.push('Your data file was damaged, so the most recent backup copy was loaded instead.');
    if (loaded.json) {
      const result = normalizeData(JSON.parse(loaded.json), today);
      data = result.data;
      notes.push(...result.warnings);
    }
  } catch {
    notes.push('Your saved data could not be read, so a fresh budget was started.');
  }

  root.render(
    <StrictMode>
      <StoreProvider initial={data} storage={storage}>
        <App loadNotes={notes} />
      </StoreProvider>
    </StrictMode>,
  );
}

void start();
