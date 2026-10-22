import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { todayISO, type ISODate } from '../lib/dates';
import { reducer, type Action } from './reducer';
import { serialize, type Storage } from './persistence';
import type { AppData } from './types';

export type SaveStatus = 'saved' | 'saving' | 'error';

interface StoreValue {
  data: AppData;
  dispatch: (action: Action) => void;
  today: ISODate;
  saveStatus: SaveStatus;
  saveError?: string;
  retrySave: () => void;
  /** Write any pending changes right away (before installing an update, for example). False if that failed. */
  flush: () => boolean;
  storageKind: Storage['kind'];
}

const StoreContext = createContext<StoreValue | null>(null);

const SAVE_DELAY_MS = 250;

/** Tracks the calendar date, rolling over at midnight and when the window regains focus. */
function useToday(): ISODate {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const check = () => setToday((prev) => {
      const now = todayISO();
      return now === prev ? prev : now;
    });
    const timer = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

export function StoreProvider({ initial, storage, children }: { initial: AppData; storage: Storage; children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, initial);
  const today = useToday();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string>();

  const latest = useRef(data);
  const savedJson = useRef(serialize(initial));
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);
  /** Bumped by every save, so a slow save can't overwrite the bookkeeping of a newer one. */
  const saveVersion = useRef(0);

  const persist = useCallback(async () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (inFlight.current) {
      // Another save is running; try again once it finishes.
      timer.current = window.setTimeout(() => void persist(), SAVE_DELAY_MS);
      return;
    }
    const json = serialize(latest.current);
    if (json === savedJson.current) {
      setSaveStatus('saved');
      return;
    }
    const version = ++saveVersion.current;
    inFlight.current = true;
    setSaveStatus('saving');
    try {
      const result = await storage.save(json);
      if (version !== saveVersion.current) return; // a newer save already took over
      if (result.ok) {
        savedJson.current = json;
        setSaveError(undefined);
        if (serialize(latest.current) === json) setSaveStatus('saved');
        else timer.current = window.setTimeout(() => void persist(), SAVE_DELAY_MS);
      } else {
        setSaveStatus('error');
        setSaveError(result.error ?? 'Your changes could not be saved.');
      }
    } catch {
      if (version !== saveVersion.current) return;
      setSaveStatus('error');
      setSaveError('Your changes could not be saved.');
    } finally {
      inFlight.current = false;
    }
  }, [storage]);

  useEffect(() => {
    latest.current = data;
    if (serialize(data) === savedJson.current) return;
    setSaveStatus('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void persist(), SAVE_DELAY_MS);
  }, [data, persist]);

  const flush = useCallback((): boolean => {
    const json = serialize(latest.current);
    if (json === savedJson.current) return true;
    window.clearTimeout(timer.current);
    saveVersion.current++;
    const result = storage.saveNow(json);
    if (result.ok) {
      savedJson.current = json;
      setSaveError(undefined);
      setSaveStatus('saved');
    } else {
      setSaveStatus('error');
      setSaveError(result.error ?? 'Your changes could not be saved.');
    }
    return result.ok;
  }, [storage]);

  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  const value = useMemo<StoreValue>(
    () => ({
      data,
      dispatch,
      today,
      saveStatus,
      saveError,
      retrySave: () => void persist(),
      flush,
      storageKind: storage.kind,
    }),
    [data, today, saveStatus, saveError, persist, flush, storage.kind],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}
