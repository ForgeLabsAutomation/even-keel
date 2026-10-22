import { CircleCheck, Download, RefreshCw, RotateCw, TriangleAlert } from 'lucide-react';
import { useUpdates } from '../../app/updates';

export function UpdatesPanel({ version }: { version?: string }) {
  const { state, check, download, install } = useUpdates();
  return (
    <div className="updates" aria-live="polite">
      <p className="updates__version">
        You have version <strong>{version ?? '…'}</strong>
      </p>
      {state.status === 'unsupported' && <p className="muted">{state.reason}</p>}
      {state.status === 'idle' && (
        <button type="button" className="btn btn--soft" onClick={check}>
          <RefreshCw size={16} aria-hidden="true" /> Check for updates
        </button>
      )}
      {state.status === 'checking' && (
        <p className="updates__status">
          <RefreshCw size={16} aria-hidden="true" className="spin" /> Checking for updates…
        </p>
      )}
      {state.status === 'not-available' && (
        <div className="updates__row">
          <p className="updates__status tone-good">
            <CircleCheck size={16} aria-hidden="true" /> You’re up to date.
          </p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={check}>
            Check again
          </button>
        </div>
      )}
      {state.status === 'available' && (
        <div className="updates__available">
          <p className="updates__status">
            <Download size={16} aria-hidden="true" /> Version <strong>{state.version}</strong> is available.
          </p>
          {state.releaseNotes && (
            <details className="updates__notes">
              <summary>What’s new</summary>
              <p>{state.releaseNotes}</p>
            </details>
          )}
          <button type="button" className="btn btn--primary" onClick={download}>
            <Download size={16} aria-hidden="true" /> Update now
          </button>
        </div>
      )}
      {state.status === 'downloading' && (
        <div className="updates__progress">
          <p className="updates__status">Downloading version {state.version}… {state.percent}%</p>
          <div className="progress" role="progressbar" aria-label="Download progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent}>
            <div className="progress__fill" style={{ width: `${state.percent}%` }} />
          </div>
        </div>
      )}
      {state.status === 'downloaded' && (
        <div className="updates__available">
          <p className="updates__status tone-good">
            <CircleCheck size={16} aria-hidden="true" /> Version {state.version} is ready. Restart to finish. Your data stays safe.
          </p>
          <button type="button" className="btn btn--primary" onClick={install}>
            <RotateCw size={16} aria-hidden="true" /> Restart and update
          </button>
        </div>
      )}
      {state.status === 'error' && (
        <div className="updates__row">
          <p className="updates__status tone-bad">
            <TriangleAlert size={16} aria-hidden="true" /> {state.message}
          </p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={check}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
