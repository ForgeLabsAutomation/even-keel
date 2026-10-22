import { Trash } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useUi } from '../../app/ui';
import { newId } from '../../lib/ids';
import { centsToInput, parseAmount } from '../../lib/money';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../../state/defaults';
import { useStore } from '../../state/store';
import type { Category, CategoryColor, CategoryIcon, TxType } from '../../state/types';
import { ICONS } from '../../ui/CategoryBadge';
import { Dialog } from '../../ui/Dialog';
import { AmountInput, Field, FieldGroup } from '../../ui/Field';
import { useToast } from '../../ui/Toast';

export function CategoryDialog() {
  const { dialog, closeDialog } = useUi();
  const { data } = useStore();
  const open = dialog.kind === 'category';
  const existing = open && dialog.id ? data.categories.find((c) => c.id === dialog.id) : undefined;
  const type: TxType = existing?.type ?? (open && dialog.type ? dialog.type : 'expense');
  return (
    <Dialog
      open={open && (!dialog.id || !!existing)}
      onClose={closeDialog}
      title={existing ? 'Edit category' : type === 'income' ? 'New income category' : 'New spending category'}
    >
      {open && <CategoryForm key={existing?.id ?? `new-${type}`} existing={existing} type={type} onDone={closeDialog} />}
    </Dialog>
  );
}

function CategoryForm({ existing, type, onDone }: { existing?: Category; type: TxType; onDone: () => void }) {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const usedColors = new Set(data.categories.map((c) => c.color));
  const [name, setName] = useState(existing?.name ?? '');
  const [color, setColor] = useState<CategoryColor>(existing?.color ?? CATEGORY_COLORS.find((c) => !usedColors.has(c.color))?.color ?? 'slate');
  const [icon, setIcon] = useState<CategoryIcon>(existing?.icon ?? (type === 'income' ? 'paycheck' : 'other'));
  const [planned, setPlanned] = useState(existing?.planned ? centsToInput(existing.planned) : '');
  const [errors, setErrors] = useState<{ name?: string; planned?: string }>({});
  const [deleting, setDeleting] = useState(false);

  const others = data.categories.filter((c) => c.type === type && c.id !== existing?.id);
  const [moveTo, setMoveTo] = useState(others.find((c) => /^other/i.test(c.name))?.id ?? others[0]?.id ?? '');
  const usage = existing
    ? {
        tx: data.transactions.filter((t) => t.categoryId === existing.id).length,
        rec: data.recurring.filter((r) => r.categoryId === existing.id).length,
      }
    : { tx: 0, rec: 0 };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const trimmed = name.trim();
    if (!trimmed) next.name = 'Give the category a name.';
    else if (trimmed.length > 40) next.name = 'Keep it under 40 characters.';
    else if (data.categories.some((c) => c.id !== existing?.id && c.type === type && c.name.toLowerCase() === trimmed.toLowerCase())) {
      next.name = 'You already have a category with that name.';
    }
    let plannedCents = 0;
    if (type === 'expense' && planned.trim()) {
      const p = parseAmount(planned, { allowZero: true });
      if (!p.ok) next.planned = p.error;
      else plannedCents = p.cents;
    }
    setErrors(next);
    if (next.name || next.planned) return;
    if (existing) {
      dispatch({ type: 'category/update', id: existing.id, patch: { name: trimmed, color, icon, planned: plannedCents } });
      toast.show(`${trimmed} updated`);
    } else {
      dispatch({ type: 'category/add', category: { id: newId('cat'), name: trimmed, type, color, icon, planned: plannedCents } });
      toast.show(`${trimmed} added`);
    }
    onDone();
  };

  const confirmDelete = () => {
    if (!existing || !moveTo) return;
    dispatch({ type: 'category/delete', id: existing.id, moveTo });
    const dest = data.categories.find((c) => c.id === moveTo);
    toast.show(usage.tx + usage.rec > 0 ? `${existing.name} deleted. Its items moved to ${dest?.name}.` : `${existing.name} deleted`, { tone: 'info' });
    onDone();
  };

  if (deleting && existing) {
    return (
      <div className="form">
        <p>
          Delete <strong>{existing.name}</strong>?
        </p>
        {usage.tx + usage.rec > 0 ? (
          <Field
            label={`Move its ${[usage.tx ? `${usage.tx} transaction${usage.tx === 1 ? '' : 's'}` : '', usage.rec ? `${usage.rec} bill${usage.rec === 1 ? '' : 's'} or income source${usage.rec === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')} to`}
          >
            <select className="input select" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="muted">Nothing uses this category yet.</p>
        )}
        <div className="form__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setDeleting(false)} autoFocus>
            Keep it
          </button>
          <button type="button" className="btn btn--danger" onClick={confirmDelete}>
            Delete category
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <Field label="Name" error={errors.name}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} data-autofocus placeholder="e.g. Pets" />
      </Field>
      {type === 'expense' && (
        <Field label="Monthly limit" optional error={errors.planned} hint="Leave empty to track spending without a limit.">
          <AmountInput value={planned} onChange={setPlanned} placeholder="No limit" />
        </Field>
      )}
      <FieldGroup legend="Color">
        <div className="swatch-picker">
          {CATEGORY_COLORS.map((c) => (
            <label key={c.color} className="swatch-picker__option" title={c.label}>
              <input type="radio" name="color" value={c.color} checked={color === c.color} onChange={() => setColor(c.color)} aria-label={c.label} />
              <span className="swatch swatch--lg" data-color={c.color} />
            </label>
          ))}
        </div>
      </FieldGroup>
      <FieldGroup legend="Icon">
        <div className="icon-picker">
          {CATEGORY_ICONS.map(({ icon: key, label }) => {
            const Icon = ICONS[key];
            return (
              <label key={key} className="icon-picker__option" title={label}>
                <input type="radio" name="icon" value={key} checked={icon === key} onChange={() => setIcon(key)} aria-label={label} />
                <span className="cat-badge cat-badge--md" data-color={color}>
                  <Icon size={16} aria-hidden="true" />
                </span>
              </label>
            );
          })}
        </div>
      </FieldGroup>
      <div className="form__actions">
        {existing && (
          <button
            type="button"
            className="btn btn--ghost btn--danger-text form__actions-start"
            onClick={() => setDeleting(true)}
            disabled={others.length === 0}
            title={others.length === 0 ? `You need at least one ${type === 'income' ? 'income' : 'spending'} category` : undefined}
          >
            <Trash size={16} aria-hidden="true" /> Delete
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          {existing ? 'Save changes' : 'Add category'}
        </button>
      </div>
    </form>
  );
}
