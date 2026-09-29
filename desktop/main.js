// FMS desktop app (factory PC). One installer, no Docker:
//   1. start an embedded Postgres whose data lives in %APPDATA%/FMS/pgdata
//   2. load the base schema + run migrations (same as the VPS container does)
//   3. run the unchanged Express backend in a utility process, which also
//      serves the built frontend (FMS_STATIC_DIR)
//   4. open a window on http://127.0.0.1:<APP_PORT>
// Everything talks over 127.0.0.1 only; nothing here needs internet.
const { app, BrowserWindow, dialog, shell, utilityProcess, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { APP_PORT } = require('./lib/ports');
const { startPostgres, stopPostgres, prepareSchema, ensureOwner } = require('./lib/database');

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
  logStream.write(line);
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
  if (changed) fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return cfg;
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
let quitting = false;

function startBackend({ databaseUrl, jwtSecret }) {
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
      TZ: 'Asia/Karachi',
      // No N8N_WEBHOOK_URL yet: WhatsApp alerts are logged and skipped until
      // the offline alert queue exists.
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
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function boot() {
  createWindow();
  const cfg = loadConfig();

  if (!(await portIsFree(APP_PORT))) {
    throw new Error(`Port ${APP_PORT} is already in use by another program.`);
  }

  const databaseUrl = await startPostgres({
    dataDir: pgDataDir,
    password: cfg.pgPassword,
    log,
  });
  await prepareSchema({ databaseUrl, backendDir: BACKEND_DIR, log });
  const owner = await ensureOwner({ databaseUrl });

  startBackend({ databaseUrl, jwtSecret: cfg.jwtSecret });
  await waitForServer();
  if (mainWindow) await mainWindow.loadURL(`${APP_ORIGIN}/login`);

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
      if (backend) backend.kill();
      await stopPostgres({ dataDir: pgDataDir, log });
    } catch (err) {
      log(`shutdown error: ${err.message}`);
    } finally {
      logStream.end();
      app.exit(0);
    }
  })();
});
