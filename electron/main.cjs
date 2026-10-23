'use strict';
/**
 * Electron main process: owns the window, the data file, file dialogs and
 * updates. The UI talks to it only through the small API in preload.cjs.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, screen, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { JsonStore } = require('./storage.cjs');
const updates = require('./updater.cjs');

const DEV_URL = process.env.EVEN_KEEL_DEV_URL || '';
const APP_ID = 'com.evenkeel.budget';
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

// Tests (and anyone who wants a portable copy) can point the app at a different data folder.
if (process.env.EVEN_KEEL_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.EVEN_KEEL_USER_DATA));
}

// Only one copy of the app may run, so two windows can never write the same file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Windows-only API (it doesn't exist on macOS); needed for notifications there.
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// ---------------------------------------------------------------------------
// Logging (kept small; helps diagnose update problems on someone else's PC)

const logDir = path.join(app.getPath('userData'), 'logs');
const logFile = path.join(logDir, 'main.log');
function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 1024 * 1024) {
      fs.renameSync(logFile, `${logFile}.old`);
    }
    fs.appendFileSync(logFile, line);
  } catch {
    /* logging must never crash the app */
  }
  if (!app.isPackaged) process.stdout.write(line);
}

const store = new JsonStore(app.getPath('userData'), { log });

// ---------------------------------------------------------------------------
// Window

/** @type {BrowserWindow | null} */
let win = null;
const windowStateFile = path.join(app.getPath('userData'), 'window-state.json');

function readWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(windowStateFile, 'utf8'));
    if (typeof s.width === 'number' && typeof s.height === 'number') {
      // Forget the position if that spot is no longer on any screen (e.g. a monitor was unplugged).
      const visible =
        typeof s.x === 'number' &&
        typeof s.y === 'number' &&
        screen.getAllDisplays().some(({ workArea: a }) => s.x + 80 > a.x && s.x < a.x + a.width - 80 && s.y >= a.y - 10 && s.y < a.y + a.height - 80);
      return visible ? s : { width: s.width, height: s.height, maximized: !!s.maximized };
    }
  } catch {
    /* first run */
  }
  return { width: 1200, height: 820, maximized: false };
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  try {
    const bounds = win.getNormalBounds();
    fs.writeFileSync(windowStateFile, JSON.stringify({ ...bounds, maximized: win.isMaximized() }));
  } catch {
    /* not important */
  }
}

function isTrustedSender(event) {
  const url = (event.senderFrame && event.senderFrame.url) || '';
  return url.startsWith('file://') || (DEV_URL && url.startsWith(DEV_URL));
}

function createWindow() {
  const saved = readWindowState();
  const additionalArguments = [];
  if (process.env.EVEN_KEEL_FAKE_TODAY) additionalArguments.push(`--even-keel-fake-today=${process.env.EVEN_KEEL_FAKE_TODAY}`);

  win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 360,
    minHeight: 560,
    show: false,
    title: 'Even Keel',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121715' : '#f5f4ef',
    autoHideMenuBar: true,
    icon: app.isPackaged ? undefined : path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      additionalArguments,
    },
  });
  if (saved.maximized) win.maximize();

  // Automated test runs open the window without taking keyboard focus from whatever the person is doing.
  win.once('ready-to-show', () => win && (process.env.EVEN_KEEL_E2E === '1' ? win.showInactive() : win.show()));
  win.on('close', saveWindowState);
  win.on('closed', () => {
    win = null;
  });

  // Never navigate away from the app or open other windows; send web links to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (DEV_URL && url.startsWith(DEV_URL)) return;
    event.preventDefault();
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function buildMenu() {
  const template = [
    // macOS expects the app-name menu (About, Hide, Quit) first.
    process.platform === 'darwin' ? { role: 'appMenu' } : { label: 'File', submenu: [{ role: 'quit', label: 'Exit' }] },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted sender');
    return fn(...args);
  });
}

function registerIpc() {
  handle('data:load', () => store.load());
  handle('data:save', (json) => store.save(json));
  ipcMain.on('data:save-sync', (event, json) => {
    event.returnValue = isTrustedSender(event) ? store.saveSync(json) : { ok: false };
  });

  handle('file:save', async (options) => {
    const { defaultName, content, filters } = options || {};
    if (typeof content !== 'string' || typeof defaultName !== 'string') return { ok: false, error: 'Nothing to save.' };
    const result = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath('documents'), path.basename(defaultName)),
      filters: Array.isArray(filters) ? filters : undefined,
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      await fsp.writeFile(result.filePath, content, 'utf8');
      return { ok: true, path: result.filePath };
    } catch (err) {
      log(`Export failed: ${err}`);
      return { ok: false, error: "The file couldn't be saved there. Try another folder." };
    }
  });

  handle('file:open', async (options) => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: Array.isArray(options && options.filters) ? options.filters : undefined,
    });
    if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: false, canceled: true };
    try {
      const file = result.filePaths[0];
      const stat = await fsp.stat(file);
      if (stat.size > MAX_IMPORT_BYTES) return { ok: false, error: 'That file is too large.' };
      return { ok: true, content: await fsp.readFile(file, 'utf8') };
    } catch (err) {
      log(`Open failed: ${err}`);
      return { ok: false, error: "That file couldn't be opened." };
    }
  });

  handle('app:show-data-folder', () => {
    if (fs.existsSync(store.file)) shell.showItemInFolder(store.file);
    else shell.openPath(store.dir);
  });

  handle('app:info', () => ({ version: app.getVersion(), dataPath: store.file, packaged: app.isPackaged }));

  handle('updates:get-state', () => updates.getState());
  handle('updates:check', () => updates.checkNow());
  handle('updates:download', () => updates.download());
  handle('updates:install', () => updates.install());
}

// ---------------------------------------------------------------------------
// Lifecycle

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  log(`Starting Even Keel ${app.getVersion()} (packaged: ${app.isPackaged})`);
  buildMenu();
  registerIpc();
  createWindow();
  updates.initUpdater({
    log,
    onState: (s) => {
      if (win && !win.isDestroyed()) win.webContents.send('updates:state', s);
    },
  });
});

// Make sure a save that's still being written finishes before the app exits.
let waitingForSave = false;
app.on('before-quit', (event) => {
  if (!store.isBusy() || waitingForSave) return;
  event.preventDefault();
  waitingForSave = true;
  store.idle().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  app.quit();
});
