import { CircleAlert } from 'lucide-react';
import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type Ref } from 'react';
import { currencySymbol } from '../lib/money';
import { useStore } from '../state/store';

interface ControlProps {
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Label + control + hint + error. The error is announced and linked to the
 * control with aria-describedby so it is read out beside the field.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  children,
  className = '',
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactElement<ControlProps>;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })
    : children;
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`.trim()}>
      <label htmlFor={id} className="field__label">
        {label}
        {optional && <span className="field__optional">Optional</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Group label for radio/chip groups (fieldset + legend). */
export function FieldGroup({ legend, error, children, className = '' }: { legend: ReactNode; error?: string; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <fieldset className={`field ${error ? 'field--error' : ''} ${className}`.trim()} aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="field__label">{legend}</legend>
      {children}
      {error && (
        <p id={`${id}-error`} className="field__error" role="alert">
          <CircleAlert size={14} aria-hidden="true" />
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Amount input with the currency symbol shown inside the box. */
export function AmountInput({
  value,
  onChange,
  large = false,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  large?: boolean;
  ref?: Ref<HTMLInputElement>;
} & ControlProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const { data } = useStore();
  return (
    <div className={`amount-input ${large ? 'amount-input--large' : ''}`}>
      <span className="amount-input__symbol" aria-hidden="true">
        {currencySymbol(data.settings.currency)}
      </span>
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={rest.placeholder ?? '0.00'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
