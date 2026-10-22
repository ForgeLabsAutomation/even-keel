import { CalendarDays, Pause, Play, Trash } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useUi } from '../../app/ui';
import { OVERDUE_LOOKBACK_DAYS, linkIndex, nextOpenOccurrence } from '../../lib/budget';
import { addDays, formatWithWeekday, isValidISODate, maxDate, ordinal, parts } from '../../lib/dates';
import { newId, nowStamp } from '../../lib/ids';
import { centsToInput } from '../../lib/money';
import {
  BILL_FREQUENCIES,
  FREQUENCY_LABELS,
  INCOME_FREQUENCIES,
  defaultSecondDay,
  describeSchedule,
  nextOnOrAfter,
  occurrencesBetween,
} from '../../lib/recurrence';
import { MAX_NAME, MAX_NOTE, pastDateHint, validateRecurring, type FieldErrors, type RecurringField, type RecurringInput } from '../../lib/validation';
import { useStore } from '../../state/store';
import type { Frequency, RecurringItem } from '../../state/types';
import { useConfirm } from '../../ui/Confirm';
import { Dialog } from '../../ui/Dialog';
import { AmountInput, Field } from '../../ui/Field';
import { useToast } from '../../ui/Toast';

export function RecurringDialog() {
  const { dialog, closeDialog } = useUi();
  const { data } = useStore();
  const open = dialog.kind === 'recurring';
  const kind = open ? dialog.itemKind : 'bill';
  const existing = open && dialog.id ? data.recurring.find((r) => r.id === dialog.id) : undefined;
  const isBill = kind === 'bill';
  return (
    <Dialog
      open={open && (!dialog.id || !!existing)}
      onClose={closeDialog}
      title={existing ? (isBill ? 'Edit bill' : 'Edit income') : isBill ? 'Add a bill' : 'Add income'}
      description={
        existing
          ? undefined
          : isBill
            ? 'Bills repeat on a schedule. Mark each one paid as it happens. The schedule stays as it is.'
            : 'Set your usual pay. Each payday shows as expected until you record what actually arrived.'
      }
    >
      {open && <RecurringForm key={existing?.id ?? `new-${kind}`} kind={kind} existing={existing} onDone={closeDialog} />}
    </Dialog>
  );
}

