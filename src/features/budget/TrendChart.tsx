import { useCallback, useEffect, useRef, useState } from 'react';
import type { MonthTotals } from '../../lib/budget';
import { formatMonthShort, formatMonthYear } from '../../lib/dates';
import { EmptyState } from '../../ui/Controls';
import { useMoney } from '../../ui/Money';

const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 28, left: 56 };
const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;

function niceScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 100_00, step: 25_00 };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  return { top: Math.ceil(max / step) * step, step };
}

/** Column with a rounded data end and a square baseline. */
function barPath(x: number, y: number, w: number, base: number): string {
  const h = base - y;
  if (h <= 0) return '';
  const r = Math.min(RADIUS, h, w / 2);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

/** Width of an element that may mount and unmount (callback ref re-attaches the observer). */
function useWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(600);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const update = () => setWidth(Math.max(260, Math.floor(el.getBoundingClientRect().width)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(update);
    observer.current.observe(el);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width] as const;
}

export function TrendChart({ months }: { months: MonthTotals[] }) {
  const fmt = useMoney();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const hasData = months.some((m) => m.income > 0 || m.spent > 0);
  if (!hasData) return <EmptyState title="Nothing recorded in these months yet" />;

  const max = Math.max(...months.map((m) => Math.max(m.income, m.spent)));
  const { top, step } = niceScale(max);
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = plotW / months.length;
  const barW = Math.min(BAR_MAX, Math.max(6, (band * 0.6 - GAP) / 2));
  const base = PAD.top + plotH;
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const ticks: number[] = [];
  for (let t = 0; t <= top + 1; t += step) ticks.push(t);

  const activeMonth = active !== null ? months[active] : null;
  const tooltipX = active !== null ? PAD.left + band * active + band / 2 : 0;

  return (
    <div className="trend">
      <div className="trend__toolbar">
        <ul className="legend" aria-label="Legend">
          <li>
            <span className="legend__key legend__key--income" aria-hidden="true" /> Income received
          </li>
          <li>
            <span className="legend__key legend__key--spent" aria-hidden="true" /> Spent
          </li>
        </ul>
        <button type="button" className="link-btn" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <table className="data-table">
          <caption className="sr-only">Income received and spending by month</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Income received</th>
              <th scope="col">Spent</th>
              <th scope="col">Difference</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <th scope="row">{formatMonthYear(m.month)}</th>
                <td>{fmt(m.income)}</td>
                <td>{fmt(m.spent)}</td>
                <td>{fmt(m.income - m.spent, { signed: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="trend__plot" ref={ref} onMouseLeave={() => setActive(null)}>
          <svg width={width} height={HEIGHT} role="group" aria-label="Income received and spending by month. Use Tab to move between months.">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'trend__baseline' : 'trend__grid'} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="trend__tick">
                  {fmt(t, { compact: true })}
                </text>
              </g>
            ))}
            {months.map((m, i) => {
              const cx = PAD.left + band * i + band / 2;
              const x1 = cx - barW - GAP / 2;
              const x2 = cx + GAP / 2;
              const label = `${formatMonthYear(m.month)}: income received ${fmt(m.income)}, spent ${fmt(m.spent)}`;
              return (
                <g
                  key={m.month}
                  className={`trend__month ${active === i ? 'is-active' : ''}`}
                  tabIndex={0}
                  aria-label={label}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} className="trend__hit" />
                  <path d={barPath(x1, y(m.income), barW, base)} className="trend__bar trend__bar--income" />
                  <path d={barPath(x2, y(m.spent), barW, base)} className="trend__bar trend__bar--spent" />
                  <text x={cx} y={HEIGHT - 8} textAnchor="middle" className="trend__tick">
                    {formatMonthShort(m.month)}
                  </text>
                </g>
              );
            })}
          </svg>
          {activeMonth && (
            <div
              className="chart-tooltip"
              style={{ left: Math.min(Math.max(tooltipX, 90), width - 90), top: 4 }}
              role="presentation"
            >
              <p className="chart-tooltip__title">{formatMonthYear(activeMonth.month)}</p>
              <p>
                <span className="legend__key legend__key--income" aria-hidden="true" /> Income <strong>{fmt(activeMonth.income)}</strong>
              </p>
              <p>
                <span className="legend__key legend__key--spent" aria-hidden="true" /> Spent <strong>{fmt(activeMonth.spent)}</strong>
              </p>
              <p className="chart-tooltip__diff">{fmt(activeMonth.income - activeMonth.spent, { signed: true })} difference</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
