// FMS desktop app (factory PC). One installer, no Docker:
//   1. start an embedded Postgres whose data lives in %APPDATA%/FMS/pgdata
//   2. load the base schema + run migrations (same as the VPS container does)
//   3. run the unchanged Express backend in a utility process, which also
//      serves the built frontend (FMS_STATIC_DIR)
//   4. open a window on http://127.0.0.1:<APP_PORT>
//   5. push every local change to the VPS whenever it's reachable (lib/sync.js)
//   6. queue WhatsApp alerts locally, send when online (lib/alertRelay.js)
//   7. update itself from GitHub Releases (electron-updater)
//   8. FMS menu (Alt): rebuild the online server from this PC's data (T2.8)
//   9. back up the database every 6 h and on close (lib/backup.js, T2.5)
// Steps 1-3, 5, 6 and 9 are lib/runtime.js, shared with host.js (the Windows
// service, T3.1); this file adds the window, setup screens, menu and updates.
// Once FMS runs as a service on this PC (T3.2), this app only opens a window
// on it: see bootViewer().
// The app itself talks over 127.0.0.1 only; internet is needed only for sync.
const { app, BrowserWindow, Menu, dialog, shell, utilityProcess, clipboard, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const { FactoryRuntime } = require('./lib/runtime');

const userData = app.getPath('userData');
const logDir = path.join(userData, 'logs');
fs.mkdirSync(logDir, { recursive: true });
const logStream = fs.createWriteStream(path.join(logDir, 'fms.log'), { flags: 'a' });
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  if (!logStream.writableEnded) logStream.write(line);
  process.stdout.write(line);
}

// Two copies would fight over the same Postgres data directory and port.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let updateReady = null; // version string once an update has downloaded
let quitting = false;

const runtime = new FactoryRuntime({
  dataDir: userData,
  stagedDir: path.join(__dirname, 'staged'),
  log,
  forkBackend: (modulePath, { cwd, env }) => utilityProcess.fork(modulePath, [], {
    cwd, env, stdio: 'pipe', serviceName: 'FMS backend',
  }),
  onChange: () => refreshTitle(),
  onBackendExit: (code) => {
    if (quitting) return;
    dialog.showErrorBox('FMS stopped', `The FMS server stopped unexpectedly (code ${code}).\n\nLog: ${path.join(logDir, 'fms.log')}`);
    app.quit();
  },
});
const APP_ORIGIN = runtime.appOrigin;

// The window title doubles as the sync status line.
function refreshTitle() {
  const parts = [runtime.appName, runtime.syncStatusText, updateReady && `Update ${updateReady} will install when FMS is closed`].filter(Boolean);
  if (mainWindow) mainWindow.setTitle(parts.join('  —  '));
}

// First run only: a modal asking for the Owner's one-time setup code
// (runtime.setupFromServer). Resolves 'imported', 'empty' (testing: no
// server) or 'cancelled'.
function runSetup() {
  const CHANNELS = ['setup:defaults', 'setup:import', 'setup:empty'];
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 620,
      height: 640,
      resizable: false,
      minimizable: false,
      autoHideMenuBar: true,
      title: 'FMS setup',
      webPreferences: {
        preload: path.join(__dirname, 'setup', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    let result = 'cancelled';
    const finish = (r) => { result = r; win.close(); };
    win.on('closed', () => {
      CHANNELS.forEach((ch) => ipcMain.removeHandler(ch));
      resolve(result);
    });

    ipcMain.handle('setup:defaults', () => ({ serverUrl: runtime.cfg.syncServerUrl }));
    ipcMain.handle('setup:import', async (_e, { serverUrl, code }) => {
      const progress = (msg) => { if (!win.isDestroyed()) win.webContents.send('setup:progress', msg); };
      try {
        await runtime.setupFromServer({ serverUrl, code, progress });
        finish('imported');
        return { ok: true };
      } catch (err) {
        log(`setup: import failed: ${err.message}`);
        return { ok: false, error: err.message };
      }
    });
    ipcMain.handle('setup:empty', () => {
      runtime.setupEmpty();
      finish('empty');
      return { ok: true };
    });

    win.loadFile(path.join(__dirname, 'setup', 'index.html'));
  });
}