function RecurringForm({ kind, existing, onDone }: { kind: RecurringItem['kind']; existing?: RecurringItem; onDone: () => void }) {
  const { data, dispatch, today } = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const isBill = kind === 'bill';
  const categories = data.categories.filter((c) => c.type === (isBill ? 'expense' : 'income'));

  // When editing, show the next unsettled date (looking back only as far as
  // overdue bills are shown). If the person leaves the date and schedule alone,
  // the original anchor is kept, so a "31st" bill doesn't become a "28th" bill
  // and a "15th and last day" paycheck keeps both days.
  const shownDate = useMemo(() => {
    if (!existing) return '';
    const from = maxDate(existing.startDate, addDays(today, -OVERDUE_LOOKBACK_DAYS));
    return nextOpenOccurrence(data, existing, from, linkIndex(data.transactions)) ?? nextOnOrAfter(existing, from) ?? existing.startDate;
  }, [existing?.id]);

  const [form, setForm] = useState<RecurringInput>(() => ({
    name: existing?.name ?? '',
    amount: existing ? centsToInput(existing.amount) : '',
    categoryId: existing?.categoryId ?? (isBill ? '' : (categories[0]?.id ?? '')),
    frequency: existing?.frequency ?? (isBill ? 'monthly' : 'weekly'),
    startDate: shownDate,
    secondDay: existing?.secondDay ? String(existing.secondDay) : '',
    note: existing?.note ?? '',
  }));
  const [errors, setErrors] = useState<FieldErrors<RecurringField>>({});
  const [submitted, setSubmitted] = useState(false);

  const set = <K extends keyof RecurringInput>(key: K, value: RecurringInput[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'startDate' || key === 'frequency') {
        if (next.frequency === 'semimonthly' && !next.secondDay && isValidISODate(next.startDate)) {
          next.secondDay = String(defaultSecondDay(parts(next.startDate)[2]));
        }
      }
      if (submitted) setErrors(validate(next).errors);
      return next;
    });
  };

  /** True when editing and the date/schedule are untouched, so the original anchor stays. */
  function keepAnchorFor(f: RecurringInput): boolean {
    return (
      !!existing &&
      f.startDate === shownDate &&
      f.frequency === existing.frequency &&
      (f.frequency !== 'semimonthly' || Number(f.secondDay || 0) === (existing.secondDay ?? 0))
    );
  }
  const keepAnchor = keepAnchorFor(form);
  const validate = (f: RecurringInput) =>
    keepAnchorFor(f)
      ? validateRecurring({ ...f, startDate: existing!.startDate }, kind, data.categories, today, { keepStartDate: true })
      : validateRecurring(f, kind, data.categories, today);

  const preview = useMemo(() => {
    if (!isValidISODate(form.startDate)) return null;
    const schedule = {
      frequency: form.frequency,
      startDate: keepAnchor ? existing!.startDate : form.startDate,
      secondDay: form.secondDay ? Number(form.secondDay) : undefined,
    };
    const next = occurrencesBetween(schedule, form.startDate, addDays(form.startDate, 800)).slice(0, form.frequency === 'once' ? 1 : 3);
    return { text: describeSchedule(schedule), next };
  }, [form.frequency, form.startDate, form.secondDay, keepAnchor, existing]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const result = validate(form);
    setErrors(result.errors);
    if (!result.value) {
      const first = (['name', 'amount', 'categoryId', 'frequency', 'startDate', 'secondDay', 'note'] as const).find((k) => result.errors[k]);
      if (first) document.querySelector<HTMLElement>(`[data-rfield="${first}"]`)?.focus();
      return;
    }
    const v = result.value;
    if (existing) {
      const item: RecurringItem = {
        ...existing,
        name: v.name,
        amount: v.amount,
        categoryId: v.categoryId,
        frequency: v.frequency,
        startDate: keepAnchor ? existing.startDate : v.startDate,
        secondDay: v.frequency === 'semimonthly' ? v.secondDay : undefined,
        note: v.note,
        // Skips before the new start no longer matter.
        skipped: keepAnchor ? existing.skipped : existing.skipped.filter((d) => d >= v.startDate),
      };
      dispatch({ type: 'recurring/update', item });
      toast.show(`${v.name} updated`);
    } else {
      const item: RecurringItem = {
        id: newId(isBill ? 'bill' : 'income'),
        kind,
        name: v.name,
        amount: v.amount,
        categoryId: v.categoryId,
        frequency: v.frequency,
        startDate: v.startDate,
        ...(v.secondDay ? { secondDay: v.secondDay } : {}),
        paused: false,
        skipped: [],
        ...(v.note ? { note: v.note } : {}),
        createdAt: nowStamp(),
      };
      dispatch({ type: 'recurring/add', item });
      toast.show(isBill ? `${v.name} added to your bills` : `${v.name} added to your income`);
    }
    onDone();
  };

  const remove = async () => {
    if (!existing) return;
    const payments = data.transactions.filter((t) => t.link?.recurringId === existing.id).length;
    const ok = await confirm({
      title: `Delete ${existing.name}?`,
      message: (
        <>
          <p>Its upcoming {isBill ? 'due dates' : 'paydays'} will be removed.</p>
          {payments > 0 && (
            <p>
              The {payments} {isBill ? 'payment' : 'paycheck'}
              {payments === 1 ? '' : 's'} already recorded will stay in your activity.
            </p>
          )}
          <p>Tip: pausing keeps it around without the reminders.</p>
        </>
      ),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    dispatch({ type: 'recurring/delete', id: existing.id });
    toast.show(`${existing.name} deleted`, { tone: 'info' });
    onDone();
  };

  const togglePause = () => {
    if (!existing) return;
    dispatch({ type: 'recurring/setPaused', id: existing.id, paused: !existing.paused, today });
    toast.show(existing.paused ? `${existing.name} resumed` : `${existing.name} paused. It won’t count toward upcoming totals.`, { tone: 'info' });
    onDone();
  };

  const frequencies: Frequency[] = isBill ? BILL_FREQUENCIES : INCOME_FREQUENCIES;
  const hint = pastDateHint(kind, form.startDate, today);

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      {existing?.paused && <p className="notice notice--info">This {isBill ? 'bill' : 'income'} is paused. It doesn’t appear in upcoming totals.</p>}
      <Field label="Name" error={errors.name}>
        <input
          className="input"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          maxLength={MAX_NAME + 10}
          placeholder={isBill ? 'e.g. Rent, Phone, Car insurance' : 'e.g. Paycheck'}
          data-autofocus
          data-rfield="name"
        />
      </Field>

      <div className="form__row form__row--split">
        <Field
          label={isBill ? 'Amount' : 'Usual amount'}
          error={errors.amount}
          hint={isBill ? 'If it changes, use your best estimate. You can adjust each payment.' : 'You’ll confirm the actual amount each payday.'}
        >
          <AmountInput value={form.amount} onChange={(v) => set('amount', v)} data-rfield="amount" />
        </Field>
        <Field label="Category" error={errors.categoryId}>
          <select className="input select" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} data-rfield="categoryId">
            {!form.categoryId && <option value="">Choose…</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="form__row form__row--split">
        <Field label="How often" error={errors.frequency}>
          <select className="input select" value={form.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)} data-rfield="frequency">
            {frequencies.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABELS[f]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={isBill ? (form.frequency === 'once' ? 'Due date' : 'Next due date') : form.frequency === 'once' ? 'Pay date' : 'Next payday'} error={errors.startDate} hint={hint}>
          <input type="date" className="input" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} data-rfield="startDate" />
        </Field>
      </div>

      {form.frequency === 'semimonthly' && (
        <Field label="Second day each month" error={errors.secondDay} hint="Pick “Last day” for the end of every month.">
          <select className="input select" value={form.secondDay} onChange={(e) => set('secondDay', e.target.value)} data-rfield="secondDay">
            <option value="">Choose…</option>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {ordinal(d)}
              </option>
            ))}
            <option value="31">Last day</option>
          </select>
        </Field>
      )}

      {preview && (
        <div className="schedule-preview" aria-live="polite">
          <CalendarDays size={16} aria-hidden="true" />
          <div>
            <p className="schedule-preview__rule">{preview.text}</p>
            <p className="schedule-preview__dates">
              {preview.next.length > 1 ? 'Next: ' : ''}
              {preview.next.map(formatWithWeekday).join(' · ')}
            </p>
          </div>
        </div>
      )}

      <Field label="Note" optional error={errors.note}>
        <textarea className="input textarea" rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} maxLength={MAX_NOTE + 50} data-rfield="note" />
      </Field>

      <div className="form__actions">
        {existing && (
          <div className="form__actions-start">
            <button type="button" className="btn btn--ghost btn--danger-text" onClick={remove}>
              <Trash size={16} aria-hidden="true" /> Delete
            </button>
            <button type="button" className="btn btn--ghost" onClick={togglePause}>
              {existing.paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
              {existing.paused ? 'Resume' : 'Pause'}
            </button>
          </div>
        )}
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          {existing ? 'Save changes' : isBill ? 'Add bill' : 'Add income'}
        </button>
      </div>
    </form>
  );
}
