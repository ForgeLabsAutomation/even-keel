import { Download, Plus, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useUi } from '../../app/ui';
import { exportTransactionsCsv } from '../../app/files';
import { formatMonthYear, monthKey } from '../../lib/dates';
import { useStore } from '../../state/store';
import type { TxType } from '../../state/types';
import { EmptyState, Segmented } from '../../ui/Controls';
import { Money } from '../../ui/Money';
import { useToast } from '../../ui/Toast';
import { GroupedTransactions } from './TransactionList';

const PAGE_SIZE = 150;

export function ActivityPage() {
  const { data } = useStore();
  const { addTransaction } = useUi();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | TxType>('all');
  const [categoryId, setCategoryId] = useState('');
  const [month, setMonth] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);

  const months = useMemo(() => [...new Set(data.transactions.map((t) => monthKey(t.date)))].sort().reverse(), [data.transactions]);
  const categoriesById = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.transactions.filter((t) => {
      if (type !== 'all' && t.type !== type) return false;
      if (categoryId && t.categoryId !== categoryId) return false;
      if (month && monthKey(t.date) !== month) return false;
      if (!q) return true;
      const cat = categoriesById.get(t.categoryId)?.name ?? '';
      const linked = t.link ? (data.recurring.find((r) => r.id === t.link!.recurringId)?.name ?? '') : '';
      return [t.payee, t.note, cat, linked].some((s) => s && s.toLowerCase().includes(q));
    });
  }, [data.transactions, data.recurring, query, type, categoryId, month, categoriesById]);

  const totals = useMemo(() => {
    let spent = 0;
    let received = 0;
    for (const t of filtered) {
      if (t.type === 'income') received += t.amount;
      else spent += t.amount;
    }
    return { spent, received };
  }, [filtered]);

  const filtersActive = query !== '' || type !== 'all' || categoryId !== '' || month !== '';
  const shown = [...filtered].sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)).slice(0, limit);

  const exportCsv = async () => {
    const result = await exportTransactionsCsv(data, filtered, filtersActive ? 'filtered' : 'all');
    if (result.ok) toast.show(`Exported ${filtered.length} transaction${filtered.length === 1 ? '' : 's'}`);
    else if (!result.canceled) toast.show(result.error ?? 'Export failed', { tone: 'error' });
  };

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1 className="page__title">Activity</h1>
          <p className="page__subtitle">Everything you’ve recorded. Select a row to edit or delete it.</p>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--ghost" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download size={16} aria-hidden="true" /> Export CSV
          </button>
          <button type="button" className="btn btn--primary" onClick={() => addTransaction()}>
            <Plus size={16} aria-hidden="true" /> Add
          </button>
        </div>
      </header>

      <div className="filters card" role="search">
        <div className="search">
          <Search size={16} aria-hidden="true" className="search__icon" />
          <label htmlFor="activity-search" className="sr-only">
            Search activity
          </label>
          <input
            ref={searchRef}
            id="activity-search"
            type="search"
            className="input search__input"
            placeholder="Search payee, note or category"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE_SIZE);
            }}
          />
        </div>
        <Segmented
          label="Type"
          size="sm"
          value={type}
          onChange={(v) => {
            setType(v);
            setCategoryId('');
          }}
          options={[
            { value: 'all', label: 'All' },
            { value: 'expense', label: 'Spending' },
            { value: 'income', label: 'Income' },
          ]}
        />
        <label className="sr-only" htmlFor="activity-category">
          Category
        </label>
        <select id="activity-category" className="input select select--sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {data.categories
            .filter((c) => type === 'all' || c.type === type)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
        <label className="sr-only" htmlFor="activity-month">
          Month
        </label>
        <select id="activity-month" className="input select select--sm" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">All time</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonthYear(`${m}-01`)}
            </option>
          ))}
        </select>
        {filtersActive && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => {
              setQuery('');
              setType('all');
              setCategoryId('');
              setMonth('');
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {data.transactions.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No transactions yet"
            action={
              <button type="button" className="btn btn--primary btn--sm" onClick={() => addTransaction()}>
                <Plus size={16} aria-hidden="true" /> Add your first one
              </button>
            }
          >
            Record spending and income as it happens. It only takes a few seconds.
          </EmptyState>
        </div>
      ) : (
        <>
          <p className="result-summary" aria-live="polite">
            {filtered.length} transaction{filtered.length === 1 ? '' : 's'} · Spent <Money cents={totals.spent} /> · Received{' '}
            <Money cents={totals.received} tone="income" />
          </p>
          {filtered.length === 0 ? (
            <div className="card">
              <EmptyState title="Nothing matches these filters" />
            </div>
          ) : (
            <div className="card card--flush">
              <GroupedTransactions transactions={shown} />
              {filtered.length > limit && (
                <div className="load-more">
                  <button type="button" className="btn btn--ghost" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                    Show more ({filtered.length - limit} older)
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
