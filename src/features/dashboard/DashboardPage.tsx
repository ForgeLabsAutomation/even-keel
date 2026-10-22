import { ArrowRight, ChevronLeft, ChevronRight, CircleAlert, Info, Plus, Receipt, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useUi } from '../../app/ui';
import {
  byNewest,
  categoryRows,
  linkIndex,
  paydayOutlook,
  periodFor,
  primaryIncome,
  projectedBalanceAt,
  summarizePeriod,
  upcomingBills,
  type Period,
} from '../../lib/budget';
import { addDays, formatLong, formatShort, formatWithWeekday, relativeDay } from '../../lib/dates';
import { useStore } from '../../state/store';
import type { PeriodMode } from '../../state/types';
import { CategoryBadge } from '../../ui/CategoryBadge';
import { Card, EmptyState, Meter, Segmented, StatusNote, meterStatus } from '../../ui/Controls';
import { Money, useMoney } from '../../ui/Money';
import { OccurrenceRow } from '../recurring/OccurrenceRow';
import { TransactionRow } from '../transactions/TransactionList';
import { Welcome } from './Welcome';

export function DashboardPage() {
  const { data, today } = useStore();
  const hasPayPeriods = primaryIncome(data) !== null;
  const [mode, setMode] = useState<PeriodMode>(data.settings.defaultView);
  const [offset, setOffset] = useState(0);
  const effectiveMode: PeriodMode = mode === 'payperiod' && !hasPayPeriods ? 'month' : mode;
  const period = useMemo(() => periodFor(data, effectiveMode, today, offset), [data, effectiveMode, today, offset]);

  return (
    <div className="page dashboard">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">{formatWithWeekday(today)}</p>
          <h1 className="page__title">Overview</h1>
        </div>
      </header>

      {!data.meta.setupDone && <Welcome />}
      <Attention />

      <div className="dash-grid">
        <PaydayCard />
        <BalanceCard />

        <section className="card dash-period" aria-labelledby="period-title">
          <div className="period-bar">
            <h2 id="period-title" className="sr-only">
              Period summary
            </h2>
            <Segmented
              label="Show totals for"
              value={effectiveMode}
              onChange={(m) => {
                setMode(m);
                setOffset(0);
              }}
              size="sm"
              options={[
                {
                  value: 'payperiod',
                  label: 'Pay period',
                  disabled: !hasPayPeriods,
                  title: hasPayPeriods ? undefined : 'Add a repeating paycheck to see pay periods',
                },
                { value: 'month', label: 'Month' },
              ]}
            />
            <PeriodNav period={period} onChange={setOffset} />
          </div>
          {!hasPayPeriods && mode === 'payperiod' && (
            <p className="fineprint">Add a repeating paycheck on the Income page to see totals between paydays.</p>
          )}
          <PeriodStats period={period} />
        </section>

        <UpcomingBillsCard />
        <CategoriesCard period={period} />
        <RecentCard />
      </div>
    </div>
  );
}

function PeriodNav({ period, onChange }: { period: Period; onChange: (offset: number) => void }) {
  const unit = period.mode === 'month' ? 'month' : 'pay period';
  return (
    <div className="period-nav">
      <button type="button" className="icon-btn" onClick={() => onChange(period.offset - 1)} aria-label={`Previous ${unit}`}>
        <ChevronLeft size={18} />
      </button>
      <p className="period-nav__label" aria-live="polite">
        {period.label}
        {period.offset === 0 && <span className="period-nav__now">{period.mode === 'month' ? 'This month' : 'This pay period'}</span>}
      </p>
      <button type="button" className="icon-btn" onClick={() => onChange(period.offset + 1)} aria-label={`Next ${unit}`}>
        <ChevronRight size={18} />
      </button>
      {period.offset !== 0 && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => onChange(0)}>
          Back to now
        </button>
      )}
    </div>
  );
}

