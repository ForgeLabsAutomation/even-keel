import { Link2 } from 'lucide-react';
import { useUi } from '../../app/ui';
import { byNewest, signed } from '../../lib/budget';
import { formatFullDay, formatShort, relativeDay } from '../../lib/dates';
import { useStore } from '../../state/store';
import type { Transaction } from '../../state/types';
import { CategoryBadge } from '../../ui/CategoryBadge';
import { Badge } from '../../ui/Controls';
import { Money } from '../../ui/Money';

export function TransactionRow({ tx }: { tx: Transaction }) {
  const { data, today } = useStore();
  const { editTransaction } = useUi();
  const category = data.categories.find((c) => c.id === tx.categoryId);
  const linked = tx.link ? data.recurring.find((r) => r.id === tx.link!.recurringId) : undefined;
  const title = tx.payee || category?.name || 'Transaction';
  const meta = [category?.name && tx.payee ? category.name : null, tx.note].filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" className="tx-row" onClick={() => editTransaction(tx.id)} aria-label={`Edit ${title}, ${formatShort(tx.date)}`}>
        <CategoryBadge category={category} />
        <span className="tx-row__main">
          <span className="tx-row__title">{title}</span>
          <span className="tx-row__meta">
            {linked && (
              <span className="tx-row__link">
                <Link2 size={12} aria-hidden="true" />
                {linked.kind === 'income' ? 'Payday' : 'Bill'} {formatShort(tx.link!.date)}
              </span>
            )}
            {meta && <span className="tx-row__note">{meta}</span>}
            {tx.date > today && <Badge tone="info">Scheduled {relativeDay(tx.date, today).toLowerCase()}</Badge>}
            {tx.demo && <Badge tone="demo">Demo</Badge>}
          </span>
        </span>
        <Money cents={signed(tx)} signed={tx.type === 'income'} tone={tx.type === 'income' ? 'income' : undefined} className="tx-row__amount" />
      </button>
    </li>
  );
}

/** Transactions grouped under day headings, newest first. */
export function GroupedTransactions({ transactions }: { transactions: Transaction[] }) {
  const { today } = useStore();
  const sorted = [...transactions].sort(byNewest);
  const groups: { date: string; items: Transaction[]; net: number }[] = [];
  for (const tx of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.date === tx.date) {
      last.items.push(tx);
      last.net += signed(tx);
    } else groups.push({ date: tx.date, items: [tx], net: signed(tx) });
  }
  return (
    <div className="tx-groups">
      {groups.map((g) => {
        const rel = relativeDay(g.date, today);
        return (
          <section key={g.date} className="tx-group" aria-label={formatFullDay(g.date)}>
            <h3 className="tx-group__header">
              <span>
                {formatFullDay(g.date)}
                {(rel === 'Today' || rel === 'Yesterday') && <span className="tx-group__rel"> · {rel}</span>}
              </span>
              <Money cents={g.net} signed className="tx-group__net" />
            </h3>
            <ul className="tx-list">
              {g.items.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
