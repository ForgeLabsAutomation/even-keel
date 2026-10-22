import { ChartPie, CircleAlert, Download, LayoutDashboard, List, Plus, Receipt, RotateCw, Settings, Sparkles, Wallet, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { UiProvider, useUi, type Page } from './app/ui';
import { useRemoveDemo } from './app/useDemo';
import { useUpdates } from './app/updates';
import { billsNeedingReminder } from './lib/budget';
import { formatShort, relativeDay } from './lib/dates';
import { formatMoney } from './lib/money';
import { BudgetPage } from './features/budget/BudgetPage';
import { CategoryDialog } from './features/budget/CategoryDialog';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { BillsPage } from './features/recurring/BillsPage';
import { IncomePage } from './features/recurring/IncomePage';
import { RecurringDialog } from './features/recurring/RecurringDialog';
import { SettleDialog } from './features/recurring/SettleDialog';
import { BalanceDialog } from './features/settings/BalanceDialog';
import { SettingsPage } from './features/settings/SettingsPage';
import { ActivityPage } from './features/transactions/ActivityPage';
import { TransactionDialog } from './features/transactions/TransactionDialog';
import { useStore } from './state/store';
import { ConfirmProvider } from './ui/Confirm';
import { ToastProvider } from './ui/Toast';

const NAV: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { page: 'home', label: 'Overview', icon: LayoutDashboard },
  { page: 'activity', label: 'Activity', icon: List },
  { page: 'bills', label: 'Bills', icon: Receipt },
  { page: 'income', label: 'Income', icon: Wallet },
  { page: 'budget', label: 'Budget', icon: ChartPie },
];

export function App({ loadNotes = [] }: { loadNotes?: string[] }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <UiProvider>
          <Shell loadNotes={loadNotes} />
        </UiProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" className="logo">
      <rect width="32" height="32" rx="9" className="logo__bg" />
      <path d="M7 13.5h18" className="logo__line" />
      <path d="M8.5 17.5c1.6 4 4.4 6 7.5 6s5.9-2 7.5-6" className="logo__hull" />
    </svg>
  );
}

function Shell({ loadNotes }: { loadNotes: string[] }) {
  const { page, navigate, addTransaction, dialog } = useUi();
  const { data } = useStore();
  useTheme();
  useReminders();

  // "N" (or Ctrl/Cmd+N) adds a transaction from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog.kind !== 'none' || e.defaultPrevented || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      const isN = e.key === 'n' || e.key === 'N';
      if (isN && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        addTransaction();
      } else if (isN && !typing && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        addTransaction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addTransaction, dialog.kind]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main">
        <div className="brand">
          <Logo />
          <span className="brand__name">Even Keel</span>
        </div>
        <button type="button" className="btn btn--primary btn--block sidebar__add" onClick={() => addTransaction()} title="Add transaction (N)">
          <Plus size={18} aria-hidden="true" /> Add transaction
        </button>
        <nav className="sidebar__nav">
          {NAV.map((item) => (
            <NavButton key={item.page} item={item} active={page === item.page} onClick={() => navigate(item.page)} />
          ))}
        </nav>
        <div className="sidebar__bottom">
          <NavButton item={{ page: 'settings', label: 'Settings', icon: Settings }} active={page === 'settings'} onClick={() => navigate('settings')} />
          <SaveIndicator />
        </div>
      </aside>

      <header className="topbar">
        <div className="brand">
          <Logo />
          <span className="brand__name">Even Keel</span>
        </div>
        <SaveIndicator compact />
        <button
          type="button"
          className={`icon-btn ${page === 'settings' ? 'is-active' : ''}`}
          onClick={() => navigate('settings')}
          aria-label="Settings"
          aria-current={page === 'settings' ? 'page' : undefined}
        >
          <Settings size={20} />
        </button>
      </header>

      <main id="main" className="main" tabIndex={-1}>
        <Banners loadNotes={loadNotes} />
        {page === 'home' && <DashboardPage />}
        {page === 'activity' && <ActivityPage />}
        {page === 'bills' && <BillsPage />}
        {page === 'income' && <IncomePage />}
        {page === 'budget' && <BudgetPage />}
        {page === 'settings' && <SettingsPage />}
        <p className="main__footer">Your data stays on this computer. {data.meta.demo ? 'Demo data is loaded.' : ''}</p>
      </main>

      <nav className="bottom-nav" aria-label="Main">
        {NAV.map((item) => (
          <NavButton key={item.page} item={item} active={page === item.page} onClick={() => navigate(item.page)} compact />
        ))}
      </nav>
      <button type="button" className="fab" onClick={() => addTransaction()} aria-label="Add transaction">
        <Plus size={26} aria-hidden="true" />
      </button>

      <TransactionDialog />
      <RecurringDialog />
      <SettleDialog />
      <BalanceDialog />
      <CategoryDialog />
    </div>
  );
}

