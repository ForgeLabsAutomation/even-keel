import { Check, CircleAlert, Pencil, Receipt, SkipForward, Undo2 } from 'lucide-react';
import { useActions } from '../../app/useActions';
import { useUi } from '../../app/ui';
import type { Occurrence } from '../../lib/budget';
import { daysBetween, formatDayOfMonth, formatMonthShort, formatShort, formatWeekdayShort, formatWithWeekday, relativeDay } from '../../lib/dates';
import { useStore } from '../../state/store';
import { CategoryBadge } from '../../ui/CategoryBadge';
import { MenuButton, type MenuItem } from '../../ui/Menu';
import { Money } from '../../ui/Money';

function statusText(o: Occurrence, today: string): { text: string; tone: 'muted' | 'good' | 'warn' | 'bad' } {
  const isIncome = o.item.kind === 'income';
  if (o.status === 'skipped') return { text: 'Skipped', tone: 'muted' };
  if (o.status === 'settled') {
    const on = o.transaction ? formatShort(o.transaction.date) : '';
    return { text: isIncome ? `Received ${on}` : `Paid ${on}`, tone: 'good' };
  }
  const diff = daysBetween(today, o.date);
  if (isIncome) {
    if (diff < 0) return { text: `Not recorded yet · ${relativeDay(o.date, today).toLowerCase()}`, tone: 'warn' };
    if (diff === 0) return { text: 'Expected today', tone: 'muted' };
    return { text: `Expected ${relativeDay(o.date, today).toLowerCase()}`, tone: 'muted' };
  }
  if (diff < 0) return { text: `Overdue · was due ${relativeDay(o.date, today).toLowerCase()}`, tone: 'bad' };
  if (diff === 0) return { text: 'Due today', tone: 'warn' };
  if (diff === 1) return { text: 'Due tomorrow', tone: 'warn' };
  return { text: `Due ${relativeDay(o.date, today).toLowerCase()}`, tone: 'muted' };
}

export function OccurrenceRow({ occurrence: o, showCategory = true }: { occurrence: Occurrence; showCategory?: boolean }) {
  const { data, today } = useStore();
  const { openDialog, editTransaction } = useUi();
  const { settle, unsettle, setSkipped } = useActions();
  const category = data.categories.find((c) => c.id === o.item.categoryId);
  const status = statusText(o, today);
  const isIncome = o.item.kind === 'income';
  const label = `${o.item.name}, ${formatWithWeekday(o.date)}`;

  const menu: MenuItem[] = [];
  if (o.status === 'open') {
    menu.push({
      label: isIncome ? 'Record a different amount…' : 'Paid a different amount…',
      icon: Receipt,
      onSelect: () => openDialog({ kind: 'settle', recurringId: o.item.id, date: o.date }),
    });
    menu.push({ label: 'Skip this time', icon: SkipForward, onSelect: () => setSkipped(o, true) });
  }
  if (o.status === 'skipped') menu.push({ label: 'Don’t skip', icon: Undo2, onSelect: () => setSkipped(o, false) });
  if (o.status === 'settled' && o.transaction) {
    const txId = o.transaction.id;
    menu.push({ label: isIncome ? 'Edit received amount' : 'Edit payment', icon: Pencil, onSelect: () => editTransaction(txId) });
    menu.push({ label: isIncome ? 'Mark not received' : 'Mark unpaid', icon: Undo2, onSelect: () => unsettle(o) });
  }
  menu.push({ label: isIncome ? 'Edit income source' : 'Edit bill', icon: Pencil, onSelect: () => openDialog({ kind: 'recurring', itemKind: o.item.kind, id: o.item.id }) });

  return (
    <li className={`occ occ--${o.status} ${o.overdue ? 'occ--overdue' : ''}`}>
      <div className="occ__date" aria-hidden="true">
        <span className="occ__month">{formatMonthShort(o.date)}</span>
        <span className="occ__day">{formatDayOfMonth(o.date)}</span>
        <span className="occ__weekday">{formatWeekdayShort(o.date)}</span>
      </div>
      <div className="occ__main">
        <p className="occ__name">
          {showCategory && <CategoryBadge category={category} size="sm" />}
          <span>{o.item.name}</span>
        </p>
        <p className={`occ__status tone-${status.tone}`}>
          {status.tone === 'bad' && <CircleAlert size={13} aria-hidden="true" />}
          {status.tone === 'good' && <Check size={13} aria-hidden="true" />}
          <span className="sr-only">{formatWithWeekday(o.date)}: </span>
          {status.text}
        </p>
      </div>
      <div className="occ__amount">
        <Money cents={o.amount} tone={isIncome && o.status === 'settled' ? 'income' : undefined} className={o.status === 'open' ? 'money--scheduled' : ''} />
        {o.status === 'settled' && o.amount !== o.item.amount && <span className="occ__usual">usual {<Money cents={o.item.amount} />}</span>}
      </div>
      <div className="occ__actions">
        {isIncome ? (
          o.status === 'open' ? (
            <button
              type="button"
              className="btn btn--sm btn--soft"
              onClick={() => openDialog({ kind: 'settle', recurringId: o.item.id, date: o.date })}
              aria-label={`Record pay for ${label}`}
            >
              Record
            </button>
          ) : o.status === 'settled' ? (
            <span className="occ__done" aria-label="Received">
              <Check size={16} />
            </span>
          ) : null
        ) : o.status === 'skipped' ? null : (
          <label className="paid-toggle" title={o.status === 'settled' ? 'Paid. Click to mark unpaid.' : 'Mark paid'}>
            <input
              type="checkbox"
              checked={o.status === 'settled'}
              onChange={(e) => {
                if (!e.target.checked) unsettle(o);
                // Due before the starting balance: ask when it was paid, since that decides whether the balance changes.
                else if (o.date < data.settings.balanceAsOf) openDialog({ kind: 'settle', recurringId: o.item.id, date: o.date });
                else settle(o);
              }}
              aria-label={`${label}: paid`}
            />
            <span className="paid-toggle__box" aria-hidden="true">
              <Check size={14} strokeWidth={3} />
            </span>
            <span className="paid-toggle__text">Paid</span>
          </label>
        )}
        <MenuButton label={`More actions for ${label}`} items={menu} />
      </div>
    </li>
  );
}
