import { CircleCheck, History, Link2, Trash } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useActions } from '../../app/useActions';
import { useUi, type TransactionPrefill } from '../../app/ui';
import {
  categoriesByUse,
  linkCandidates,
  occurrenceKey,
  payeeSuggestions,
  recentQuickFills,
  suggestedLink,
  type Occurrence,
} from '../../lib/budget';
import { addDays, formatLong, formatWithWeekday, isValidISODate } from '../../lib/dates';
import { newId, nowStamp } from '../../lib/ids';
import { centsToInput, formatMoney } from '../../lib/money';
import { MAX_NOTE, MAX_PAYEE, validateTransaction, type FieldErrors, type TransactionField } from '../../lib/validation';
import { useStore } from '../../state/store';
import type { Transaction, TxType } from '../../state/types';
import { CategoryBadge } from '../../ui/CategoryBadge';
import { Segmented } from '../../ui/Controls';
import { Dialog } from '../../ui/Dialog';
import { AmountInput, Field, FieldGroup } from '../../ui/Field';
import { useToast } from '../../ui/Toast';

interface FormState {
  type: TxType;
  amount: string;
  categoryId: string;
  date: string;
  payee: string;
  note: string;
  linkKey: string;
}

function initialState(existing: Transaction | undefined, prefill: TransactionPrefill | undefined, today: string): FormState {
  if (existing) {
    return {
      type: existing.type,
      amount: centsToInput(existing.amount),
      categoryId: existing.categoryId,
      date: existing.date,
      payee: existing.payee ?? '',
      note: existing.note ?? '',
      linkKey: existing.link ? occurrenceKey(existing.link.recurringId, existing.link.date) : '',
    };
  }
  return {
    type: prefill?.type ?? 'expense',
    amount: prefill?.amount ? centsToInput(prefill.amount) : '',
    categoryId: prefill?.categoryId ?? '',
    date: prefill?.date ?? today,
    payee: prefill?.payee ?? '',
    note: '',
    linkKey: '',
  };
}

export function TransactionDialog() {
  const { dialog, closeDialog } = useUi();
  const open = dialog.kind === 'transaction';
  const editingId = open && dialog.mode === 'edit' ? dialog.id : undefined;
  const prefill = open && dialog.mode === 'add' ? dialog.prefill : undefined;
  const { data } = useStore();
  const existing = editingId ? data.transactions.find((t) => t.id === editingId) : undefined;

  return (
    <Dialog
      open={open && (!editingId || !!existing)}
      onClose={closeDialog}
      title={existing ? 'Edit transaction' : 'Add transaction'}
      size="md"
      className="tx-dialog"
    >
      {open && <TransactionForm key={editingId ?? 'new'} existing={existing} prefill={prefill} onDone={closeDialog} />}
    </Dialog>
  );
}