// FMS menu -> "Rebuild the online server…" (T2.8, D17): runtime.rebuildServer
// with progress in a window that can't be closed while it runs.
let rebuildWindow = null;
function runRebuild() {
  if (rebuildWindow) { rebuildWindow.focus(); return; }
  const win = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    width: 620,
    height: 720,
    resizable: false,
    minimizable: false,
    autoHideMenuBar: true,
    title: 'Rebuild the online server',
    webPreferences: {
      preload: path.join(__dirname, 'setup', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  rebuildWindow = win;
  let busy = false;
  win.on('close', (event) => {
    if (busy) {
      event.preventDefault();
      dialog.showMessageBox(win, { type: 'info', message: 'Still sending data to the server.', detail: 'Wait until it says it is done.' });
    }
  });
  win.on('closed', () => {
    ['rebuild:defaults', 'rebuild:run'].forEach((ch) => ipcMain.removeHandler(ch));
    rebuildWindow = null;
  });

  ipcMain.handle('rebuild:defaults', () => ({ serverUrl: runtime.cfg.syncServerUrl }));
  ipcMain.handle('rebuild:run', async (_e, { serverUrl, code }) => {
    const progress = (msg) => { if (!win.isDestroyed()) win.webContents.send('rebuild:progress', msg); };
    busy = true;
    try {
      const { sent, removed } = await runtime.rebuildServer({ serverUrl, code, progress });
      return { ok: true, sent, removed };
    } catch (err) {
      log(`rebuild: failed: ${err.message}`);
      return { ok: false, error: err.message };
    } finally {
      busy = false;
    }
  });

  win.loadFile(path.join(__dirname, 'setup', 'rebuild.html'));
}

// FMS menu -> Backups (T2.5). The folder should be on a second drive (D10);
// "Copy … to a USB drive" is the weekly off-site copy (D15).
async function backupAction(what) {
  const { backups, cfg } = runtime;
  const info = (message, detail) => dialog.showMessageBox(mainWindow, { type: 'info', title: 'Backups', message, detail });
  const fail = (err) => dialog.showMessageBox(mainWindow, { type: 'error', title: 'Backups', message: 'That did not work.', detail: err.message });
  try {
    if (what === 'now') {
      const r = await backups.run('menu');
      await info('Backup done.', `${r.file}\n${r.tables} tables, ${r.rows} rows`);
    } else if (what === 'drill') {
      const r = await backups.drill();
      if (r.ok) await info('The newest backup restores correctly.', `${path.basename(r.file)}\n${r.tables} tables, ${r.rows} rows — every table's row count matches.`);
      else await fail(new Error(`Restored, but these tables differ:\n${r.mismatches.map((m) => `${m.table}: ${m.expected} in the backup, ${m.restored} restored`).join('\n')}`));
    } else if (what === 'copy') {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Copy the newest backup to…', properties: ['openDirectory', 'createDirectory'] });
      if (canceled || !filePaths[0]) return;
      await info('Copied.', backups.copyNewest(filePaths[0]));
    } else if (what === 'folder') {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Keep backups in… (choose a folder on another drive)', defaultPath: runtime.backupDir(), properties: ['openDirectory', 'createDirectory'] });
      if (canceled || !filePaths[0]) return;
      cfg.backupDir = filePaths[0];
      runtime.saveConfig();
      log(`backup: folder is now ${cfg.backupDir}`);
      const r = await backups.run('new folder');
      runtime.statusReporter?.refresh();
      await info('Backups now go to this folder.', `First backup done:\n${r.file}`);
    } else if (what === 'open') {
      fs.mkdirSync(runtime.backupDir(), { recursive: true });
      await shell.openPath(runtime.backupDir());
    }
  } catch (err) {
    runtime.statusReporter?.refresh();
    await fail(err);
  }
}

function setupMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'FMS',
      submenu: [
        { label: 'Rebuild the online server…', click: () => runRebuild() },
        {
          label: 'Backups',
          submenu: [
            { label: 'Back up now', click: () => backupAction('now') },
            { label: 'Test the newest backup (restore drill)', click: () => backupAction('drill') },
            { label: 'Copy the newest backup to a USB drive…', click: () => backupAction('copy') },
            { type: 'separator' },
            { label: 'Choose the backup folder…', click: () => backupAction('folder') },
            { label: 'Open the backup folder', click: () => backupAction('open') },
          ],
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]));
}

// Downloads in the background; installs only from our own before-quit, after
// Postgres has shut down cleanly (autoInstallOnAppQuit would race it).
function setupAutoUpdate() {
  if (!app.isPackaged) return;
  // electron-builder only writes app-update.yml when package.json has a
  // "publish" target; without one there is nowhere to check, so stay idle.
  if (!fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) {
    log('[update] no publish target configured, automatic updates off');
    return;
  }
  autoUpdater.logger = {
    info: (m) => log(`[update] ${m}`),
    warn: (m) => log(`[update:warn] ${m}`),
    error: (m) => log(`[update:err] ${m}`),
    debug: () => {},
  };
  // Testing only: point at a local folder instead of the VPS.
  if (process.env.FMS_UPDATE_URL) autoUpdater.setFeedURL({ provider: 'generic', url: process.env.FMS_UPDATE_URL });
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.disableWebInstaller = true; // we ship the full NSIS installer
  autoUpdater.on('update-downloaded', async ({ version }) => {
    if (updateReady) return;
    updateReady = version;
    refreshTitle();
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'FMS update',
      message: `FMS ${version} is ready to install.`,
      detail: 'Restart now, or it will install the next time FMS is closed. Your data is not affected.',
      buttons: ['Restart now', 'Later'],
      defaultId: 1,
      noLink: true,
    });
    if (response === 0) app.quit();
  });
  const check = () => autoUpdater.checkForUpdates().catch((err) => log(`[update] check failed: ${err.message}`));
  check();
  setInterval(check, 4 * 3600_000);
}

