import { ChevronLeft, ChevronRight, Info, Pencil, Plus } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useUi } from '../../app/ui';
import { categoryRows, monthPeriod, monthPlan, monthlyTrend, spendingByCategory, topPayees, type CategoryRow } from '../../lib/budget';
import { centsToInput, parseAmount } from '../../lib/money';
import { useStore } from '../../state/store';
import { CategoryBadge } from '../../ui/CategoryBadge';
import { Card, EmptyState, Meter, StatusNote, meterStatus } from '../../ui/Controls';
import { AmountInput } from '../../ui/Field';
import { Money, useMoney } from '../../ui/Money';
import { useToast } from '../../ui/Toast';
import { TrendChart } from './TrendChart';

export function BudgetPage() {
  const { data, today } = useStore();
  const { openDialog } = useUi();
  const fmt = useMoney();
  const [offset, setOffset] = useState(0);
  const period = useMemo(() => monthPeriod(today, offset), [today, offset]);
  const plan = useMemo(() => monthPlan(data, period, today), [data, period, today]);
  const rows = useMemo(() => categoryRows(data, period, today), [data, period, today]);
  const slices = useMemo(() => spendingByCategory(data, period.start, period.end), [data, period]);
  const payees = useMemo(() => topPayees(data, period.start, period.end, 5), [data, period]);
  const trend = useMemo(() => monthlyTrend(data, today, 6, offset), [data, today, offset]);
  const incomeCategories = data.categories.filter((c) => c.type === 'income');

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Budget</h1>
          <p className="page__subtitle">Set a monthly limit for each category, then compare it with what you actually spent.</p>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--ghost" onClick={() => openDialog({ kind: 'category', type: 'expense' })}>
            <Plus size={16} aria-hidden="true" /> Add category
          </button>
        </div>
      </header>

      <div className="period-nav period-nav--page card">
        <button type="button" className="icon-btn" onClick={() => setOffset((o) => o - 1)} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <p className="period-nav__label" aria-live="polite">
          {period.label}
          {offset === 0 && <span className="period-nav__now">This month</span>}
        </p>
        <button type="button" className="icon-btn" onClick={() => setOffset((o) => o + 1)} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
        {offset !== 0 && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOffset(0)}>
            Back to this month
          </button>
        )}
      </div>

      <div className="summary-strip card">
        <div className="stat">
          <p className="stat__label">Income this month</p>
          <p className="stat__value">
            <Money cents={plan.expectedIncome} />
          </p>
          <p className="stat__note">
            <Money cents={plan.received} /> received + <Money cents={plan.expectedIncome - plan.received} /> expected
          </p>
        </div>
        <div className="stat">
          <p className="stat__label">Planned spending</p>
          <p className="stat__value">
            <Money cents={plan.planned} />
          </p>
          <p className="stat__note">Your monthly limits</p>
        </div>
        <div className="stat">
          <p className="stat__label">Spent</p>
          <p className="stat__value">
            <Money cents={plan.spent} />
          </p>
          <p className="stat__note">Actual, including bills</p>
        </div>
        <div className="stat">
          <p className="stat__label">{plan.unplanned >= 0 ? 'Not yet planned' : 'Planned over income'}</p>
          <p className={`stat__value ${plan.unplanned < 0 ? 'stat__value--bad' : ''}`}>
            <Money cents={Math.abs(plan.unplanned)} />
          </p>
          <p className="stat__note">{plan.unplanned >= 0 ? 'Income without a limit yet' : 'Limits add up to more than income'}</p>
        </div>
      </div>

      <Card id="plan" title="Categories">
        <p className="fineprint card__intro">
          <Info size={13} aria-hidden="true" /> Limits are a plan, not money in your account. They repeat every month. Leave a limit at 0 to just track spending.
        </p>
        <div className="plan-table">
          <div className="plan-table__head" aria-hidden="true">
            <span>Category</span>
            <span>Monthly limit</span>
            <span>Spent</span>
            <span>Left</span>
          </div>
          <ul className="plan-list" aria-label={`Planned and spent by category, ${period.label}`}>
            {rows.map((r) => (
              <PlanRow key={r.category.id} row={r} />
            ))}
          </ul>
        </div>
      </Card>

      <div className="two-col">
        <Card id="where" title="Where the money went">
          {slices.length === 0 ? (
            <EmptyState title={`No spending recorded in ${period.label}`} />
          ) : (
            <ul className="breakdown-bars">
              {slices.map((s) => (
                <li key={s.categoryId} className="breakdown-bars__row">
                  <span className="breakdown-bars__name">
                    <CategoryBadge category={s.category ?? undefined} size="sm" />
                    {s.category?.name ?? 'Uncategorized'}
                  </span>
                  <span className="breakdown-bars__track" aria-hidden="true">
                    <span className="breakdown-bars__fill" style={{ width: `${Math.max(2, s.share * 100)}%` }} />
                  </span>
                  <span className="breakdown-bars__value">
                    {fmt(s.total)} <span className="muted">· {Math.round(s.share * 100)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card id="payees" title="Top places · everyday spending">
          {payees.length === 0 ? (
            <EmptyState title="Add a merchant or payee to your expenses to see them here" />
          ) : (
            <ol className="payee-list">
              {payees.map((p) => (
                <li key={p.payee}>
                  <span className="payee-list__name">{p.payee}</span>
                  <span className="payee-list__count muted">
                    {p.count} time{p.count === 1 ? '' : 's'}
                  </span>
                  <Money cents={p.total} className="payee-list__total" />
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card id="trend" title="Income and spending, last 6 months">
        <TrendChart months={trend} />
      </Card>

      <Card
        id="income-cats"
        title="Income categories"
        action={
          <button type="button" className="link-btn" onClick={() => openDialog({ kind: 'category', type: 'income' })}>
            <Plus size={14} aria-hidden="true" /> Add
          </button>
        }
      >
        <ul className="simple-list">
          {incomeCategories.map((c) => (
            <li key={c.id}>
              <span className="simple-list__name">
                <CategoryBadge category={c} size="sm" />
                {c.name}
              </span>
              <button type="button" className="icon-btn" aria-label={`Edit ${c.name}`} onClick={() => openDialog({ kind: 'category', id: c.id })}>
                <Pencil size={16} />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function PlanRow({ row }: { row: CategoryRow }) {
  const { dispatch } = useStore();
  const { openDialog } = useUi();
  const toast = useToast();
  const fmt = useMoney();
  const { category, spent, monthlyBills } = row;
  const [text, setText] = useState(category.planned ? centsToInput(category.planned) : '');
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  /** Set by Escape so the blur that follows doesn't save the abandoned edit. */
  const cancelled = useRef(false);
  const shown = editing ? text : category.planned ? centsToInput(category.planned) : '';

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    setEditing(false);
    const value = text.trim();
    if (value === '') {
      setError(undefined);
      if (category.planned !== 0) dispatch({ type: 'category/update', id: category.id, patch: { planned: 0 } });
      return;
    }
    const parsed = parseAmount(value, { allowZero: true });
    if (!parsed.ok) {
      setError(parsed.error);
      setEditing(true);
      return;
    }
    setError(undefined);
    if (parsed.cents !== category.planned) dispatch({ type: 'category/update', id: category.id, patch: { planned: parsed.cents } });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      cancelled.current = true;
      setText(category.planned ? centsToInput(category.planned) : '');
      setError(undefined);
      setEditing(false);
      e.currentTarget.blur();
    }
  };

  const planned = category.planned;
  const status = meterStatus(spent, planned);
  const errorId = `plan-error-${category.id}`;
  return (
    <li className="plan-row">
      <div className="plan-row__name">
        <CategoryBadge category={category} />
        <span>{category.name}</span>
        <button type="button" className="icon-btn icon-btn--sm" aria-label={`Edit ${category.name} category`} onClick={() => openDialog({ kind: 'category', id: category.id })}>
          <Pencil size={14} />
        </button>
      </div>
      <div className="plan-row__limit">
        <AmountInput
          value={shown}
          onChange={(v) => {
            setEditing(true);
            setText(v);
          }}
          onFocus={(e) => {
            setText(category.planned ? centsToInput(category.planned) : '');
            setEditing(true);
            e.currentTarget.select();
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
          placeholder="No limit"
          aria-label={`Monthly limit for ${category.name}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} className="field__error" role="alert">
            {error}
          </p>
        )}
        {monthlyBills > 0 && monthlyBills > planned && (
          <p className="plan-row__hint">
            Bills here average {fmt(monthlyBills)}/mo.{' '}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                dispatch({ type: 'category/update', id: category.id, patch: { planned: monthlyBills } });
                toast.show(`${category.name} limit set to ${fmt(monthlyBills)}`);
              }}
            >
              Use {fmt(monthlyBills)}
            </button>
          </p>
        )}
      </div>
      <div className="plan-row__spent">
        <span className="plan-row__mobile-label">Spent </span>
        <Money cents={spent} />
      </div>
      <div className="plan-row__left">
        {planned > 0 ? (
          <StatusNote status={status}>{row.remaining >= 0 ? `${fmt(row.remaining)} left` : `${fmt(-row.remaining)} over`}</StatusNote>
        ) : (
          <span className="muted">No limit</span>
        )}
      </div>
      {planned > 0 && (
        <div className="plan-row__meter">
          <Meter spent={spent} planned={planned} label={`${category.name}: ${fmt(spent)} of ${fmt(planned)}`} />
        </div>
      )}
    </li>
  );
}
