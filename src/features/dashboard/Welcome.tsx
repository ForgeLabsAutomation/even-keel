import { Check, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useUi } from '../../app/ui';
import { nowStamp } from '../../lib/ids';
import { CURRENCIES, parseSignedAmount } from '../../lib/money';
import { useStore } from '../../state/store';
import { AmountInput, Field } from '../../ui/Field';
import { useToast } from '../../ui/Toast';

/** First-run checklist: balance, paycheck, bills, first expense, or try demo data. */
export function Welcome() {
  const { data, dispatch, today } = useStore();
  const { openDialog, addTransaction } = useUi();
  const toast = useToast();
  const [balance, setBalance] = useState('');
  const [balanceError, setBalanceError] = useState<string>();
  const [balanceSaved, setBalanceSaved] = useState(data.settings.openingBalance !== 0);

  const hasIncome = data.recurring.some((r) => r.kind === 'income');
  const hasBill = data.recurring.some((r) => r.kind === 'bill');
  const hasTx = data.transactions.length > 0;
  const steps = [balanceSaved, hasIncome, hasBill, hasTx];
  const done = steps.filter(Boolean).length;

  const saveBalance = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseSignedAmount(balance);
    if (!parsed.ok) {
      setBalanceError(parsed.error);
      return;
    }
    setBalanceError(undefined);
    dispatch({ type: 'balance/setOpening', amount: parsed.cents, asOf: today });
    setBalanceSaved(true);
    toast.show('Starting balance saved');
  };

  return (
    <section className="card welcome" aria-labelledby="welcome-title">
      <div className="welcome__intro">
        <h2 id="welcome-title" className="welcome__title">
          Welcome! Let’s get you set up.
        </h2>
        <p className="welcome__text">A few quick steps and you’ll see how much you can spend until your next payday. Everything stays on this computer.</p>
        <p className="welcome__progress" aria-live="polite">
          {done} of 4 done
        </p>
      </div>
      <ol className="steps">
        <li className={`step ${balanceSaved ? 'step--done' : ''}`}>
          <StepMark done={balanceSaved} n={1} />
          <div className="step__body">
            <p className="step__title">How much is in your account right now?</p>
            {balanceSaved ? (
              <p className="step__text">Saved. You can change it any time with “Update balance”.</p>
            ) : (
              <form className="step__form" onSubmit={saveBalance} noValidate>
                <Field label="Current balance" error={balanceError} hint="Use the balance of the account you spend from. A negative amount is OK.">
                  <AmountInput value={balance} onChange={setBalance} placeholder="0.00" />
                </Field>
                <Field label="Currency">
                  <select
                    className="input select"
                    value={data.settings.currency}
                    onChange={(e) => dispatch({ type: 'settings/update', patch: { currency: e.target.value } })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <button type="submit" className="btn btn--primary btn--sm step__submit">
                  Save balance
                </button>
              </form>
            )}
          </div>
        </li>
        <li className={`step ${hasIncome ? 'step--done' : ''}`}>
          <StepMark done={hasIncome} n={2} />
          <div className="step__body">
            <p className="step__title">Add your paycheck</p>
            <p className="step__text">How much you usually get, how often, and when the next one lands.</p>
            {!hasIncome && (
              <button type="button" className="btn btn--soft btn--sm" onClick={() => openDialog({ kind: 'recurring', itemKind: 'income' })}>
                Add paycheck
              </button>
            )}
          </div>
        </li>
        <li className={`step ${hasBill ? 'step--done' : ''}`}>
          <StepMark done={hasBill} n={3} />
          <div className="step__body">
            <p className="step__title">Add your regular bills</p>
            <p className="step__text">Rent, phone, insurance, subscriptions. Add one now and the rest whenever you like.</p>
            {!hasBill && (
              <button type="button" className="btn btn--soft btn--sm" onClick={() => openDialog({ kind: 'recurring', itemKind: 'bill' })}>
                Add a bill
              </button>
            )}
          </div>
        </li>
        <li className={`step ${hasTx ? 'step--done' : ''}`}>
          <StepMark done={hasTx} n={4} />
          <div className="step__body">
            <p className="step__title">Record something you bought</p>
            <p className="step__text">It takes a few seconds: amount, category, save.</p>
            {!hasTx && (
              <button type="button" className="btn btn--soft btn--sm" onClick={() => addTransaction()}>
                Add an expense
              </button>
            )}
          </div>
        </li>
      </ol>
      <div className="welcome__footer">
        {!data.meta.demo && data.transactions.length === 0 && data.recurring.length === 0 && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              dispatch({ type: 'demo/load', today, now: nowStamp() });
              toast.show('Demo data loaded. Remove it any time from the banner or Settings.', { tone: 'info' });
            }}
          >
            <Sparkles size={16} aria-hidden="true" /> Explore with demo data first
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => dispatch({ type: 'setup/complete' })}>
          {done === 4 ? 'All set. Hide this' : 'Hide setup'}
        </button>
      </div>
    </section>
  );
}

function StepMark({ done, n }: { done: boolean; n: number }) {
  return (
    <span className="step__mark" aria-hidden="true">
      {done ? <Check size={16} strokeWidth={3} /> : n}
    </span>
  );
}
