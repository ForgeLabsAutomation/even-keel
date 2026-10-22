import { useState, type FormEvent } from 'react';
import { defaultSettleDate } from '../../app/useActions';
import { useUi } from '../../app/ui';
import { linkIndex, occurrenceKey } from '../../lib/budget';
import { formatFullDay, formatLong, isValidISODate } from '../../lib/dates';
import { newId, nowStamp } from '../../lib/ids';
import { centsToInput, formatMoney, parseAmount } from '../../lib/money';
import { useStore } from '../../state/store';
import { Dialog } from '../../ui/Dialog';
import { AmountInput, Field } from '../../ui/Field';
import { useToast } from '../../ui/Toast';

/** Record what actually arrived (pay) or what was actually paid (bill) for one scheduled date. */
export function SettleDialog() {
  const { dialog, closeDialog } = useUi();
  const { data } = useStore();
  const open = dialog.kind === 'settle';
  const item = open ? data.recurring.find((r) => r.id === dialog.recurringId) : undefined;
  const isIncome = item?.kind === 'income';
  return (
    <Dialog
      open={open && !!item}
      onClose={closeDialog}
      size="sm"
      title={isIncome ? 'Record pay received' : 'Mark bill paid'}
      description={item && open ? `${item.name} · scheduled for ${formatFullDay(dialog.date)}` : undefined}
    >
      {open && item && <SettleForm key={`${item.id}|${dialog.date}`} recurringId={item.id} date={dialog.date} onDone={closeDialog} />}
    </Dialog>
  );
}

function SettleForm({ recurringId, date, onDone }: { recurringId: string; date: string; onDone: () => void }) {
  const { data, dispatch, today } = useStore();
  const toast = useToast();
  const item = data.recurring.find((r) => r.id === recurringId)!;
  const isIncome = item.kind === 'income';
  const [amount, setAmount] = useState(centsToInput(item.amount));
  const [paidOn, setPaidOn] = useState(defaultSettleDate(date, today));
  const [errors, setErrors] = useState<{ amount?: string; paidOn?: string }>({});
  const alreadySettled = linkIndex(data.transactions).has(occurrenceKey(recurringId, date));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseAmount(amount);
    const next: typeof errors = {};
    if (!parsed.ok) next.amount = parsed.error;
    if (!isValidISODate(paidOn)) next.paidOn = 'Enter a real date.';
    else if (paidOn > today) next.paidOn = isIncome ? 'Record pay once it has arrived.' : 'Choose today or an earlier date.';
    setErrors(next);
    if (!parsed.ok || next.paidOn) return;
    if (alreadySettled) {
      onDone();
      return;
    }
    dispatch({ type: 'occurrence/settle', recurringId, date, amount: parsed.cents, paidOn, txId: newId('tx'), now: nowStamp() });
    const diff = parsed.cents - item.amount;
    const note =
      isIncome && diff !== 0 ? ` (${formatMoney(Math.abs(diff), data.settings.currency)} ${diff > 0 ? 'more' : 'less'} than usual)` : '';
    toast.show(`${item.name}: ${formatMoney(parsed.cents, data.settings.currency)} ${isIncome ? 'received' : 'paid'}${note}`, {
      actions: [{ label: 'Undo', onClick: () => dispatch({ type: 'occurrence/unsettle', recurringId, date }) }],
    });
    onDone();
  };

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <Field
        label={isIncome ? 'Amount received' : 'Amount paid'}
        error={errors.amount}
        hint={`${isIncome ? 'Usual pay' : 'Scheduled amount'}: ${formatMoney(item.amount, data.settings.currency)}`}
      >
        <AmountInput value={amount} onChange={setAmount} large data-autofocus onFocus={(e) => e.currentTarget.select()} />
      </Field>
      <Field
        label={isIncome ? 'Date received' : 'Date paid'}
        error={errors.paidOn}
        hint={
          date < data.settings.balanceAsOf
            ? `This was due before your starting balance date (${formatLong(data.settings.balanceAsOf)}). If it was ${isIncome ? 'received' : 'paid'} before then, keep this date: your starting balance already includes it. If it was later, enter that date so your balance updates.`
            : undefined
        }
      >
        <input type="date" className="input" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
      </Field>
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          {isIncome ? 'Record pay' : 'Mark paid'}
        </button>
      </div>
    </form>
  );
}
