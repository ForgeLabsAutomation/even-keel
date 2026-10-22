'use strict';
/**
 * In-app updates from GitHub Releases (via electron-updater).
 *
 * Nothing downloads without the person's say-so: the app checks quietly at
 * startup and every few hours, shows "Update available", and only downloads
 * when they press Update. After the download they choose when to restart.
 * If they just quit instead, the update installs on the way out.
 */
const { app } = require('electron');

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** @type {UpdateState} */
let state = { status: 'idle' };
let updater = null;
let notify = () => {};
let log = () => {};

function setState(next) {
  state = next;
  notify(state);
}

function friendlyError(err) {
  const text = String((err && (err.message || err)) || 'Unknown error');
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EAI_AGAIN|net::ERR_/i.test(text)) {
    return "Couldn't reach the update server. Check your internet connection and try again.";
  }
  if (/404|no published versions|Cannot find latest/i.test(text)) {
    return 'No published update was found yet.';
  }
  if (/sha512 checksum mismatch/i.test(text)) {
    return 'The download was damaged. Please try again.';
  }
  return `The update didn't work: ${text.split('\n')[0].slice(0, 200)}`;
}

function stripHtml(html) {
  if (!html) return undefined;
  const text = String(Array.isArray(html) ? html.map((n) => n.note || '').join('\n') : html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text ? text.slice(0, 2000) : undefined;
}

/**
 * @param {{ onState: (s: UpdateState) => void, log: (msg: string) => void }} options
 */
function initUpdater(options) {
  notify = options.onState;
  log = options.log;

  const forced = process.env.EVEN_KEEL_FORCE_UPDATES === '1';
  if (!app.isPackaged && !forced) {
    setState({ status: 'unsupported', reason: 'Updates work in the installed app, not in development mode.' });
    return;
  }

  // Required lazily so development runs don't need a publish config.
  const { autoUpdater } = require('electron-updater');
  updater = autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.allowDowngrade = false;
  updater.logger = {
    info: (m) => log(`[updater] ${m}`),
    warn: (m) => log(`[updater] WARN ${m}`),
    error: (m) => log(`[updater] ERROR ${m}`),
    debug: () => {},
  };
  if (forced) updater.forceDevUpdateConfig = true;

  updater.on('checking-for-update', () => setState({ status: 'checking' }));
  updater.on('update-available', (info) =>
    setState({ status: 'available', version: info.version, releaseNotes: stripHtml(info.releaseNotes) }),
  );
  updater.on('update-not-available', () => setState({ status: 'not-available', version: app.getVersion() }));
  updater.on('download-progress', (p) => {
    const version = state.version || '';
    setState({ status: 'downloading', version, percent: Math.max(0, Math.min(100, Math.round(p.percent || 0))) });
  });
  updater.on('update-downloaded', (info) => setState({ status: 'downloaded', version: info.version }));
  updater.on('error', (err) => {
    log(`[updater] error: ${err && err.stack ? err.stack : err}`);
    setState({ status: 'error', message: friendlyError(err) });
  });

  setTimeout(() => quietCheck(), 5000);
  setInterval(() => quietCheck(), CHECK_EVERY_MS).unref?.();
}

/** Background check that never interrupts a download or a ready-to-install update. */
function quietCheck() {
  if (!updater) return;
  if (['checking', 'downloading', 'downloaded', 'available'].includes(state.status)) return;
  updater.checkForUpdates().catch((err) => {
    log(`[updater] background check failed: ${err}`);
    // Stay quiet about background failures (for example when offline).
    setState({ status: 'idle' });
  });
}

async function checkNow() {
  if (!updater) return state;
  if (state.status === 'downloading' || state.status === 'downloaded') return state;
  try {
    setState({ status: 'checking' });
    await updater.checkForUpdates();
  } catch (err) {
    setState({ status: 'error', message: friendlyError(err) });
  }
  return state;
}

async function download() {
  if (!updater) return state;
  if (state.status !== 'available') return state;
  const version = state.version || '';
  try {
    setState({ status: 'downloading', version, percent: 0 });
    await updater.downloadUpdate();
  } catch (err) {
    setState({ status: 'error', message: friendlyError(err) });
  }
  return state;
}

function install() {
  if (!updater || state.status !== 'downloaded') return;
  // Silent install, then relaunch the app.
  setImmediate(() => updater.quitAndInstall(true, true));
}

function getState() {
  return state;
}

module.exports = { initUpdater, checkNow, download, install, getState };