function TransactionForm({ existing, prefill, onDone }: { existing?: Transaction; prefill?: TransactionPrefill; onDone: () => void }) {
  const { data, dispatch, today } = useStore();
  const toast = useToast();
  const { deleteTransaction } = useActions();
  const [form, setForm] = useState<FormState>(() => initialState(existing, prefill, today));
  const [errors, setErrors] = useState<FieldErrors<TransactionField>>({});
  const [submitted, setSubmitted] = useState(false);
  const [linkTouched, setLinkTouched] = useState(!!existing);
  const [lastSaved, setLastSaved] = useState<Transaction | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(!!existing || !!prefill?.categoryId);
  const amountRef = useRef<HTMLInputElement>(null);
  const payeeListId = useId();
  const currency = data.settings.currency;

  const categories = useMemo(() => categoriesByUse(data, form.type, today), [data, form.type, today]);
  const quickFills = useMemo(() => (existing || prefill ? [] : recentQuickFills(data, 4)), [data, existing, prefill]);
  const payees = useMemo(() => payeeSuggestions(data, form.type), [data, form.type]);

  // Scheduled bills/paydays this entry could settle, so nothing gets counted twice.
  const candidates = useMemo<Occurrence[]>(() => {
    if (!isValidISODate(form.date)) return [];
    return linkCandidates(data, form.type, form.date, today, existing?.id);
  }, [data, form.type, form.date, today, existing?.id]);

  const currentLink = existing?.link;
  const linkOptions = useMemo(() => {
    const opts = candidates.map((o) => ({
      key: o.key,
      recurringId: o.item.id,
      date: o.date,
      categoryId: o.item.categoryId,
      label: optionLabel(o.item.name, o.date, o.amount),
    }));
    if (currentLink) {
      const key = occurrenceKey(currentLink.recurringId, currentLink.date);
      if (!opts.some((o) => o.key === key)) {
        const item = data.recurring.find((r) => r.id === currentLink.recurringId);
        if (item) {
          opts.unshift({
            key,
            recurringId: item.id,
            date: currentLink.date,
            categoryId: item.categoryId,
            label: optionLabel(item.name, currentLink.date, item.amount),
          });
        }
      }
    }
    return opts;
    function optionLabel(name: string, date: string, amount: number) {
      return `${name} · ${formatWithWeekday(date)} · ${formatMoney(amount, currency)}`;
    }
  }, [candidates, currentLink, data.recurring, currency]);

  // Pre-select the obvious match (same category, within three days) until the person chooses.
  useEffect(() => {
    if (linkTouched) return;
    const suggestion = isValidISODate(form.date) ? suggestedLink(candidates, form.categoryId, form.date) : null;
    const key = suggestion?.key ?? '';
    setForm((f) => (f.linkKey === key ? f : { ...f, linkKey: key }));
  }, [candidates, form.categoryId, form.date, linkTouched]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (submitted) setErrors(validateTransaction(next, data.categories, today).errors);
      return next;
    });
  };

  const switchType = (type: TxType) => {
    setForm((f) => {
      const cat = data.categories.find((c) => c.id === f.categoryId);
      return { ...f, type, categoryId: cat && cat.type === type ? f.categoryId : '', linkKey: '' };
    });
    setCategoryTouched(false);
    setLinkTouched(false);
    if (submitted) setErrors({});
  };

  const onPayeeChange = (payee: string) => {
    set('payee', payee);
    if (!categoryTouched) {
      const match = payees.find((p) => p.payee.toLowerCase() === payee.trim().toLowerCase());
      if (match) setForm((f) => ({ ...f, payee, categoryId: match.categoryId }));
    }
  };

  const applyQuickFill = (q: (typeof quickFills)[number]) => {
    setForm((f) => ({ ...f, type: q.type, amount: centsToInput(q.amount), categoryId: q.categoryId, payee: q.payee, linkKey: '' }));
    setCategoryTouched(true);
    setLinkTouched(false);
    requestAnimationFrame(() => amountRef.current?.select());
  };

  const submit = (addAnother: boolean) => {
    setSubmitted(true);
    const result = validateTransaction(form, data.categories, today);
    setErrors(result.errors);
    if (!result.value) {
      const first = (['amount', 'categoryId', 'date', 'payee', 'note'] as const).find((k) => result.errors[k]);
      if (first === 'amount') amountRef.current?.focus();
      else if (first) document.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return;
    }
    const link = linkOptions.find((o) => o.key === form.linkKey);
    const base = {
      ...result.value,
      ...(link ? { link: { recurringId: link.recurringId, date: link.date } } : {}),
    };
    const label = result.value.type === 'income' ? 'Income' : 'Expense';
    if (existing) {
      const updated: Transaction = {
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: nowStamp(),
        ...(existing.demo ? { demo: true } : {}),
        ...base,
      };
      dispatch({ type: 'tx/update', tx: updated });
      toast.show(`${label} updated`, { actions: [{ label: 'Undo', onClick: () => dispatch({ type: 'tx/update', tx: existing }) }] });
      onDone();
      return;
    }
    const tx: Transaction = { id: newId('tx'), createdAt: nowStamp(), ...base };
    dispatch({ type: 'tx/add', tx });
    if (addAnother) {
      // The dialog stays open (and blocks the page), so confirm inside it where Undo is reachable.
      setLastSaved(tx);
      setForm((f) => ({ ...f, amount: '', payee: '', note: '', categoryId: '', linkKey: '' }));
      setCategoryTouched(false);
      setLinkTouched(false);
      setSubmitted(false);
      setErrors({});
      requestAnimationFrame(() => amountRef.current?.focus());
    } else {
      toast.show(`${label} of ${formatMoney(tx.amount, currency)} saved`, {
        actions: [{ label: 'Undo', onClick: () => dispatch({ type: 'tx/delete', id: tx.id }) }],
      });
      onDone();
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    submit(submitter?.value === 'another');
  };

  const dateHint = (() => {
    if (!isValidISODate(form.date)) return undefined;
    if (form.date < data.settings.balanceAsOf) {
      return `Before your starting balance date (${formatLong(data.settings.balanceAsOf)}), so it counts in reports but doesn't change your balance.`;
    }
    if (form.date > today) {
      return form.type === 'expense'
        ? 'Future date: it’s held back from “left to spend” now and leaves your balance on that day.'
        : 'Future date: it will be added to your balance on that day.';
    }
    return undefined;
  })();

  const selectedLink = linkOptions.find((o) => o.key === form.linkKey);
  // Only offer bills/paydays in the chosen category (plus whatever is already linked) to keep the form short.
  const visibleLinks = linkOptions.filter((o) => o.categoryId === form.categoryId || o.key === form.linkKey);

  const lastSavedCategory = lastSaved ? data.categories.find((c) => c.id === lastSaved.categoryId) : undefined;

  return (
    <form className="form tx-form" onSubmit={onSubmit} noValidate>
      {lastSaved && (
        <p className="inline-saved" role="status">
          <CircleCheck size={16} aria-hidden="true" />
          <span>
            Saved {formatMoney(lastSaved.amount, currency)}
            {lastSavedCategory ? ` · ${lastSavedCategory.name}` : ''}
            {lastSaved.payee ? ` · ${lastSaved.payee}` : ''}
          </span>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              dispatch({ type: 'tx/delete', id: lastSaved.id });
              setLastSaved(null);
            }}
          >
            Undo
          </button>
        </p>
      )}
      <Segmented
        label="Transaction type"
        value={form.type}
        onChange={switchType}
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />

      {quickFills.length > 0 && (
        <div className="quick-fills" role="group" aria-label="Repeat a recent entry">
          <span className="quick-fills__label">
            <History size={14} aria-hidden="true" /> Recent
          </span>
          {quickFills.map((q) => {
            const cat = data.categories.find((c) => c.id === q.categoryId);
            return (
              <button
                key={`${q.type}|${q.payee}|${q.categoryId}`}
                type="button"
                className="chip chip--quick"
                onClick={() => applyQuickFill(q)}
                aria-label={`Fill in ${q.payee}, ${formatMoney(q.amount, currency)}, ${cat?.name ?? ''}`}
              >
                <CategoryBadge category={cat} size="sm" />
                <span className="chip__text">{q.payee}</span>
                <span className="chip__meta">{formatMoney(q.amount, currency)}</span>
              </button>
            );
          })}
        </div>
      )}

      <Field label="Amount" error={errors.amount}>
        <AmountInput ref={amountRef} value={form.amount} onChange={(v) => set('amount', v)} large data-autofocus data-field="amount" />
      </Field>

      <FieldGroup legend="Category" error={errors.categoryId} className="category-picker">
        <div className="chip-grid">
          {categories.map((c, i) => (
            <label key={c.id} className="chip chip--choice" data-color={c.color}>
              <input
                type="radio"
                name="category"
                value={c.id}
                checked={form.categoryId === c.id}
                onChange={() => {
                  setCategoryTouched(true);
                  set('categoryId', c.id);
                }}
                onKeyDown={(e) => {
                  // Enter on a category saves: type amount, Tab, pick with arrows, Enter.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                data-field={i === 0 ? 'categoryId' : undefined}
              />
              <CategoryBadge category={c} size="sm" />
              <span className="chip__text">{c.name}</span>
            </label>
          ))}
        </div>
      </FieldGroup>

      <div className="form__row">
        <Field label="Date" error={errors.date} hint={dateHint} className="form__grow">
          <input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} data-field="date" />
        </Field>
        <div className="date-shortcuts" role="group" aria-label="Date shortcuts">
          <button type="button" className={`chip ${form.date === today ? 'is-active' : ''}`} onClick={() => set('date', today)} aria-pressed={form.date === today}>
            Today
          </button>
          <button
            type="button"
            className={`chip ${form.date === addDays(today, -1) ? 'is-active' : ''}`}
            onClick={() => set('date', addDays(today, -1))}
            aria-pressed={form.date === addDays(today, -1)}
          >
            Yesterday
          </button>
        </div>
      </div>

      <Field label={form.type === 'income' ? 'From' : 'Merchant or payee'} optional error={errors.payee}>
        <input
          type="text"
          className="input"
          value={form.payee}
          onChange={(e) => onPayeeChange(e.target.value)}
          list={payeeListId}
          maxLength={MAX_PAYEE + 20}
          autoComplete="off"
          placeholder={form.type === 'income' ? 'e.g. Employer' : 'e.g. Corner Market'}
          data-field="payee"
        />
      </Field>
      <datalist id={payeeListId}>
        {payees.slice(0, 50).map((p) => (
          <option key={p.payee} value={p.payee} />
        ))}
      </datalist>

      <Field label="Note" optional error={errors.note}>
        <textarea className="input textarea" rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} maxLength={MAX_NOTE + 50} data-field="note" />
      </Field>

      {visibleLinks.length > 0 && (
        <Field
          label={
            <>
              <Link2 size={14} aria-hidden="true" />
              {form.type === 'income' ? 'Is this an expected payday?' : 'Does this pay a bill?'}
            </>
          }
          hint={
            selectedLink
              ? form.type === 'income'
                ? 'That payday will show as received, so it isn’t counted twice.'
                : 'That bill will show as paid, so it isn’t counted twice.'
              : 'Link it if this is a scheduled payment, so it isn’t counted twice.'
          }
        >
          <select
            className="input select"
            value={form.linkKey}
            onChange={(e) => {
              setLinkTouched(true);
              set('linkKey', e.target.value);
            }}
          >
            <option value="">{form.type === 'income' ? 'No, it’s extra income' : 'No, it’s not a bill'}</option>
            {visibleLinks.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="form__actions">
        {existing && (
          <button
            type="button"
            className="btn btn--ghost btn--danger-text form__actions-start"
            onClick={() => {
              deleteTransaction(existing);
              onDone();
            }}
          >
            <Trash size={16} aria-hidden="true" /> Delete
          </button>
        )}
        {!existing && (
          <button type="submit" value="another" className="btn btn--ghost">
            Save &amp; add another
          </button>
        )}
        <button type="submit" value="save" className="btn btn--primary">
          {existing ? 'Save changes' : 'Save'}
        </button>
      </div>
    </form>
  );
}
