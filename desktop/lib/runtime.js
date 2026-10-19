// Everything the factory PC runs, without Electron (T3.1): Postgres, schema,
// change capture, the WhatsApp relay, the backend, uploads + heartbeat,
// backups, and the shutdown order. Used by main.js (the Electron app: adds the
// window, setup screens, menu and updates) and host.js (the Windows service).
//
// dataDir holds pgdata/, config.json, logs, status.json, branding.json and
// backups/: %APPDATA%\FMS for the app, FMS_DATA_DIR (%PROGRAMDATA%\FMS) for
// the service.
const fs = require('fs');
const net = require('net');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { APP_PORT, ALERT_PORT } = require('./ports');
const { startPostgres, stopPostgres, prepareSchema, ensureOwner, checkDurability } = require('./database');
const { installSyncCapture } = require('./syncCapture');
const { SyncWorker } = require('./sync');
const { registerWriter, downloadSnapshot, importSnapshot } = require('./snapshot');
const { resendAndPrune } = require('./rebuild');
const { AlertRelay } = require('./alertRelay');
const { StatusReporter } = require('./status');
const { BackupScheduler } = require('./backup');

const DEFAULT_SYNC_SERVER = 'https://api.ittefaqbuilder.com';

function portIsFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => srv.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
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

function describeSyncState({ state, pending, lastSyncedAt, waiting }) {
  if (state === 'ok') return pending ? `Uploading ${waiting}` : `All changes uploaded (last upload ${ago(lastSyncedAt)})`;
  if (state === 'offline') return `Offline — ${waiting}, will upload when internet is back`;
  if (state === 'blocked_not_writer') return `NOT UPLOADING: this PC is no longer the registered main PC — ${waiting}`;
  return `Sync problem — ${waiting} (see log)`;
}

function describeSync({ state, pending, quarantined, lastSyncedAt }) {
  const waiting = pending === 1 ? '1 change waiting' : `${pending} changes waiting`;
  // Changes the server refused (T1.4); the Owner retries them on the Sync issues page.
  const setAside = quarantined ? `  —  ${quarantined} change${quarantined === 1 ? '' : 's'} refused by the server (see Sync issues)` : '';
  return describeSyncState({ state, pending, lastSyncedAt, waiting }) + setAside;
}

class FactoryRuntime {
  //   stagedDir: desktop/staged (backend/ + frontend/)
  //   forkBackend(modulePath, { cwd, env }) -> child with stdout, stderr,
  //     on('exit', code) and kill(): utilityProcess in the app, child_process
  //     in the service
  //   bindHost: where the backend listens — 127.0.0.1 in the app (F9); the
  //     service may open it to the factory network (T3.3). Postgres and the
  //     relay stay on 127.0.0.1 always.
  //   lanOrigins: extra dashboard origins for CORS (T3.3)
  //   detachedPostgres: start Postgres outside this process's console (service)
  //   onChange(): the sync line or setup name changed (window title)
  //   onBackendExit(code): the backend stopped by itself
  constructor({ dataDir, stagedDir, log, forkBackend, bindHost = '127.0.0.1', lanOrigins = [],
    detachedPostgres = false, onChange = () => {}, onBackendExit = () => {} }) {
    Object.assign(this, { dataDir, stagedDir, log, forkBackend, bindHost, lanOrigins, detachedPostgres, onChange, onBackendExit });
    this.backendDir = path.join(stagedDir, 'backend');
    this.frontendDir = path.join(stagedDir, 'frontend');
    this.pgDataDir = path.join(dataDir, 'pgdata');
    this.statusFile = path.join(dataDir, 'status.json');
    this.brandingFile = path.join(dataDir, 'branding.json');
    this.appOrigin = `http://127.0.0.1:${APP_PORT}`;
    this.cfg = null;
    this.databaseUrl = null;
    this.backend = null;
    this.syncWorker = null;
    this.statusReporter = null;
    this.alertRelay = null;
    this.backups = null;
    this.lastSync = null;          // SyncWorker's last report, or { state: 'not_registered' }
    this.syncStatusText = '';
    this.appName = 'FMS';
    this.tablesWithoutPk = [];
    this.unsafeSettings = [];
    this.configTimer = null;
    this.stopping = false;
  }

