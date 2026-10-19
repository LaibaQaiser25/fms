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
// The app itself talks over 127.0.0.1 only; internet is needed only for sync.
const { app, BrowserWindow, Menu, dialog, shell, utilityProcess, clipboard, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { APP_PORT, ALERT_PORT } = require('./lib/ports');
const { startPostgres, stopPostgres, prepareSchema, ensureOwner, checkDurability } = require('./lib/database');
const { installSyncCapture } = require('./lib/syncCapture');
const { SyncWorker } = require('./lib/sync');
const { registerWriter, downloadSnapshot, importSnapshot } = require('./lib/snapshot');
const { resendAndPrune } = require('./lib/rebuild');
const { AlertRelay } = require('./lib/alertRelay');
const { StatusReporter } = require('./lib/status');
const { BackupScheduler } = require('./lib/backup');

const DEFAULT_SYNC_SERVER = 'https://api.ittefaqbuilder.com';

const STAGED_DIR = path.join(__dirname, 'staged');
const BACKEND_DIR = path.join(STAGED_DIR, 'backend');
const FRONTEND_DIR = path.join(STAGED_DIR, 'frontend');
const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;

const userData = app.getPath('userData');
const pgDataDir = path.join(userData, 'pgdata');
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

// Per-install secrets, generated once and kept next to the data.
function loadConfig() {
  const file = path.join(userData, 'config.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  let changed = false;
  if (!cfg.pgPassword) { cfg.pgPassword = crypto.randomBytes(24).toString('hex'); changed = true; }
  if (!cfg.jwtSecret) { cfg.jwtSecret = crypto.randomBytes(32).toString('hex'); changed = true; }
  // writerId + uploadKey come from registering with a setup code (runSetup);
  // without them, changes still pile up in sync_outbox, never uploaded.
  if (!cfg.syncServerUrl) { cfg.syncServerUrl = DEFAULT_SYNC_SERVER; changed = true; }
  // Shared only between the backend and the local alert relay.
  if (!cfg.relaySecret) { cfg.relaySecret = crypto.randomBytes(24).toString('hex'); changed = true; }
  if (changed) saveConfig(cfg);
  return cfg;
}

function saveConfig(cfg) {
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify(cfg, null, 2));
}

// The status bar on every terminal (T1.5) reads this through the backend's
// GET /status (lib/status.js keeps it current and sends the heartbeat).
const statusFile = path.join(userData, 'status.json');

// Setup name and logo from Offline Setup on the online dashboard (T1.2): the
// window title uses the name, and the login screen reads both through the
// backend's GET /branding, which serves this file.
const brandingFile = path.join(userData, 'branding.json');
let appName = 'FMS';
function applySetup(cfg, setup) {
  if (setup !== undefined && JSON.stringify(setup) !== JSON.stringify(cfg.setup)) {
    cfg.setup = setup;
    saveConfig(cfg);
    log(`config: setup name ${setup?.name ? `"${setup.name}"` : 'not set'}, ${setup?.logo ? 'own logo' : 'default logo'}`);
  }
  appName = cfg.setup?.name || 'FMS';
  fs.writeFileSync(brandingFile, JSON.stringify({ name: cfg.setup?.name || null, logo: cfg.setup?.logo || null }));
  refreshTitle();
}

// First run only: a modal asking for the Owner's one-time setup code. This PC
// registers as the main PC (its own upload key, never typed by anyone), then
// copies the server's data into the local database (lib/snapshot.js).
// Resolves 'imported', 'empty' (testing: no server) or 'cancelled'.
// "Start empty" never registers, so such a PC never uploads.
function runSetup({ cfg, databaseUrl }) {
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

    ipcMain.handle('setup:defaults', () => ({ serverUrl: cfg.syncServerUrl }));
    ipcMain.handle('setup:import', async (_e, { serverUrl, code }) => {
      const progress = (msg) => { if (!win.isDestroyed()) win.webContents.send('setup:progress', msg); };
      const download = () => downloadSnapshot({ serverUrl, uploadKey: cfg.uploadKey });
      try {
        let snapshot = null;
        // An earlier attempt may have registered and then failed to download;
        // its code is used up, so try that key first.
        if (cfg.uploadKey && cfg.syncServerUrl === serverUrl) {
          progress('Downloading data from the server…');
          try {
            snapshot = await download();
          } catch (err) {
            if (!err.notRegistered) throw err;
            delete cfg.uploadKey;
            delete cfg.writerId;
            saveConfig(cfg);
          }
        }
        if (!snapshot) {
          progress('Registering this computer as the main PC…');
          const writerId = crypto.randomUUID();
          const { uploadKey, setup } = await registerWriter({ serverUrl, code, writerId });
          // Saved straight away: the code is now used up.
          Object.assign(cfg, { syncServerUrl: serverUrl, writerId, uploadKey });
          saveConfig(cfg);
          applySetup(cfg, setup);
          log(`setup: registered as main PC ${writerId}`);
          progress('Downloading data from the server…');
          snapshot = await download();
        }
        progress('Saving data on this computer…');
        await importSnapshot({ databaseUrl, snapshot, log });
        cfg.setupDone = true;
        saveConfig(cfg);
        finish('imported');
        return { ok: true };
      } catch (err) {
        log(`setup: import failed: ${err.message}`);
        return { ok: false, error: err.message };
      }
    });
    ipcMain.handle('setup:empty', () => {
      cfg.setupDone = true;
      saveConfig(cfg);
      finish('empty');
      return { ok: true };
    });

    win.loadFile(path.join(__dirname, 'setup', 'index.html'));
  });
}

