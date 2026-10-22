import { Database, Download, FolderOpen, Monitor, Moon, Sparkles, Sun, Trash, Upload, Wallet } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { exportBackup, exportTransactionsCsv, pickBackupFile } from '../../app/files';
import { useUi } from '../../app/ui';
import { useRemoveDemo } from '../../app/useDemo';
import { formatLong, isValidISODate } from '../../lib/dates';
import { nowStamp } from '../../lib/ids';
import { CURRENCIES, centsToInput, parseSignedAmount } from '../../lib/money';
import { createEmptyData } from '../../state/defaults';
import { parseBackup } from '../../state/persistence';
import { useStore } from '../../state/store';
import { useConfirm } from '../../ui/Confirm';
import { Card, Segmented } from '../../ui/Controls';
import { AmountInput, Field } from '../../ui/Field';
import { useToast } from '../../ui/Toast';
import { UpdatesPanel } from './UpdatesPanel';

export function SettingsPage() {
  const { data, dispatch, today, storageKind } = useStore();
  const { openDialog } = useUi();
  const toast = useToast();
  const confirm = useConfirm();
  const [info, setInfo] = useState<{ version: string; dataPath: string } | null>(null);
  const removeDemo = useRemoveDemo();
  // Demo data is only offered on a blank budget, so it can never mix with real numbers.
  const hasRealData = data.transactions.some((t) => !t.demo) || data.recurring.some((r) => !r.demo);
  const s = data.settings;

  useEffect(() => {
    window.budgetApi
      ?.getInfo()
      .then(setInfo)
      .catch(() => {});
  }, []);

  const update = (patch: Partial<typeof s>) => dispatch({ type: 'settings/update', patch });

  const doExportCsv = async () => {
    if (data.transactions.length === 0) {
      toast.show('There are no transactions to export yet.', { tone: 'info' });
      return;
    }
    const r = await exportTransactionsCsv(data, data.transactions, 'all');
    if (r.ok) toast.show(`Exported ${data.transactions.length} transactions`);
    else if (!r.canceled) toast.show(r.error ?? 'Export failed', { tone: 'error' });
  };

  const doBackup = async () => {
    const r = await exportBackup(data);
    if (r.ok) toast.show('Backup saved');
    else if (!r.canceled) toast.show(r.error ?? 'Backup failed', { tone: 'error' });
  };

  const doRestore = async () => {
    const file = await pickBackupFile();
    if (!file.ok) {
      if (!file.canceled) toast.show(file.error ?? 'Could not open that file', { tone: 'error' });
      return;
    }
    const parsed = parseBackup(file.content ?? '', today);
    if ('error' in parsed) {
      toast.show(parsed.error, { tone: 'error' });
      return;
    }
    const ok = await confirm({
      title: 'Restore this backup?',
      message: (
        <>
          <p>
            It has {parsed.data.transactions.length} transactions and {parsed.data.recurring.length} bills and income sources.
          </p>
          <p>Everything currently in the app will be replaced. Consider backing up first.</p>
          {parsed.warnings.length > 0 && <p className="muted">{parsed.warnings.join(' ')}</p>}
        </>
      ),
      confirmLabel: 'Replace with backup',
      danger: true,
    });
    if (!ok) return;
    const previous = data;
    dispatch({ type: 'data/replace', data: parsed.data });
    toast.show('Backup restored', { actions: [{ label: 'Undo', onClick: () => dispatch({ type: 'data/replace', data: previous }) }] });
  };

  const doErase = async () => {
    const ok = await confirm({
      title: 'Erase everything?',
      message: (
        <>
          <p>This deletes all transactions, bills, income sources, categories and settings, and starts fresh.</p>
          <p>
            <strong>It can’t be undone</strong> once you close the app. Back up first if you might want it later.
          </p>
        </>
      ),
      confirmLabel: 'Erase everything',
      danger: true,
    });
    if (!ok) return;
    const previous = data;
    dispatch({ type: 'data/replace', data: createEmptyData(today) });
    toast.show('All data erased', { tone: 'info', actions: [{ label: 'Undo', onClick: () => dispatch({ type: 'data/replace', data: previous }) }] });
  };

  return (
    <div className="page settings">
      <header className="page__header">
        <div>
          <h1 className="page__title">Settings</h1>
          <p className="page__subtitle">Money, preferences, your data, and updates.</p>
        </div>
      </header>

      <Card id="money" title="Money">
        <div className="settings-grid">
          <Field label="Currency" hint="Changes how amounts are shown. Amounts themselves aren’t converted.">
            <select className="input select" value={s.currency} onChange={(e) => update({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </Field>
          <StartingBalanceForm key={`${s.openingBalance}|${s.balanceAsOf}`} />
        </div>
        <button type="button" className="btn btn--soft" onClick={() => openDialog({ kind: 'balance' })}>
          <Wallet size={16} aria-hidden="true" /> Update balance to match my bank
        </button>
      </Card>

      <Card id="prefs" title="Preferences">
        <div className="settings-stack">
          <Segmented
            label="Appearance"
            hideLabel={false}
            value={s.theme}
            onChange={(theme) => update({ theme })}
            options={[
              { value: 'system', label: <><Monitor size={14} aria-hidden="true" /> System</> },
              { value: 'light', label: <><Sun size={14} aria-hidden="true" /> Light</> },
              { value: 'dark', label: <><Moon size={14} aria-hidden="true" /> Dark</> },
            ]}
          />
          <Segmented
            label="Overview opens on"
            hideLabel={false}
            value={s.defaultView}
            onChange={(defaultView) => update({ defaultView })}
            options={[
              { value: 'payperiod', label: 'Pay period' },
              { value: 'month', label: 'Month' },
            ]}
          />
          <div className="toggle-row">
            <label className="switch">
              <input type="checkbox" checked={s.reminders} onChange={(e) => update({ reminders: e.target.checked })} />
              <span className="switch__track" aria-hidden="true" />
              <span className="switch__label">Bill reminders</span>
            </label>
            <p className="field__hint">A desktop notification when you open the app, once a day, for unpaid bills coming up or overdue.</p>
          </div>
          {s.reminders && (
            <Field label="Remind me about bills due within">
              <select className="input select select--narrow" value={s.reminderDays} onChange={(e) => update({ reminderDays: Number(e.target.value) })}>
                <option value={0}>Due today only</option>
                {[1, 2, 3, 5, 7, 14].map((d) => (
                  <option key={d} value={d}>
                    {d} day{d === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Card>

      {storageKind === 'desktop' && (
        <Card id="updates" title="App updates">
          <UpdatesPanel version={info?.version} />
        </Card>
      )}

      <Card id="data" title="Your data">
        <p className="data-note">
          <Database size={16} aria-hidden="true" />
          <span>
            Everything is stored only on this computer. Nothing is sent anywhere, and there’s no bank connection.
            {storageKind === 'desktop'
              ? ' A backup copy is kept automatically each day for two weeks.'
              : ' In a web browser, clearing site data will erase it. Back up regularly.'}
          </span>
        </p>
        {info?.dataPath && (
          <p className="data-path">
            <code>{info.dataPath}</code>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.budgetApi?.showDataFolder()}>
              <FolderOpen size={16} aria-hidden="true" /> Show in folder
            </button>
          </p>
        )}
        <div className="button-row">
          <button type="button" className="btn btn--soft" onClick={doExportCsv}>
            <Download size={16} aria-hidden="true" /> Export transactions (CSV)
          </button>
          <button type="button" className="btn btn--soft" onClick={doBackup}>
            <Download size={16} aria-hidden="true" /> Back up everything
          </button>
          <button type="button" className="btn btn--ghost" onClick={doRestore}>
            <Upload size={16} aria-hidden="true" /> Restore from backup
          </button>
        </div>
        <div className="button-row">
          {data.meta.demo ? (
            <button type="button" className="btn btn--ghost" onClick={removeDemo}>
              <Trash size={16} aria-hidden="true" /> Remove demo data
            </button>
          ) : hasRealData ? null : (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                dispatch({ type: 'demo/load', today, now: nowStamp() });
                toast.show('Demo data added. It’s labelled “demo” and can be removed in one click.', { tone: 'info' });
              }}
            >
              <Sparkles size={16} aria-hidden="true" /> Add demo data
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--danger-text" onClick={doErase}>
            <Trash size={16} aria-hidden="true" /> Erase everything
          </button>
        </div>
      </Card>

      <Card id="about" title="About">
        <p className="muted">
          Even Keel {info?.version ? `version ${info.version}` : ''}: a simple budget for weekly pay, bills and everyday spending. Balances and
          “left to spend” are estimates based on what you enter; they aren’t connected to any bank account.
        </p>
        <p className="muted">
          Tip: press <kbd>N</kbd> anywhere to add a transaction.
        </p>
      </Card>
    </div>
  );
}

function StartingBalanceForm() {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const [amount, setAmount] = useState(centsToInput(data.settings.openingBalance));
  const [asOf, setAsOf] = useState(data.settings.balanceAsOf);
  const [errors, setErrors] = useState<{ amount?: string; asOf?: string }>({});
  const changed = amount !== centsToInput(data.settings.openingBalance) || asOf !== data.settings.balanceAsOf;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseSignedAmount(amount);
    const next: typeof errors = {};
    if (!parsed.ok) next.amount = parsed.error;
    if (!isValidISODate(asOf)) next.asOf = 'Enter a real date.';
    setErrors(next);
    if (!parsed.ok || next.asOf) return;
    dispatch({ type: 'balance/setOpening', amount: parsed.cents, asOf });
    toast.show(`Starting balance set for ${formatLong(asOf)}`);
  };

  return (
    <form className="starting-balance" onSubmit={onSubmit} noValidate>
      <Field label="Starting balance" error={errors.amount} hint="What was in the account at the start of the date below.">
        <AmountInput value={amount} onChange={setAmount} />
      </Field>
      <Field label="As of" error={errors.asOf} hint="Transactions from this date on change the balance.">
        <input type="date" className="input" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
      </Field>
      <button type="submit" className="btn btn--ghost btn--sm" disabled={!changed}>
        Save
      </button>
    </form>
  );
}