function NavButton({
  item,
  active,
  onClick,
  compact = false,
}: {
  item: { page: Page; label: string; icon: typeof LayoutDashboard };
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button type="button" className={`nav-btn ${compact ? 'nav-btn--compact' : ''} ${active ? 'is-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <Icon size={compact ? 22 : 18} aria-hidden="true" />
      <span>{item.label}</span>
    </button>
  );
}

function SaveIndicator({ compact = false }: { compact?: boolean }) {
  const { saveStatus, saveError, retrySave } = useStore();
  if (saveStatus === 'error') {
    return (
      <button type="button" className="save-indicator save-indicator--error" onClick={retrySave} title={saveError}>
        <CircleAlert size={14} aria-hidden="true" /> {compact ? 'Not saved' : 'Not saved. Retry'}
      </button>
    );
  }
  if (compact) return null;
  return (
    <p className="save-indicator" aria-live="polite">
      {saveStatus === 'saving' ? 'Saving…' : 'All changes saved'}
    </p>
  );
}

function Banner({ tone, icon, children, onDismiss }: { tone: 'info' | 'warn' | 'demo' | 'bad'; icon: ReactNode; children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className={`banner banner--${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <span className="banner__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="banner__body">{children}</div>
      {onDismiss && (
        <button type="button" className="icon-btn icon-btn--sm" onClick={onDismiss} aria-label="Dismiss">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function Banners({ loadNotes }: { loadNotes: string[] }) {
  const { data, saveStatus, saveError, retrySave } = useStore();
  const { navigate } = useUi();
  const removeDemo = useRemoveDemo();
  const { state: update, download, install } = useUpdates();
  const [notesDismissed, setNotesDismissed] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState<string | null>(null);

  return (
    <div className="banners">
      {saveStatus === 'error' && (
        <Banner tone="bad" icon={<CircleAlert size={18} />}>
          <p>
            <strong>Your latest changes aren’t saved.</strong> {saveError}
          </p>
          <button type="button" className="btn btn--sm btn--ghost" onClick={retrySave}>
            Try again
          </button>
        </Banner>
      )}
      {loadNotes.length > 0 && !notesDismissed && (
        <Banner tone="warn" icon={<CircleAlert size={18} />} onDismiss={() => setNotesDismissed(true)}>
          {loadNotes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </Banner>
      )}
      {update.status === 'available' && updateDismissed !== update.version && (
        <Banner tone="info" icon={<Download size={18} />} onDismiss={() => setUpdateDismissed(update.version)}>
          <p>
            <strong>A new version ({update.version}) is available.</strong> Your data stays safe when you update.
          </p>
          <button type="button" className="btn btn--sm btn--primary" onClick={download}>
            Update now
          </button>
        </Banner>
      )}
      {update.status === 'downloading' && (
        <Banner tone="info" icon={<Download size={18} />}>
          <p>Downloading update… {update.percent}%</p>
        </Banner>
      )}
      {update.status === 'downloaded' && (
        <Banner tone="info" icon={<RotateCw size={18} />}>
          <p>
            <strong>Update ready.</strong> Restart to finish. It only takes a moment.
          </p>
          <button type="button" className="btn btn--sm btn--primary" onClick={install}>
            Restart and update
          </button>
        </Banner>
      )}
      {data.meta.demo && (
        <Banner tone="demo" icon={<Sparkles size={18} />}>
          <p>
            <strong>You’re looking at demo data.</strong> All names and amounts are made up. Items marked “Demo” will be removed together.
          </p>
          <div className="banner__actions">
            <button type="button" className="btn btn--sm btn--primary" onClick={removeDemo}>
              Remove demo data
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => navigate('settings')}>
              Settings
            </button>
          </div>
        </Banner>
      )}
    </div>
  );
}

/** Applies the theme preference to <html>. "System" follows the OS setting. */
function useTheme() {
  const { data } = useStore();
  const theme = data.settings.theme;
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}

/** Once a day, a desktop notification about unpaid bills that are due soon or overdue. */
function useReminders() {
  const { data, dispatch, today } = useStore();
  const due = useMemo(
    () => (data.settings.reminders ? billsNeedingReminder(data, today, data.settings.reminderDays) : []),
    [data, today],
  );
  useEffect(() => {
    if (!data.settings.reminders || data.meta.lastReminderDate === today) return;
    dispatch({ type: 'reminders/mark', date: today });
    // No pop-ups for demo data or automated test runs (which pin "today").
    if (due.length === 0 || typeof Notification === 'undefined' || data.meta.demo || window.budgetApi?.fakeToday) return;
    const currency = data.settings.currency;
    const lines = due.slice(0, 4).map((o) => `${o.item.name}: ${formatMoney(o.amount, currency)}, ${o.overdue ? `overdue since ${formatShort(o.date)}` : relativeDay(o.date, today).toLowerCase()}`);
    const title = due.length === 1 ? 'A bill needs attention' : `${due.length} bills need attention`;
    const show = () => {
      try {
        new Notification(title, { body: lines.join('\n') + (due.length > 4 ? `\n…and ${due.length - 4} more` : ''), silent: false });
      } catch {
        /* notifications not available */
      }
    };
    if (Notification.permission === 'granted') show();
    else if (Notification.permission !== 'denied') Notification.requestPermission().then((p) => p === 'granted' && show());
  }, [due, today, data.settings.reminders, data.meta.lastReminderDate, data.meta.demo, data.settings.currency, dispatch]);
}
