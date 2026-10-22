import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../state/store';

/** Live view of the desktop app's update status, plus the actions to drive it. */
export function useUpdates() {
  const { flush } = useStore();
  const api = typeof window !== 'undefined' ? window.budgetApi : undefined;
  const [state, setState] = useState<UpdateState>(
    api ? { status: 'idle' } : { status: 'unsupported', reason: 'Updates are available in the desktop app.' },
  );

  useEffect(() => {
    if (!api) return undefined;
    let alive = true;
    api.updates.getState().then((s) => alive && setState(s)).catch(() => {});
    const off = api.updates.onState((s) => setState(s));
    return () => {
      alive = false;
      off();
    };
  }, [api]);

  const check = useCallback(async () => {
    if (!api) return;
    setState({ status: 'checking' });
    setState(await api.updates.check());
  }, [api]);

  const download = useCallback(async () => {
    if (!api) return;
    setState(await api.updates.download());
  }, [api]);

  const install = useCallback(() => {
    if (!api) return;
    // Make sure every change is on disk before the app restarts; if that fails, don't restart.
    if (!flush()) return;
    api.updates.install();
  }, [api, flush]);

  return { state, check, download, install, supported: !!api && state.status !== 'unsupported' };
}