  // Per-install secrets, generated once and kept next to the data.
  loadConfig() {
    const file = path.join(this.dataDir, 'config.json');
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
    let changed = false;
    if (!cfg.pgPassword) { cfg.pgPassword = crypto.randomBytes(24).toString('hex'); changed = true; }
    if (!cfg.jwtSecret) { cfg.jwtSecret = crypto.randomBytes(32).toString('hex'); changed = true; }
    // writerId + uploadKey come from registering with a setup code
    // (setupFromServer); without them, changes still pile up in sync_outbox,
    // never uploaded.
    if (!cfg.syncServerUrl) { cfg.syncServerUrl = DEFAULT_SYNC_SERVER; changed = true; }
    // Shared only between the backend and the local alert relay.
    if (!cfg.relaySecret) { cfg.relaySecret = crypto.randomBytes(24).toString('hex'); changed = true; }
    this.cfg = cfg;
    if (changed) this.saveConfig();
    return cfg;
  }

  saveConfig() {
    const file = path.join(this.dataDir, 'config.json');
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(this.cfg, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  }

  backupDir() {
    return this.cfg.backupDir || path.join(this.dataDir, 'backups');
  }

  // Setup name and logo from Offline Setup on the online dashboard (T1.2):
  // the window title uses the name, and the login screen reads both through
  // the backend's GET /branding, which serves branding.json.
  applySetup(setup) {
    const { cfg } = this;
    if (setup !== undefined && JSON.stringify(setup) !== JSON.stringify(cfg.setup)) {
      cfg.setup = setup;
      this.saveConfig();
      this.log(`config: setup name ${setup?.name ? `"${setup.name}"` : 'not set'}, ${setup?.logo ? 'own logo' : 'default logo'}`);
    }
    this.appName = cfg.setup?.name || 'FMS';
    fs.writeFileSync(this.brandingFile, JSON.stringify({ name: cfg.setup?.name || null, logo: cfg.setup?.logo || null }));
    this.onChange();
  }

  // WhatsApp target etc. come from the server (GET /sync/config), so
  // changing them there reaches the factory without touching this PC. Last
  // known values are kept in config.json for offline starts.
  async refreshServerConfig() {
    const { cfg } = this;
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
        this.saveConfig();
        this.log(`config: WhatsApp alerts ${whatsapp ? 'enabled' : `not configured on the server (${reason || 'no reason given'})`}`);
      }
      this.applySetup(setup);
    } catch (err) {
      this.log(`config: could not refresh from server (${err.cause?.code || err.message})`);
    }
  }

  async checkPorts() {
    for (const port of [APP_PORT, ALERT_PORT]) {
      if (!(await portIsFree(port))) throw new Error(`Port ${port} is already in use by another program.`);
    }
  }

  // Postgres, schema, change capture. Enough for the first-run setup.
  async startDatabase() {
    this.databaseUrl = await startPostgres({
      dataDir: this.pgDataDir,
      password: this.cfg.pgPassword,
      log: this.log,
      detached: this.detachedPostgres,
    });
    this.unsafeSettings = await checkDurability({ databaseUrl: this.databaseUrl, log: this.log });
    await prepareSchema({ databaseUrl: this.databaseUrl, backendDir: this.backendDir, log: this.log });
    // Before ensureOwner, so even the very first account reaches the VPS.
    ({ tablesWithoutPk: this.tablesWithoutPk } = await installSyncCapture({ databaseUrl: this.databaseUrl, log: this.log }));
  }

  // First run: register this PC as the main PC with the Owner's one-time
  // setup code (its own upload key, never typed by anyone), then copy the
  // server's data into the local database.
  async setupFromServer({ serverUrl, code, progress = () => {} }) {
    const { cfg } = this;
    const download = () => downloadSnapshot({ serverUrl, uploadKey: cfg.uploadKey });
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
        this.saveConfig();
      }
    }
    if (!snapshot) {
      progress('Registering this computer as the main PC…');
      const writerId = crypto.randomUUID();
      const { uploadKey, setup } = await registerWriter({ serverUrl, code, writerId });
      // Saved straight away: the code is now used up.
      Object.assign(cfg, { syncServerUrl: serverUrl, writerId, uploadKey });
      this.saveConfig();
      this.applySetup(setup);
      this.log(`setup: registered as main PC ${writerId}`);
      progress('Downloading data from the server…');
      snapshot = await download();
    }
    progress('Saving data on this computer…');
    await importSnapshot({ databaseUrl: this.databaseUrl, snapshot, log: this.log });
    cfg.setupDone = true;
    this.saveConfig();
  }

  // "Start empty" (testing): never registers, so such a PC never uploads.
  setupEmpty() {
    this.cfg.setupDone = true;
    this.saveConfig();
  }

  // Everything after the database. Resolves the new Owner's login when this
  // created one (no users yet, i.e. "start empty"), else null.
  async startServices() {
    const { cfg } = this;
    const owner = await ensureOwner({ databaseUrl: this.databaseUrl });

    this.backups = new BackupScheduler({ databaseUrl: this.databaseUrl, getDir: () => this.backupDir(), pgDataDir: this.pgDataDir, log: this.log });
    this.backups.start();

    this.alertRelay = new AlertRelay({
      databaseUrl: this.databaseUrl,
      relaySecret: cfg.relaySecret,
      getTarget: () => cfg.whatsapp || null,
      // The server's reason for no target (T1.7), or why we don't know one yet
      getNoTargetReason: () => cfg.whatsappReason
        || (cfg.uploadKey ? 'no WhatsApp settings received from the server yet' : 'this PC is not registered with the server'),
      log: this.log,
    });
    await this.alertRelay.start();

    this.startBackend();
    await this.waitForServer();
    await this.startUploads();
    return owner;
  }

  startBackend() {
    const { cfg } = this;
    const backend = this.forkBackend(path.join(this.backendDir, 'server.js'), {
      cwd: this.backendDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: this.databaseUrl,
        PORT: String(APP_PORT),
        HOST: this.bindHost,
        JWT_SECRET: cfg.jwtSecret,
        FRONTEND_URL: [this.appOrigin, ...this.lanOrigins].join(','),
        FMS_STATIC_DIR: this.frontendDir,
        // Setup name + logo for the login screen (GET /branding)
        FMS_BRANDING_FILE: this.brandingFile,
        // Sync status for the status bar (GET /status)
        FMS_STATUS_FILE: this.statusFile,
        // Factory-only routes, e.g. retrying changes the server refused (/api/sync-quarantine)
        FMS_FACTORY: '1',
        // Reports and digests go out from the online server (T2.1, its
        // REPORT_SENDER_MODE=send_only), even with this PC off; exactly one
        // scheduler, so none here (T2.2).
        DISABLE_CRON: 'true',
        TZ: 'Asia/Karachi',
        // WhatsApp alerts go to the local relay, which queues them offline.
        N8N_WEBHOOK_URL: `http://127.0.0.1:${ALERT_PORT}/alert`,
        N8N_WEBHOOK_SECRET: cfg.relaySecret,
      },
    });
    this.backend = backend;
    backend.stdout.on('data', (d) => this.log(`[backend] ${String(d).trimEnd()}`));
    backend.stderr.on('data', (d) => this.log(`[backend:err] ${String(d).trimEnd()}`));
    backend.on('exit', (code) => {
      if (this.backend === backend) this.backend = null;
      backend.exited = true;
      if (this.stopping) return;
      this.log(`backend exited with code ${code}`);
      this.onBackendExit(code);
    });
  }

  waitForServer(timeoutMs = 30000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const attempt = () => {
        const req = http.get(`${this.appOrigin}/`, (res) => { res.resume(); resolve(); });
        req.on('error', () => {
          if (Date.now() - started > timeoutMs) reject(new Error('backend did not start in time'));
          else setTimeout(attempt, 300);
        });
      };
      attempt();
    });
  }

  // The SyncWorker and the StatusReporter (heartbeat) with the current upload
  // key. Called at startup, and again after the rebuild registers a new key.
  async startUploads() {
    const { cfg, databaseUrl } = this;
    if (this.syncWorker) await this.syncWorker.stop();
    if (this.statusReporter) await this.statusReporter.stop();
    this.syncWorker = null;
    if (cfg.uploadKey) {
      this.syncWorker = new SyncWorker({
        databaseUrl,
        serverUrl: cfg.syncServerUrl,
        uploadKey: cfg.uploadKey,
        log: this.log,
        onStatus: (status) => {
          this.lastSync = status;
          this.syncStatusText = describeSync(status);
          this.onChange();
          this.statusReporter?.refresh();
        },
      });
      this.syncWorker.start();
      this.refreshServerConfig();
      if (!this.configTimer) this.configTimer = setInterval(() => this.refreshServerConfig(), 3600_000);
    } else {
      this.lastSync = { state: 'not_registered' };
      this.syncStatusText = 'Upload to server not set up';
      this.onChange();
      this.log('sync: this PC is not registered (no uploadKey in config.json), changes are kept locally');
    }
    this.statusReporter = new StatusReporter({
      databaseUrl,
      statusFile: this.statusFile,
      getSync: () => this.lastSync,
      relay: this.alertRelay,
      backup: this.backups,
      tablesWithoutPk: this.tablesWithoutPk,
      unsafeSettings: this.unsafeSettings,
      upload: cfg.uploadKey ? { serverUrl: cfg.syncServerUrl, uploadKey: cfg.uploadKey } : null,
      log: this.log,
      // Replaced by another PC while idle: stop the worker as if an upload had been refused.
      onNotWriter: (message) => this.syncWorker?.markNotWriter(message),
    });
    this.statusReporter.start();
  }

  // Rebuild the online server (T2.8, D17): the server was lost or restored
  // from an old backup. Register again with a setup code made there
  // (scripts/createSetupCode.js), keeping this PC's writer_id and all of its
  // data — no snapshot — then resend every row and prune what the server has
  // that this PC doesn't (lib/rebuild.js). Needs startServices() first.
  async rebuildServer({ serverUrl, code, progress = () => {} }) {
    const { cfg } = this;
    progress('Registering this computer with the server again…');
    const writerId = cfg.writerId || crypto.randomUUID();
    const { uploadKey, setup } = await registerWriter({ serverUrl, code, writerId });
    Object.assign(cfg, { syncServerUrl: serverUrl, writerId, uploadKey });
    this.saveConfig();
    this.applySetup(setup);
    this.log(`rebuild: registered again as main PC ${writerId}, resending everything`);
    await this.startUploads();
    const { queued, deleted } = await resendAndPrune({
      databaseUrl: this.databaseUrl, worker: this.syncWorker, serverUrl, uploadKey, log: this.log, progress,
    });
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    this.log(`rebuild: done — ${sum(queued)} row(s) sent, ${sum(deleted)} removed on the server`);
    return { sent: sum(queued), removed: sum(deleted) };
  }

  // Shutdown, in this order:
  //   1. stop the backend: no new business writes from here on (T3.2's drain)
  //   2. upload what is waiting, at most uploadMs (10 s in the app, 45 s in
  //      the service), so a sale made just before closing usually reaches the
  //      server now rather than on the next start
  //   3. the closing backup (lib/backup.js), now that nothing changes
  //   4. relay, then a clean Postgres shutdown, so the data directory is
  //      never left mid-write
  // A step that fails is logged and the rest still run.
  async stop({ uploadMs = 10_000, backupMs = 60_000 } = {}) {
    if (this.stopping) return;
    this.stopping = true;
    const step = async (name, fn) => {
      try { await fn(); } catch (err) { this.log(`shutdown: ${name} failed: ${err.message}`); }
    };
    clearInterval(this.configTimer);
    await step('backend', () => this.stopBackend());
    if (this.syncWorker) {
      await step('final upload', async () => {
        const started = Date.now();
        await this.syncWorker.finalUpload(uploadMs);
        this.log(`shutdown: final upload done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      });
      await step('sync worker', () => this.syncWorker.stop());
    }
    if (this.statusReporter) await step('status', () => this.statusReporter.stop());
    if (this.backups) await step('backup', () => this.backups.stop({ timeoutMs: backupMs }));
    if (this.alertRelay) await step('relay', () => this.alertRelay.stop());
    await step('postgres', () => stopPostgres({ dataDir: this.pgDataDir, log: this.log }));
  }

  // Resolves once the backend has exited (at most 5 s).
  stopBackend() {
    const backend = this.backend;
    if (!backend || backend.exited) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      backend.on('exit', () => { clearTimeout(timer); resolve(); });
      backend.kill();
    });
  }
}

module.exports = { FactoryRuntime, describeSync, portIsFree, DEFAULT_SYNC_SERVER };
