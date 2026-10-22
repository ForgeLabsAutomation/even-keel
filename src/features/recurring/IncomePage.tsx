import { Pause, Pencil, Play, Plus, Star } from 'lucide-react';
import { useMemo } from 'react';
import { useUi } from '../../app/ui';
import { linkIndex, monthPeriod, nextOpenOccurrence, occurrencesInRange, primaryIncome, summarizePeriod } from '../../lib/budget';
import { addDays, formatWithWeekday, isBetween, relativeDay } from '../../lib/dates';
import { describeSchedule } from '../../lib/recurrence';
import { useStore } from '../../state/store';
import type { RecurringItem } from '../../state/types';
import { CategoryBadge } from '../../ui/CategoryBadge';
import { Badge, Card, EmptyState } from '../../ui/Controls';
import { Money } from '../../ui/Money';
import { useToast } from '../../ui/Toast';
import { TransactionRow } from '../transactions/TransactionList';
import { OccurrenceRow } from './OccurrenceRow';

export function IncomePage() {
  const { data, today } = useStore();
  const { openDialog, addTransaction } = useUi();
  const sources = useMemo(() => data.recurring.filter((r) => r.kind === 'income'), [data.recurring]);
  const month = useMemo(() => monthPeriod(today), [today]);
  const summary = useMemo(() => summarizePeriod(data, month, today), [data, month, today]);
  const primary = primaryIncome(data);
  const recurringSources = sources.filter((s) => s.frequency !== 'once' && !s.paused);

  const paydays = useMemo(() => {
    const index = linkIndex(data.transactions);
    return occurrencesInRange(data, { kind: 'income', from: addDays(today, -21), to: addDays(today, 30), today }, index).filter(
      (o) => o.status !== 'skipped' || o.date >= today,
    );
  }, [data, today]);

  const otherIncome = useMemo(
    () => data.transactions.filter((t) => t.type === 'income' && !t.link && isBetween(t.date, month.start, month.end)),
    [data.transactions, month.start, month.end],
  );

  const add = () => openDialog({ kind: 'recurring', itemKind: 'income' });

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Income</h1>
          <p className="page__subtitle">Expected pay is a forecast. It becomes real money once you record it.</p>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--ghost" onClick={() => addTransaction({ type: 'income' })}>
            <Plus size={16} aria-hidden="true" /> Other income
          </button>
          <button type="button" className="btn btn--primary" onClick={add}>
            <Plus size={16} aria-hidden="true" /> Add income source
          </button>
        </div>
      </header>

      <div className="summary-strip card">
        <div className="stat">
          <p className="stat__label">Received this month</p>
          <p className="stat__value" data-testid="income-received">
            <Money cents={summary.incomeReceived} />
          </p>
          <p className="stat__note">Recorded</p>
        </div>
        <div className="stat">
          <p className="stat__label">Still expected</p>
          <p className="stat__value stat__value--forecast">
            <Money cents={summary.incomeExpected} />
          </p>
          <p className="stat__note">Forecast for the rest of the month</p>
        </div>
        {summary.incomeUnrecorded.length > 0 && (
          <div className="stat">
            <p className="stat__label">Not recorded yet</p>
            <p className="stat__value">{summary.incomeUnrecorded.length}</p>
            <p className="stat__note">Past paydays this month</p>
          </div>
        )}
      </div>

      {sources.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No income set up yet"
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={add}>
                <Plus size={16} aria-hidden="true" /> Add your paycheck
              </button>
            }
          >
            Add your paycheck (weekly, every two weeks, twice a month, or monthly) to see your next payday and how much you can spend until then.
          </EmptyState>
        </div>
      ) : (
        <>
          <Card id="paydays" title="Paydays">
            {paydays.length > 0 ? (
              <ul className="occ-list">
                {paydays.map((o) => (
                  <OccurrenceRow key={o.key} occurrence={o} showCategory={false} />
                ))}
              </ul>
            ) : (
              <EmptyState title="No paydays in the last 3 weeks or the next 30 days" />
            )}
          </Card>

          <Card id="sources" title="Income sources">
            {recurringSources.length > 1 && (
              <p className="fineprint card__intro">
                <Star size={13} aria-hidden="true" /> Pay periods on the Overview follow {primary?.name ?? 'your most frequent paycheck'}. Choose another below.
              </p>
            )}
            <ul className="item-list">
              {sources.map((s) => (
                <IncomeItem key={s.id} item={s} isPrimary={primary?.id === s.id && recurringSources.length > 1} canBePrimary={recurringSources.length > 1 && recurringSources.includes(s)} />
              ))}
            </ul>
          </Card>
        </>
      )}

      {otherIncome.length > 0 && (
        <Card id="other-income" title="Other income this month">
          <ul className="tx-list">
            {otherIncome.map((t) => (
              <TransactionRow key={t.id} tx={t} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function IncomeItem({ item, isPrimary, canBePrimary }: { item: RecurringItem; isPrimary: boolean; canBePrimary: boolean }) {
  const { data, dispatch, today } = useStore();
  const { openDialog } = useUi();
  const toast = useToast();
  const category = data.categories.find((c) => c.id === item.categoryId);
  const next = nextOpenOccurrence(data, item, today);
  return (
    <li className={`item ${item.paused ? 'item--paused' : ''}`}>
      <CategoryBadge category={category} size="lg" />
      <div className="item__main">
        <p className="item__title">
          {item.name}
          {isPrimary && <Badge tone="info" icon={<Star size={12} aria-hidden="true" />}>Sets pay periods</Badge>}
          {item.paused && <Badge tone="neutral" icon={<Pause size={12} aria-hidden="true" />}>Paused</Badge>}
          {item.demo && <Badge tone="demo">Demo</Badge>}
        </p>
        <p className="item__meta">
          {describeSchedule(item)} · {category?.name}
        </p>
        <p className="item__meta">
          {item.paused ? 'Not expected while paused.' : next ? `Next payday: ${formatWithWeekday(next)} (${relativeDay(next, today).toLowerCase()})` : 'No more paydays scheduled.'}
        </p>
        {item.note && <p className="item__note">{item.note}</p>}
        {canBePrimary && !isPrimary && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              dispatch({ type: 'settings/update', patch: { primaryIncomeId: item.id } });
              toast.show(`Pay periods now follow ${item.name}`, { tone: 'info' });
            }}
          >
            Use for pay periods
          </button>
        )}
      </div>
      <div className="item__side">
        <Money cents={item.amount} className="item__amount" />
        <span className="item__per">usual</span>
        <div className="item__buttons">
          <button
            type="button"
            className="icon-btn"
            aria-label={item.paused ? `Resume ${item.name}` : `Pause ${item.name}`}
            title={item.paused ? 'Resume' : 'Pause'}
            onClick={() => {
              dispatch({ type: 'recurring/setPaused', id: item.id, paused: !item.paused, today });
              toast.show(item.paused ? `${item.name} resumed` : `${item.name} paused`, { tone: 'info' });
            }}
          >
            {item.paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button type="button" className="icon-btn" aria-label={`Edit ${item.name}`} title="Edit" onClick={() => openDialog({ kind: 'recurring', itemKind: 'income', id: item.id })}>
            <Pencil size={16} />
          </button>
        </div>
      </div>
    </li>
  );
}
