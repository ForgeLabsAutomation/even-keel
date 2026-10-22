import { useCallback } from 'react';
import { useStore } from '../state/store';
import { useConfirm } from '../ui/Confirm';
import { useToast } from '../ui/Toast';

/** Remove demo data after confirming, with Undo. */
export function useRemoveDemo() {
  const { data, dispatch, today } = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  return useCallback(async () => {
    const ok = await confirm({
      title: 'Remove demo data?',
      message: (
        <>
          <p>Every bill, paycheck and transaction marked “Demo” will be deleted.</p>
          <p>Anything you added or changed yourself stays as it is.</p>
        </>
      ),
      confirmLabel: 'Remove demo data',
    });
    if (!ok) return;
    const previous = data;
    dispatch({ type: 'demo/clear', today });
    toast.show('Demo data removed', { tone: 'info', actions: [{ label: 'Undo', onClick: () => dispatch({ type: 'data/replace', data: previous }) }] });
  }, [confirm, data, dispatch, today, toast]);
}
