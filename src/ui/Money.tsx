import { formatMoney, type Cents } from '../lib/money';
import { useStore } from '../state/store';

export function useMoney() {
  const { data } = useStore();
  const currency = data.settings.currency;
  return (cents: Cents, options?: Parameters<typeof formatMoney>[2]) => formatMoney(cents, currency, options);
}

/** A formatted amount. `tone` colours it by meaning (income vs. spending, or negative). */
export function Money({
  cents,
  signed = false,
  tone,
  className = '',
}: {
  cents: Cents;
  signed?: boolean;
  tone?: 'income' | 'expense' | 'auto';
  className?: string;
}) {
  const fmt = useMoney();
  const toneClass =
    tone === 'income' ? 'money--income' : tone === 'auto' && cents < 0 ? 'money--negative' : tone === 'auto' && cents > 0 ? 'money--positive' : '';
  return <span className={`money ${toneClass} ${className}`.trim()}>{fmt(cents, { signed })}</span>;
}