// FMS menu -> "Rebuild the online server…" (T2.8, D17): the server was lost
// or restored from an old backup. Register again with a setup code made
// there (scripts/createSetupCode.js), keeping this PC's writer_id and all of
// its data — no snapshot — then resend every row and prune what the server
// has that this PC doesn't (lib/rebuild.js).
let rebuildWindow = null;
function runRebuild({ cfg, databaseUrl }) {
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

  ipcMain.handle('rebuild:defaults', () => ({ serverUrl: cfg.syncServerUrl }));
  ipcMain.handle('rebuild:run', async (_e, { serverUrl, code }) => {
    const progress = (msg) => { if (!win.isDestroyed()) win.webContents.send('rebuild:progress', msg); };
    busy = true;
    try {
      progress('Registering this computer with the server again…');
      const writerId = cfg.writerId || crypto.randomUUID();
      const { uploadKey, setup } = await registerWriter({ serverUrl, code, writerId });
      Object.assign(cfg, { syncServerUrl: serverUrl, writerId, uploadKey });
      saveConfig(cfg);
      applySetup(cfg, setup);
      log(`rebuild: registered again as main PC ${writerId}, resending everything`);
      await startUploads({ cfg, databaseUrl });
      const { queued, deleted } = await resendAndPrune({
        databaseUrl, worker: syncWorker, serverUrl, uploadKey, log, progress,
      });
      const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
      log(`rebuild: done — ${sum(queued)} row(s) sent, ${sum(deleted)} removed on the server`);
      return { ok: true, sent: sum(queued), removed: sum(deleted) };
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
const backupDirOf = (cfg) => cfg.backupDir || path.join(userData, 'backups');
async function backupAction(what, cfg) {
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
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Keep backups in… (choose a folder on another drive)', defaultPath: backupDirOf(cfg), properties: ['openDirectory', 'createDirectory'] });
      if (canceled || !filePaths[0]) return;
      cfg.backupDir = filePaths[0];
      saveConfig(cfg);
      log(`backup: folder is now ${cfg.backupDir}`);
      const r = await backups.run('new folder');
      statusReporter?.refresh();
      await info('Backups now go to this folder.', `First backup done:\n${r.file}`);
    } else if (what === 'open') {
      fs.mkdirSync(backupDirOf(cfg), { recursive: true });
      await shell.openPath(backupDirOf(cfg));
    }
  } catch (err) {
    statusReporter?.refresh();
    await fail(err);
  }
}

function setupMenu({ cfg, databaseUrl }) {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'FMS',
      submenu: [
        { label: 'Rebuild the online server…', click: () => runRebuild({ cfg, databaseUrl }) },
        {
          label: 'Backups',
          submenu: [
            { label: 'Back up now', click: () => backupAction('now', cfg) },
            { label: 'Test the newest backup (restore drill)', click: () => backupAction('drill', cfg) },
            { label: 'Copy the newest backup to a USB drive…', click: () => backupAction('copy', cfg) },
            { type: 'separator' },
            { label: 'Choose the backup folder…', click: () => backupAction('folder', cfg) },
            { label: 'Open the backup folder', click: () => backupAction('open', cfg) },
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

function portIsFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => srv.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`${APP_ORIGIN}/`, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error('backend did not start in time'));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

let backend = null;
let mainWindow = null;
let syncWorker = null;
let alertRelay = null;
let statusReporter = null;
let backups = null;
let lastSync = null;          // SyncWorker's last report, or { state: 'not_registered' }
let tablesWithoutPk = [];
let unsafeSettings = [];
let updateReady = null; // version string once an update has downloaded
let quitting = false;

// The window title doubles as the sync status line.
let syncStatusText = '';
function refreshTitle() {
  const parts = [appName, syncStatusText, updateReady && `Update ${updateReady} will install when FMS is closed`].filter(Boolean);
  if (mainWindow) mainWindow.setTitle(parts.join('  —  '));
}

// WhatsApp target etc. come from the server (GET /sync/config), so changing
// them there reaches the factory without touching this PC. Last known values
// are kept in config.json for offline starts.
async function refreshServerConfig(cfg) {
  try {
    const res = await fetch(`${cfg.syncServerUrl.replace(/\/$/, '')}/sync/config`, {
      headers: { 'X-Upload-Key': cfg.uploadKey },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`server replied ${res.status}`);
    const { whatsapp, reason, setup } = await res.json();
    if (JSON.stringify(whatsapp) !== JSON.stringify(cfg.whatsapp) || (reason || null) !== (cfg.whatsappReason || null)) {
      cfg.whatsapp = whatsapp;
      cfg.whatsappReason = whatsapp ? null : reason || null;
      saveConfig(cfg);
      log(`config: WhatsApp alerts ${whatsapp ? 'enabled' : `not configured on the server (${reason || 'no reason given'})`}`);
    }
    applySetup(cfg, setup);
  } catch (err) {
    log(`config: could not refresh from server (${err.cause?.code || err.message})`);
  }
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

function ago(date) {
  if (!date) return 'never';
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function describeSync({ state, pending, quarantined, lastSyncedAt }) {
  const waiting = pending === 1 ? '1 change waiting' : `${pending} changes waiting`;
  // Changes the server refused (T1.4); the Owner retries them on the Sync issues page.
  const setAside = quarantined ? `  —  ${quarantined} change${quarantined === 1 ? '' : 's'} refused by the server (see Sync issues)` : '';
  return describeSyncState({ state, pending, lastSyncedAt, waiting }) + setAside;
}

function describeSyncState({ state, pending, lastSyncedAt, waiting }) {
  if (state === 'ok') return pending ? `Uploading ${waiting}` : `All changes uploaded (last upload ${ago(lastSyncedAt)})`;
  if (state === 'offline') return `Offline — ${waiting}, will upload when internet is back`;
  if (state === 'blocked_not_writer') return `NOT UPLOADING: this PC is no longer the registered main PC — ${waiting}`;
  return `Sync problem — ${waiting} (see log)`;
}

function startBackend({ databaseUrl, jwtSecret, relaySecret }) {
  backend = utilityProcess.fork(path.join(BACKEND_DIR, 'server.js'), [], {
    cwd: BACKEND_DIR,
    stdio: 'pipe',
    serviceName: 'FMS backend',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: databaseUrl,
      PORT: String(APP_PORT),
      HOST: '127.0.0.1',
      JWT_SECRET: jwtSecret,
      FRONTEND_URL: APP_ORIGIN,
      FMS_STATIC_DIR: FRONTEND_DIR,
      // Setup name + logo for the login screen (GET /branding)
      FMS_BRANDING_FILE: brandingFile,
      // Sync status for the status bar (GET /status)
      FMS_STATUS_FILE: statusFile,
      // Factory-only routes, e.g. retrying changes the server refused (/api/sync-quarantine)
      FMS_FACTORY: '1',
      // Reports and digests go out from the online server (T2.1, its
      // REPORT_SENDER_MODE=send_only), even with this PC off; exactly one
      // scheduler, so none here (T2.2).
      DISABLE_CRON: 'true',
      TZ: 'Asia/Karachi',
      // WhatsApp alerts go to the local relay, which queues them offline.
      N8N_WEBHOOK_URL: `http://127.0.0.1:${ALERT_PORT}/alert`,
      N8N_WEBHOOK_SECRET: relaySecret,
    },
  });
  backend.stdout.on('data', (d) => log(`[backend] ${String(d).trimEnd()}`));
  backend.stderr.on('data', (d) => log(`[backend:err] ${String(d).trimEnd()}`));
  backend.on('exit', (code) => {
    backend = null;
    if (quitting) return;
    log(`backend exited with code ${code}`);
    dialog.showErrorBox('FMS stopped', `The FMS server stopped unexpectedly (code ${code}).\n\nLog: ${path.join(logDir, 'fms.log')}`);
    app.quit();
  });
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

// The SyncWorker and the StatusReporter (heartbeat) with the current upload
// key. Called at startup, and again after the rebuild registers a new key.
let configTimer = null;
async function startUploads({ cfg, databaseUrl }) {
  if (syncWorker) await syncWorker.stop();
  if (statusReporter) await statusReporter.stop();
  syncWorker = null;
  if (cfg.uploadKey) {
    syncWorker = new SyncWorker({
      databaseUrl,
      serverUrl: cfg.syncServerUrl,
      uploadKey: cfg.uploadKey,
      log,
      onStatus: (status) => {
        lastSync = status;
        syncStatusText = describeSync(status);
        refreshTitle();
        statusReporter?.refresh();
      },
    });
    syncWorker.start();
    refreshServerConfig(cfg);
    if (!configTimer) configTimer = setInterval(() => refreshServerConfig(cfg), 3600_000);
  } else {
    lastSync = { state: 'not_registered' };
    syncStatusText = 'Upload to server not set up';
    refreshTitle();
    log('sync: this PC is not registered (no uploadKey in config.json), changes are kept locally');
  }
  statusReporter = new StatusReporter({
    databaseUrl,
    statusFile,
    getSync: () => lastSync,
    relay: alertRelay,
    backup: backups,
    tablesWithoutPk,
    unsafeSettings,
    upload: cfg.uploadKey ? { serverUrl: cfg.syncServerUrl, uploadKey: cfg.uploadKey } : null,
    log,
    // Replaced by another PC while idle: stop the worker as if an upload had been refused.
    onNotWriter: (message) => syncWorker?.markNotWriter(message),
  });
  statusReporter.start();
}

async function boot() {
  createWindow();
  const cfg = loadConfig();
  applySetup(cfg);

  for (const port of [APP_PORT, ALERT_PORT]) {
    if (!(await portIsFree(port))) throw new Error(`Port ${port} is already in use by another program.`);
  }

  const databaseUrl = await startPostgres({
    dataDir: pgDataDir,
    password: cfg.pgPassword,
    log,
  });
  unsafeSettings = await checkDurability({ databaseUrl, log });
  await prepareSchema({ databaseUrl, backendDir: BACKEND_DIR, log });
  // Before ensureOwner, so even the very first account reaches the VPS.
  ({ tablesWithoutPk } = await installSyncCapture({ databaseUrl, log }));

  if (!cfg.setupDone) {
    const result = await runSetup({ cfg, databaseUrl });
    log(`setup: ${result}`);
    if (result === 'cancelled') { app.quit(); return; }
  }
  // Only creates an account when there are none (i.e. "start empty").
  const owner = await ensureOwner({ databaseUrl });

  backups = new BackupScheduler({ databaseUrl, getDir: () => backupDirOf(cfg), pgDataDir, log });
  backups.start();

  alertRelay = new AlertRelay({
    databaseUrl,
    relaySecret: cfg.relaySecret,
    getTarget: () => cfg.whatsapp || null,
    // The server's reason for no target (T1.7), or why we don't know one yet
    getNoTargetReason: () => cfg.whatsappReason
      || (cfg.uploadKey ? 'no WhatsApp settings received from the server yet' : 'this PC is not registered with the server'),
    log,
  });
  await alertRelay.start();

  startBackend({ databaseUrl, jwtSecret: cfg.jwtSecret, relaySecret: cfg.relaySecret });
  await waitForServer();
  if (mainWindow) await mainWindow.loadURL(`${APP_ORIGIN}/login`);
  setupAutoUpdate();

  await startUploads({ cfg, databaseUrl });
  setupMenu({ cfg, databaseUrl });

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

// Stop the backend, then shut Postgres down cleanly before exiting, so the
// data directory is never left mid-write.
app.on('before-quit', (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  (async () => {
    try {
      // One last upload, at most 10 s, so a sale made just before closing
      // usually reaches the server now rather than on the next start.
      if (syncWorker) {
        await syncWorker.finalUpload(10_000).catch((err) => log(`sync: final upload failed: ${err.message}`));
        await syncWorker.stop();
      }
      if (statusReporter) await statusReporter.stop();
      if (backend) backend.kill();
      // After the backend, so nothing changes during the dump.
      if (backups) await backups.stop({ timeoutMs: 60_000 });
      if (alertRelay) await alertRelay.stop();
      await stopPostgres({ dataDir: pgDataDir, log });
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