const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html><body style="margin:0;height:100vh;display:grid;place-items:center;font-family:Segoe UI,sans-serif;background:#f5f5f4;color:#292524">
<div style="text-align:center"><div style="font-size:22px;font-weight:600">FMS</div>
<div style="margin-top:8px;color:#78716c">Starting database…</div></div></body></html>`)}`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    title: 'FMS',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.maximize();
  mainWindow.show();
  mainWindow.loadURL(LOADING_HTML);

  // Links that open a new tab (WhatsApp, maps, the public site) go to the
  // normal browser instead of a bare Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_ORIGIN)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  // Keep our own title (sync status) instead of the page's <title>.
  mainWindow.on('page-title-updated', (event) => event.preventDefault());
  refreshTitle();
  mainWindow.on('closed', () => { mainWindow = null; });
}

// Written by service/install-service.ps1 (T3.2): FMS runs as the Windows
// service, which owns the database and does the uploads. A second copy here
// would fight it for the ports, or — worse — run the out-of-date data left in
// %APPDATA%\FMS. So: just a window on the service's dashboard. No updates
// either; the service is updated with service/update-service.ps1 (D4).
const SERVICE_MARKER = process.env.FMS_SERVICE_MARKER
  || (process.env.PROGRAMDATA ? path.join(process.env.PROGRAMDATA, 'FMS-service.json') : null);
function serviceInfo() {
  try { return JSON.parse(fs.readFileSync(SERVICE_MARKER, 'utf8')); } catch { return null; }
}
const NOT_RUNNING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html><body style="margin:0;height:100vh;display:grid;place-items:center;font-family:Segoe UI,sans-serif;background:#f5f5f4;color:#292524">
<div style="text-align:center;max-width:520px"><div style="font-size:22px;font-weight:600">FMS is not answering</div>
<div style="margin-top:8px;color:#78716c">FMS runs as a Windows service on this PC. It may still be starting; if this stays, restart the PC
or start the "FMS" service in Services. This window keeps trying.</div></div></body></html>`)}`;

async function bootViewer(svc) {
  const url = (svc.url || APP_ORIGIN).replace(/\/$/, '');
  log(`service mode: FMS runs as the Windows service "${svc.serviceName}" (data ${svc.dataDir}); this window only opens ${url}`);
  createWindow();
  let warned = false;
  for (;;) {
    try {
      const res = await fetch(`${url}/branding`, { signal: AbortSignal.timeout(3000) });
      runtime.appName = (await res.json()).name || 'FMS';
      break;
    } catch {
      if (!warned && mainWindow) { warned = true; mainWindow.loadURL(NOT_RUNNING_HTML); }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  refreshTitle();
  if (mainWindow) await mainWindow.loadURL(`${url}/login`);
}

async function boot() {
  const svc = serviceInfo();
  if (svc) return bootViewer(svc);
  // install-service.ps1 copied this folder to the service and left this note:
  // what is here is out of date and must never run (or upload) again.
  if (fs.existsSync(path.join(userData, 'MOVED-TO-SERVICE.txt'))) {
    throw new Error(`The FMS data on this PC was moved to the FMS Windows service, and ${userData} is the old, out-of-date copy, so FMS will not start on it. Reinstall the service (service\\install-service.ps1), or ask for help.`);
  }
  createWindow();
  runtime.loadConfig();
  runtime.applySetup();

  await runtime.checkPorts();
  await runtime.startDatabase();

  if (!runtime.cfg.setupDone) {
    const result = await runSetup();
    log(`setup: ${result}`);
    if (result === 'cancelled') { app.quit(); return; }
  }

  const owner = await runtime.startServices();
  if (mainWindow) await mainWindow.loadURL(`${APP_ORIGIN}/login`);
  setupAutoUpdate();
  setupMenu();

  if (owner) {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'FMS is ready',
      message: 'An owner account was created for this computer.',
      detail: `Username: ${owner.username}\nPassword: ${owner.password}\n\nThis is shown only once. Log in, then change the password from the Users page.`,
      buttons: ['Copy password', 'OK'],
      defaultId: 0,
      noLink: true,
    });
    if (response === 0) clipboard.writeText(owner.password);
  }
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => gotLock && boot().catch((err) => {
  log(`startup failed: ${err.stack || err.message}`);
  dialog.showErrorBox('FMS could not start', `${err.message}\n\nLog: ${path.join(logDir, 'fms.log')}`);
  app.quit();
}));

app.on('window-all-closed', () => app.quit());

// lib/runtime.js stop(): backend, final upload (at most 10 s), closing
// backup, then a clean Postgres shutdown, before exiting.
app.on('before-quit', (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  (async () => {
    try {
      await runtime.stop({ uploadMs: 10_000 });
    } catch (err) {
      log(`shutdown error: ${err.message}`);
    } finally {
      if (updateReady) {
        log(`installing update ${updateReady}`);
        logStream.end();
        autoUpdater.quitAndInstall(true, true); // silent, reopen FMS afterwards
      } else {
        logStream.end();
        app.exit(0);
      }
    }
  })();
});