function PaydayCard() {
  const { data, today } = useStore();
  const { openDialog, navigate } = useUi();
  const fmt = useMoney();
  const o = useMemo(() => paydayOutlook(data, today), [data, today]);
  const short = o.left < 0;
  const label = o.payday ? 'Left to spend until payday' : 'Left to spend · next 30 days';

  let sub: string;
  if (o.payday && o.daysUntil === 0) sub = 'Payday is today. Record your pay when it arrives.';
  else if (short) sub = `You’re ${fmt(-o.left)} short for bills ${o.payday ? 'before payday' : 'in the next 30 days'}.`;
  else if (o.payday)
    sub = `About ${fmt(o.perDay)} a day for ${o.daysUntil} day${o.daysUntil === 1 ? '' : 's'}, until ${formatWithWeekday(o.payday.date)}`;
  else sub = `About ${fmt(o.perDay)} a day. Add your paycheck to plan to payday.`;

  return (
    <section className={`card hero ${short ? 'hero--short' : ''}`} aria-labelledby="hero-label">
      <p id="hero-label" className="hero__label">
        {label}
      </p>
      <p className="hero__value" data-testid="left-to-spend">
        <Money cents={o.left} />
      </p>
      <p className="hero__sub">{sub}</p>

      <dl className="breakdown">
        <div>
          <dt>Estimated balance</dt>
          <dd>
            <Money cents={o.balance} />
          </dd>
        </div>
        <div>
          <dt>
            Unpaid bills {o.payday ? 'before payday' : 'in 30 days'}
            {o.bills.length > 0 && <span className="breakdown__count"> ({o.bills.length})</span>}
          </dt>
          <dd>
            <Money cents={-o.billsTotal} />
          </dd>
        </div>
        {o.scheduled > 0 && (
          <div>
            <dt>Future-dated spending</dt>
            <dd>
              <Money cents={-o.scheduled} />
            </dd>
          </div>
        )}
        {o.heldForLater > 0 && o.lowPoint && (
          <div>
            <dt>
              Held back for {o.lowPoint.bills.map((b) => b.item.name).join(', ') || 'later bills'} on {formatShort(o.lowPoint.date)}
              <span className="breakdown__why">
                {o.plannedPerDay > 0
                  ? 'So it’s still covered after your paychecks come in and your planned everyday spending goes out.'
                  : 'Your paychecks before then won’t fully cover it.'}
              </span>
            </dt>
            <dd>
              <Money cents={-o.heldForLater} />
            </dd>
          </div>
        )}
        <div className="breakdown__total">
          <dt>Left to spend</dt>
          <dd>
            <Money cents={o.left} />
          </dd>
        </div>
      </dl>
      <p className="fineprint">
        <Info size={13} aria-hidden="true" /> An estimate from what you’ve entered. It isn’t connected to your bank.
      </p>
      {!o.payday && (
        <button type="button" className="btn btn--soft btn--sm" onClick={() => openDialog({ kind: 'recurring', itemKind: 'income' })}>
          <Plus size={16} aria-hidden="true" /> Add your paycheck
        </button>
      )}
      {o.payday && o.daysUntil === 0 && (
        <button type="button" className="btn btn--soft btn--sm" onClick={() => navigate('income')}>
          Record pay <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

function BalanceCard() {
  const { data, today } = useStore();
  const { openDialog, navigate } = useUi();
  const o = useMemo(() => paydayOutlook(data, today), [data, today]);
  const { openingBalance, balanceAsOf } = data.settings;
  return (
    <section className="card balance-card" aria-labelledby="balance-title">
      <div className="balance-card__top">
        <div>
          <h2 id="balance-title" className="stat__label">
            Estimated balance
          </h2>
          <p className="stat__value stat__value--lg" data-testid="balance">
            <Money cents={o.balance} />
          </p>
          <p className="fineprint">
            Starting balance <Money cents={openingBalance} /> on {formatLong(balanceAsOf)}, plus everything recorded since.
          </p>
        </div>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => openDialog({ kind: 'balance' })}>
          <Wallet size={16} aria-hidden="true" /> Update balance
        </button>
      </div>
      <div className="balance-card__payday">
        <h3 className="stat__label">Next payday</h3>
        {o.payday ? (
          <>
            <p className="balance-card__date">
              {formatWithWeekday(o.payday.date)} <span className="muted">· {relativeDay(o.payday.date, today).toLowerCase()}</span>
            </p>
            <p className="fineprint">
              {o.payday.items.map((i) => i.item.name).join(' + ')} · <Money cents={o.payday.total} /> expected
            </p>
          </>
        ) : (
          <p className="fineprint">
            No paycheck set up yet.{' '}
            <button type="button" className="link-btn" onClick={() => navigate('income')}>
              Add income
            </button>
          </p>
        )}
      </div>
    </section>
  );
}

function PeriodStats({ period }: { period: Period }) {
  const { data, today } = useStore();
  const s = useMemo(() => summarizePeriod(data, period, today), [data, period, today]);
  const projected = useMemo(() => projectedBalanceAt(data, period.end, today), [data, period.end, today]);
  const isPast = period.end < today;
  return (
    <>
      <div className="stats">
        <div className="stat">
          <p className="stat__label">Income received</p>
          <p className="stat__value" data-testid="stat-received">
            <Money cents={s.incomeReceived} />
          </p>
          <p className="stat__note">Actually recorded</p>
        </div>
        <div className="stat">
          <p className="stat__label">Still expected</p>
          <p className="stat__value stat__value--forecast" data-testid="stat-expected">
            <Money cents={s.incomeExpected} />
          </p>
          <p className="stat__note">
            {s.incomeUnrecorded.length > 0
              ? `${s.incomeUnrecorded.length} payday${s.incomeUnrecorded.length === 1 ? '' : 's'} not recorded`
              : isPast
                ? 'Period is over'
                : 'Forecast, not yet in hand'}
          </p>
        </div>
        <div className="stat">
          <p className="stat__label">Spent</p>
          <p className="stat__value" data-testid="stat-spent">
            <Money cents={s.spent} />
          </p>
          <p className="stat__note">Including bills paid</p>
        </div>
        <div className="stat">
          <p className="stat__label">Bills</p>
          <p className="stat__value" data-testid="stat-bills">
            <Money cents={s.billsTotal} />
          </p>
          <p className="stat__note">
            {s.billsTotal === 0 ? 'None due' : s.billsUnpaid === 0 ? 'All paid' : <><Money cents={s.billsUnpaid} /> left to pay</>}
          </p>
        </div>
      </div>
      <p className="period-foot">
        {projected !== null ? (
          <>
            Projected balance on {formatShort(period.end)}: <strong><Money cents={projected} /></strong>
            <span className="muted"> · counts expected pay and unpaid bills, not everyday spending still to come</span>
          </>
        ) : (
          <>
            Money in minus money out: <strong><Money cents={s.net} signed /></strong>
          </>
        )}
      </p>
    </>
  );
}

function Attention() {
  const { data, today } = useStore();
  const { navigate, openDialog } = useUi();
  const items = useMemo(() => {
    const index = linkIndex(data.transactions);
    const overdue = upcomingBills(data, today, 0, index).filter((o) => o.overdue);
    const unrecorded = summarizePeriod(data, { start: addDays(today, -14), end: addDays(today, -1) }, today).incomeUnrecorded;
    return { overdue, unrecorded };
  }, [data, today]);

  if (items.overdue.length === 0 && items.unrecorded.length === 0) return null;
  return (
    <ul className="attention" aria-label="Needs attention">
      {items.overdue.length > 0 && (
        <li className="attention__item attention__item--bad">
          <CircleAlert size={18} aria-hidden="true" />
          <span>
            {items.overdue.length === 1
              ? `${items.overdue[0].item.name} was due ${formatShort(items.overdue[0].date)} and isn’t marked paid.`
              : `${items.overdue.length} bills are past due and not marked paid.`}
          </span>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => navigate('bills')}>
            Review
          </button>
        </li>
      )}
      {items.unrecorded.slice(0, 2).map((o) => (
        <li key={o.key} className="attention__item attention__item--warn">
          <Receipt size={18} aria-hidden="true" />
          <span>
            Did your {o.item.name} arrive on {formatWithWeekday(o.date)}?
          </span>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => openDialog({ kind: 'settle', recurringId: o.item.id, date: o.date })}>
            Record it
          </button>
        </li>
      ))}
    </ul>
  );
}

function UpcomingBillsCard() {
  const { data, today } = useStore();
  const { navigate, openDialog } = useUi();
  const list = useMemo(() => upcomingBills(data, today, 14).slice(0, 6), [data, today]);
  const hasBills = data.recurring.some((r) => r.kind === 'bill');
  return (
    <Card
      id="upcoming"
      className="dash-bills"
      title="Upcoming bills"
      action={
        hasBills && (
          <button type="button" className="link-btn" onClick={() => navigate('bills')}>
            All bills <ArrowRight size={14} aria-hidden="true" />
          </button>
        )
      }
    >
      {list.length > 0 ? (
        <ul className="occ-list">
          {list.map((o) => (
            <OccurrenceRow key={o.key} occurrence={o} />
          ))}
        </ul>
      ) : hasBills ? (
        <EmptyState title="Nothing due in the next two weeks" />
      ) : (
        <EmptyState
          title="No bills yet"
          action={
            <button type="button" className="btn btn--soft btn--sm" onClick={() => openDialog({ kind: 'recurring', itemKind: 'bill' })}>
              <Plus size={16} aria-hidden="true" /> Add a bill
            </button>
          }
        >
          Add rent, phone, subscriptions and other regular bills to see what’s coming.
        </EmptyState>
      )}
    </Card>
  );
}

function CategoriesCard({ period }: { period: Period }) {
  const { data, today } = useStore();
  const { navigate } = useUi();
  const fmt = useMoney();
  const rows = useMemo(() => categoryRows(data, period, today).filter((r) => r.planned > 0 || r.spent > 0), [data, period, today]);
  const anyPlanned = data.categories.some((c) => c.type === 'expense' && c.planned > 0);
  return (
    <Card
      id="cats"
      className="dash-cats"
      title={period.mode === 'month' ? 'Spending vs. plan' : 'Spending vs. plan this pay period'}
      action={
        <button type="button" className="link-btn" onClick={() => navigate('budget')}>
          {anyPlanned ? 'Budget' : 'Set limits'} <ArrowRight size={14} aria-hidden="true" />
        </button>
      }
    >
      {period.mode === 'payperiod' && anyPlanned && (
        <p className="fineprint card__intro">Plans here are your monthly limits scaled to this pay period, plus any bills due in it.</p>
      )}
      {rows.length === 0 ? (
        <EmptyState title={anyPlanned ? 'No spending yet in this period' : 'No spending limits yet'}>
          {anyPlanned ? 'Your categories will fill in as you add expenses.' : 'Set a monthly limit for a few categories to compare what you planned with what you spent.'}
        </EmptyState>
      ) : (
        <ul className="cat-progress">
          {rows.map((r) => {
            const status = meterStatus(r.spent, r.planned);
            return (
              <li key={r.category.id} className="cat-progress__row">
                <div className="cat-progress__head">
                  <span className="cat-progress__name">
                    <CategoryBadge category={r.category} size="sm" />
                    {r.category.name}
                  </span>
                  <span className="cat-progress__nums">
                    <Money cents={r.spent} />
                    <span className="muted"> of {r.planned > 0 ? fmt(r.planned) : 'no limit'}</span>
                  </span>
                </div>
                <Meter spent={r.spent} planned={r.planned} label={`${r.category.name}: ${fmt(r.spent)} spent of ${fmt(r.planned)} planned`} />
                <StatusNote status={status}>
                  {r.planned === 0 ? 'No limit set' : r.remaining >= 0 ? `${fmt(r.remaining)} left` : `${fmt(-r.remaining)} over`}
                </StatusNote>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RecentCard() {
  const { data } = useStore();
  const { navigate, addTransaction } = useUi();
  const recent = useMemo(() => [...data.transactions].sort(byNewest).slice(0, 6), [data.transactions]);
  return (
    <Card
      id="recent"
      className="dash-recent"
      title="Recent activity"
      action={
        recent.length > 0 && (
          <button type="button" className="link-btn" onClick={() => navigate('activity')}>
            All activity <ArrowRight size={14} aria-hidden="true" />
          </button>
        )
      }
    >
      {recent.length > 0 ? (
        <ul className="tx-list">
          {recent.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Nothing recorded yet"
          action={
            <button type="button" className="btn btn--soft btn--sm" onClick={() => addTransaction()}>
              <Plus size={16} aria-hidden="true" /> Add a transaction
            </button>
          }
        >
          Expenses and income you add will show up here.
        </EmptyState>
      )}
    </Card>
  );
}
