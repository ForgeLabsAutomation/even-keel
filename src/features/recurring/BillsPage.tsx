import { Pause, Pencil, PiggyBank, Play, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { useUi } from '../../app/ui';
import { linkIndex, monthPeriod, nextOpenOccurrence, occurrencesInRange, setAsideFor, summarizePeriod } from '../../lib/budget';
import { addDays, formatWithWeekday, relativeDay } from '../../lib/dates';
import { describeSchedule, monthlyEquivalent } from '../../lib/recurrence';
import { useStore } from '../../state/store';
import type { RecurringItem } from '../../state/types';
import { CategoryBadge } from '../../ui/CategoryBadge';
import { Badge, Card, EmptyState } from '../../ui/Controls';
import { Money, useMoney } from '../../ui/Money';
import { useToast } from '../../ui/Toast';
import { OccurrenceRow } from './OccurrenceRow';

export function BillsPage() {
  const { data, today } = useStore();
  const { openDialog } = useUi();
  const bills = useMemo(() => data.recurring.filter((r) => r.kind === 'bill'), [data.recurring]);
  const month = useMemo(() => monthPeriod(today), [today]);
  const summary = useMemo(() => summarizePeriod(data, month, today), [data, month, today]);

  const { overdue, upcoming, recent } = useMemo(() => {
    const index = linkIndex(data.transactions);
    const all = occurrencesInRange(data, { kind: 'bill', from: addDays(today, -60), to: addDays(today, 30), today }, index);
    return {
      overdue: all.filter((o) => o.status === 'open' && o.overdue),
      upcoming: all.filter((o) => o.date >= today && o.status !== 'skipped'),
      recent: all.filter((o) => o.date < today && o.date >= addDays(today, -21) && o.status !== 'open').reverse(),
    };
  }, [data, today]);

  const monthlyTotal = bills.filter((b) => !b.paused).reduce((s, b) => s + monthlyEquivalent(b.amount, b.frequency), 0);
  const add = () => openDialog({ kind: 'recurring', itemKind: 'bill' });

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Bills</h1>
          <p className="page__subtitle">Tick a bill when you pay it. Its schedule stays as it is.</p>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--primary" onClick={add}>
            <Plus size={16} aria-hidden="true" /> Add bill
          </button>
        </div>
      </header>

      {bills.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No bills yet"
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={add}>
                <Plus size={16} aria-hidden="true" /> Add your first bill
              </button>
            }
          >
            Add the things you pay regularly: rent, phone, insurance, subscriptions. They’ll show up before they’re due, and you can tick them off as you pay.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="summary-strip card">
            <div className="stat">
              <p className="stat__label">Due this month</p>
              <p className="stat__value">
                <Money cents={summary.billsTotal} />
              </p>
            </div>
            <div className="stat">
              <p className="stat__label">Paid</p>
              <p className="stat__value">
                <Money cents={summary.billsPaid} />
              </p>
            </div>
            <div className="stat">
              <p className="stat__label">Still to pay</p>
              <p className="stat__value">
                <Money cents={summary.billsUnpaid} />
              </p>
              <p className="stat__note">
                {summary.billsUnpaidCount} bill{summary.billsUnpaidCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className="stat">
              <p className="stat__label">Monthly average</p>
              <p className="stat__value">
                <Money cents={monthlyTotal} />
              </p>
              <p className="stat__note">All active bills</p>
            </div>
          </div>

          {overdue.length > 0 && (
            <Card id="overdue" title="Overdue" className="card--attention">
              <p className="fineprint card__intro">Mark these paid if you’ve paid them, or skip any that won’t happen.</p>
              <ul className="occ-list">
                {overdue.map((o) => (
                  <OccurrenceRow key={o.key} occurrence={o} />
                ))}
              </ul>
            </Card>
          )}

          <Card id="coming" title="Coming up · next 30 days">
            {upcoming.length > 0 ? (
              <ul className="occ-list">
                {upcoming.map((o) => (
                  <OccurrenceRow key={o.key} occurrence={o} />
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing due in the next 30 days" />
            )}
          </Card>

          <Card id="all-bills" title={`All bills (${bills.length})`}>
            <ul className="item-list">
              {bills.map((b) => (
                <BillItem key={b.id} bill={b} />
              ))}
            </ul>
          </Card>

          {recent.length > 0 && (
            <Card id="recent-bills" title="Recently paid or skipped">
              <ul className="occ-list">
                {recent.map((o) => (
                  <OccurrenceRow key={o.key} occurrence={o} />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function BillItem({ bill }: { bill: RecurringItem }) {
  const { data, dispatch, today } = useStore();
  const { openDialog } = useUi();
  const toast = useToast();
  const fmt = useMoney();
  const category = data.categories.find((c) => c.id === bill.categoryId);
  const next = nextOpenOccurrence(data, bill, addDays(today, -60));
  const setAside = setAsideFor(data, bill, today);
  return (
    <li className={`item ${bill.paused ? 'item--paused' : ''}`}>
      <CategoryBadge category={category} size="lg" />
      <div className="item__main">
        <p className="item__title">
          {bill.name}
          {bill.paused && <Badge tone="neutral" icon={<Pause size={12} aria-hidden="true" />}>Paused</Badge>}
          {bill.demo && <Badge tone="demo">Demo</Badge>}
        </p>
        <p className="item__meta">
          {describeSchedule(bill)} · {category?.name}
        </p>
        <p className="item__meta">
          {bill.paused
            ? 'Not counted in upcoming totals while paused.'
            : next
              ? `Next: ${formatWithWeekday(next)} (${relativeDay(next, today).toLowerCase()})`
              : 'No more due dates.'}
        </p>
        {setAside && (
          <p className="item__hint">
            <PiggyBank size={14} aria-hidden="true" />
            Set aside about {fmt(setAside.amount)} each {setAside.per} so this is covered when it’s due.
          </p>
        )}
        {bill.note && <p className="item__note">{bill.note}</p>}
      </div>
      <div className="item__side">
        <Money cents={bill.amount} className="item__amount" />
        {bill.frequency !== 'monthly' && bill.frequency !== 'once' && (
          <span className="item__per">≈ {fmt(monthlyEquivalent(bill.amount, bill.frequency))}/mo</span>
        )}
        <div className="item__buttons">
          <button
            type="button"
            className="icon-btn"
            aria-label={bill.paused ? `Resume ${bill.name}` : `Pause ${bill.name}`}
            title={bill.paused ? 'Resume' : 'Pause'}
            onClick={() => {
              dispatch({ type: 'recurring/setPaused', id: bill.id, paused: !bill.paused, today });
              toast.show(bill.paused ? `${bill.name} resumed` : `${bill.name} paused`, { tone: 'info' });
            }}
          >
            {bill.paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Edit ${bill.name}`}
            title="Edit"
            onClick={() => openDialog({ kind: 'recurring', itemKind: 'bill', id: bill.id })}
          >
            <Pencil size={16} />
          </button>
        </div>
      </div>
    </li>
  );
}
