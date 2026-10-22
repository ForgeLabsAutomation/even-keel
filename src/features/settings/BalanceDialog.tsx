import { useState, type FormEvent } from 'react';
import { useUi } from '../../app/ui';
import { currentBalance } from '../../lib/budget';
import { formatLong } from '../../lib/dates';
import { centsToInput, formatMoney, parseSignedAmount } from '../../lib/money';
import { useStore } from '../../state/store';
import { Dialog } from '../../ui/Dialog';
import { AmountInput, Field } from '../../ui/Field';
import { useToast } from '../../ui/Toast';

/** Bring the app's estimate in line with the real bank balance. */
export function BalanceDialog() {
  const { dialog, closeDialog } = useUi();
  return (
    <Dialog
      open={dialog.kind === 'balance'}
      onClose={closeDialog}
      size="sm"
      title="Update your balance"
      description="Check your bank and enter what's actually there now. Your history isn't changed; the starting balance is adjusted so today's estimate matches."
    >
      {dialog.kind === 'balance' && <BalanceForm onDone={closeDialog} />}
    </Dialog>
  );
}

function BalanceForm({ onDone }: { onDone: () => void }) {
  const { data, dispatch, today } = useStore();
  const toast = useToast();
  const estimate = currentBalance(data, today);
  const [value, setValue] = useState(centsToInput(estimate));
  const [error, setError] = useState<string>();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseSignedAmount(value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const diff = parsed.cents - estimate;
    dispatch({ type: 'balance/reconcile', actual: parsed.cents, today });
    toast.show(
      diff === 0
        ? 'Balance confirmed. Everything matches.'
        : `Balance updated to ${formatMoney(parsed.cents, data.settings.currency)} (${formatMoney(diff, data.settings.currency, { signed: true })})`,
    );
    onDone();
  };

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <p className="muted">
        Current estimate: <strong>{formatMoney(estimate, data.settings.currency)}</strong>, based on your starting balance from {formatLong(data.settings.balanceAsOf)}.
      </p>
      <Field label="Actual balance today" error={error} hint="A negative amount is OK, e.g. -25.00.">
        <AmountInput value={value} onChange={setValue} large data-autofocus onFocus={(e) => e.currentTarget.select()} />
      </Field>
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Save balance
        </button>
      </div>
    </form>
  );
}
