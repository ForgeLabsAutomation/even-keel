import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';

/** Segmented control backed by real radio inputs (arrow keys move between options). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  hideLabel = true,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  hideLabel?: boolean;
}) {
  const name = useId();
  return (
    <fieldset className={`segmented segmented--${size}`}>
      <legend className={hideLabel ? 'sr-only' : 'field__label'}>{label}</legend>
      <div className="segmented__track">
        {options.map((o) => (
          <label key={o.value} className={`segmented__option ${o.disabled ? 'is-disabled' : ''}`} title={o.title}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export type MeterStatus = 'none' | 'ok' | 'near' | 'over';

export function meterStatus(spent: number, planned: number): MeterStatus {
  if (planned <= 0) return spent > 0 ? 'over' : 'none';
  if (spent > planned) return 'over';
  if (spent >= planned * 0.85) return 'near';
  return 'ok';
}

/** Spending progress: the fill shows how much of the plan is used; status always comes with an icon and words. */
export function Meter({ spent, planned, label }: { spent: number; planned: number; label: string }) {
  const status = meterStatus(spent, planned);
  const pct = planned > 0 ? Math.min(100, (spent / planned) * 100) : spent > 0 ? 100 : 0;
  return (
    <div
      className={`meter meter--${status}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(planned, spent, 1)}
      aria-valuenow={spent}
    >
      <div className="meter__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatusNote({ status, children }: { status: MeterStatus; children: ReactNode }) {
  const Icon = status === 'over' ? CircleAlert : status === 'near' ? TriangleAlert : CircleCheck;
  return (
    <span className={`status-note status-note--${status}`}>
      {status !== 'none' && <Icon size={14} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Badge({ tone = 'neutral', children, icon }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' | 'demo'; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={`badge badge--${tone}`}>
      {icon}
      {children}
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon" aria-hidden="true">{icon}</div>}
      <p className="empty__title">{title}</p>
      {children && <p className="empty__text">{children}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

export function Card({ title, action, children, className = '', id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${className}`.trim()} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {(title || action) && (
        <div className="card__header">
          {title && (
            <h2 className="card__title" id={id ? `${id}-title` : undefined}>
              {title}
            </h2>
          )}
          {action && <div className="card__action">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
