// FMS without Electron (SYNC-HARDENING-PLAN.md T3.1): the same factory stack
// as the desktop app (lib/runtime.js), for running as a Windows service
// (T3.2) so it is up with nobody logged in and other factory PCs can use it
// in a browser (T3.3). Run with tools\node.exe (scripts/fetch-tools.js).
//
//   node host.js                      run until stopped (Ctrl+C, the way NSSM
//                                     stops a service), then drain and exit
//   node host.js setup --code <code> [--server <url>]
//                                     first run: register as the main PC and
//                                     copy the server's data (like the app's
//                                     setup screen)
//   node host.js setup --empty        testing: no server, prints a new Owner login
//   node host.js copy-data --from <dir>
//                                     D1: copy the app's %APPDATA%\FMS into the
//                                     data directory, verify, leave the original
//                                     byte-identical (never moved in place)
//   node host.js rebuild --code <code> [--server <url>]
//                                     T2.8 for the service (it must be stopped)
//   node host.js backup | drill       a backup now / test the newest one
//                                     (service stopped)
//
// Data directory (D1): FMS_DATA_DIR, default %PROGRAMDATA%\FMS.
// Listens on FMS_BIND_HOST (default 127.0.0.1; T3.3 opens it to the LAN).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fork } = require('child_process');
const { FactoryRuntime } = require('./lib/runtime');
const { ensureOwner } = require('./lib/database');
const { restoreDrill, listBackups } = require('./lib/backup');

const DRAIN_MS = 45_000; // T3.2: the final upload when the service stops

function dataDirFromEnv() {
  if (process.env.FMS_DATA_DIR) return path.resolve(process.env.FMS_DATA_DIR);
  if (process.platform === 'win32' && process.env.PROGRAMDATA) return path.join(process.env.PROGRAMDATA, 'FMS');
  throw new Error('Set FMS_DATA_DIR (the folder for the database, config and logs).');
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(argv[i]);
  }
  return out;
}

function makeLog(dataDir) {
  const logDir = path.join(dataDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const stream = fs.createWriteStream(path.join(logDir, 'fms.log'), { flags: 'a' });
  const log = (msg) => {
    const line = `${new Date().toISOString()} ${msg}\n`;
    if (!stream.writableEnded) stream.write(line);
    process.stdout.write(line);
  };
  log.end = () => new Promise((resolve) => stream.end(resolve));
  return log;
}

function makeRuntime({ dataDir, log, onBackendExit }) {
  return new FactoryRuntime({
    dataDir,
    stagedDir: process.env.FMS_STAGED_DIR || path.join(__dirname, 'staged'),
    log,
    bindHost: process.env.FMS_BIND_HOST || '127.0.0.1',
    lanOrigins: (process.env.FMS_LAN_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
    detachedPostgres: true,
    // The backend's console output comes back through pipes; it shares this
    // console, so the service's Ctrl+C stops it too — the first step of the
    // drain anyway (no new business writes).
    forkBackend: (modulePath, { cwd, env }) => fork(modulePath, [], { cwd, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }),
    onBackendExit,
  });
}

// ---- run ----------------------------------------------------------------

async function run(dataDir) {
  const log = makeLog(dataDir);
  let runtime = null;
  let stopping = null;
  const shutdown = (why, code) => {
    if (stopping) { log(`host: ${why} — already stopping`); return stopping; }
    log(`host: ${why}, stopping (final upload up to ${DRAIN_MS / 1000} s)`);
    stopping = (async () => {
      if (runtime) await runtime.stop({ uploadMs: DRAIN_MS });
      log(`host: stopped${code ? ` (exit ${code})` : ''}`);
      await log.end();
      process.exit(code);
    })();
    return stopping;
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) process.on(sig, () => shutdown(sig, 0));

  runtime = makeRuntime({
    dataDir,
    log,
    // NSSM restarts the service when it exits with an error.
    onBackendExit: (code) => shutdown(`backend exited with code ${code}`, 1),
  });
  let lastLine = '';
  runtime.onChange = () => {
    const line = [runtime.appName, runtime.syncStatusText].filter(Boolean).join(' — ');
    if (line !== lastLine && runtime.syncStatusText) log(`status: ${runtime.syncStatusText}`);
    lastLine = line;
  };
  try {
    runtime.loadConfig();
    if (!runtime.cfg.setupDone) {
      throw new Error(`This data directory is not set up. Run "host.js setup --code <code>", or copy the app's data with "host.js copy-data --from <%APPDATA%\\FMS>". (${dataDir})`);
    }
    runtime.applySetup();
    log(`host: starting FMS ${require('./package.json').version} (data: ${dataDir}, listening on ${runtime.bindHost})`);
    await runtime.checkPorts();
    await runtime.startDatabase();
    const owner = await runtime.startServices();
    if (owner) log(`host: an Owner account was created — username ${owner.username}, password ${owner.password} (change it from the Users page)`);
    log(`host: ready on http://${runtime.bindHost === '0.0.0.0' ? '<this PC>' : runtime.bindHost}:${require('./lib/ports').APP_PORT}`);
  } catch (err) {
    log(`host: startup failed: ${err.stack || err.message}`);
    await shutdown('startup failed', 1);
  }
}

// ---- one-off commands (the service must be stopped) --------------------

async function withDatabase(dataDir, fn) {
  const log = makeLog(dataDir);
  const runtime = makeRuntime({ dataDir, log, onBackendExit: () => {} });
  runtime.loadConfig();
  await runtime.checkPorts().catch(() => {
    throw new Error('FMS is running (the service, or the app). Stop it first.');
  });
  try {
    await runtime.startDatabase();
    return await fn(runtime, log);
  } finally {
    await runtime.stop({ uploadMs: 10_000 });
    await log.end();
  }
}

async function setup(dataDir, opts) {
  fs.mkdirSync(dataDir, { recursive: true });
  await withDatabase(dataDir, async (runtime, log) => {
    if (runtime.cfg.setupDone) throw new Error(`Already set up (${dataDir}).`);
    if (opts.empty) {
      runtime.setupEmpty();
      const owner = await ensureOwner({ databaseUrl: runtime.databaseUrl });
      if (owner) console.log(`\nOwner account — username: ${owner.username}  password: ${owner.password}\n(shown once; change it from the Users page)\n`);
      return;
    }
    if (!opts.code || opts.code === true) throw new Error('Give the setup code: host.js setup --code <code>');
    const serverUrl = typeof opts.server === 'string' ? opts.server : runtime.cfg.syncServerUrl;
    await runtime.setupFromServer({ serverUrl, code: opts.code, progress: (m) => log(`setup: ${m}`) });
    log('setup: done — this PC is the main PC and has the server\'s data');
  });
}

async function rebuild(dataDir, opts) {
  if (!opts.code || opts.code === true) throw new Error('Give the setup code: host.js rebuild --code <code>');
  await withDatabase(dataDir, async (runtime, log) => {
    await runtime.startServices();
    const serverUrl = typeof opts.server === 'string' ? opts.server : runtime.cfg.syncServerUrl;
    const r = await runtime.rebuildServer({ serverUrl, code: opts.code, progress: (m) => log(`rebuild: ${m}`) });
    console.log(`\nDone: ${r.sent} row(s) sent, ${r.removed} removed on the server.\n`);
  });
}

async function backupCommand(dataDir, what) {
  await withDatabase(dataDir, async (runtime) => {
    if (what === 'backup') {
      const { backupNow } = require('./lib/backup');
      const r = await backupNow({ databaseUrl: runtime.databaseUrl, dir: runtime.backupDir() });
      console.log(`\nbackup OK: ${r.file} (${r.tables} tables, ${r.rows} rows)\n`);
      return;
    }
    const newest = listBackups(runtime.backupDir())[0];
    if (!newest) throw new Error('There is no backup to test yet.');
    const r = await restoreDrill({ databaseUrl: runtime.databaseUrl, file: newest.file });
    console.log(r.ok
      ? `\ndrill OK: ${newest.name} restored, ${r.tables} tables, ${r.rows} rows, all row counts match\n`
      : `\ndrill FAILED: ${r.mismatches.map((m) => `${m.table} ${m.expected} -> ${m.restored}`).join(', ')}\n`);
    if (!r.ok) process.exitCode = 1;
  });
}

// D1: copy, verify, then switch — never in place. The original folder is
// read only; afterwards it must be byte-identical to before.
function manifest(dir) {
  const files = [];
  const walk = (rel) => {
    for (const ent of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = path.join(rel, ent.name);
      if (ent.isDirectory()) walk(r);
      else if (ent.isFile()) {
        const data = fs.readFileSync(path.join(dir, r));
        files.push(`${r.split(path.sep).join('/')}\0${data.length}\0${crypto.createHash('sha256').update(data).digest('hex')}`);
      }
    }
  };
  walk('');
  files.sort();
  return { count: files.length, sha256: crypto.createHash('sha256').update(files.join('\n')).digest('hex'), files };
}

async function copyData(dataDir, opts) {
  const from = typeof opts.from === 'string' && path.resolve(opts.from);
  if (!from) throw new Error('Give the folder to copy: host.js copy-data --from <%APPDATA%\\FMS of the user who ran the app>');
  if (!fs.existsSync(path.join(from, 'pgdata', 'PG_VERSION')) || !fs.existsSync(path.join(from, 'config.json'))) {
    throw new Error(`${from} is not an FMS data folder (no pgdata\\PG_VERSION or config.json).`);
  }
  if (path.resolve(dataDir) === from) throw new Error('The data directory and the folder to copy are the same.');
  if (fs.existsSync(dataDir) && fs.readdirSync(dataDir).length) throw new Error(`${dataDir} is not empty; nothing was copied. Copy into a new, empty folder.`);
  // A running Postgres keeps changing its files: the copy would be torn.
  if (fs.existsSync(path.join(from, 'pgdata', 'postmaster.pid'))) {
    throw new Error(`The database in ${from} is open (pgdata\\postmaster.pid exists). Close the FMS app first; if it is closed, start and close it once so the database shuts down cleanly.`);
  }

  const say = (m) => console.log(m);
  say(`reading ${from} …`);
  const before = manifest(from);
  const pgBefore = manifest(path.join(from, 'pgdata'));
  say(`  ${before.count} files; pgdata: ${pgBefore.count} files, sha256 ${pgBefore.sha256}`);
  const partial = `${dataDir}.partial`;
  fs.rmSync(partial, { recursive: true, force: true });
  fs.cpSync(from, partial, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
  // cpSync creates folders with default permissions; Postgres refuses a
  // data directory others can read (on Windows the service user's ACL does
  // that job instead, T3.2). Copy each folder's mode too.
  const keepModes = (rel) => {
    fs.chmodSync(path.join(partial, rel), fs.statSync(path.join(from, rel)).mode & 0o7777);
    for (const ent of fs.readdirSync(path.join(from, rel), { withFileTypes: true })) {
      if (ent.isDirectory()) keepModes(path.join(rel, ent.name));
    }
  };
  keepModes('');
  const copied = manifest(partial);
  if (copied.sha256 !== before.sha256) {
    fs.rmSync(partial, { recursive: true, force: true });
    throw new Error('The copy differs from the original; it was removed. Nothing was switched.');
  }
  const after = manifest(from);
  const pgAfter = manifest(path.join(from, 'pgdata'));
  if (after.sha256 !== before.sha256) {
    fs.rmSync(partial, { recursive: true, force: true });
    throw new Error(`${from} changed while it was being copied (is FMS running?). The copy was removed.`);
  }
  // Only now does the copy take the data directory's name.
  if (fs.existsSync(dataDir)) fs.rmdirSync(dataDir); // known empty (checked above)
  fs.renameSync(partial, dataDir);
  const record = {
    copiedFrom: from,
    at: new Date().toISOString(),
    files: before.count,
    sha256: before.sha256,
    pgdata: { files: pgBefore.count, sha256: pgBefore.sha256 },
  };
  fs.writeFileSync(path.join(dataDir, 'copied-from.json'), JSON.stringify(record, null, 2));
  say(`copied and verified: ${dataDir}`);
  say(`  pgdata after:  ${pgAfter.count} files, sha256 ${pgAfter.sha256} (original unchanged)`);
  say(`The original ${from} was not changed. Keep it until the service has run for a while.`);
}

// ---- main ----------------------------------------------------------------

async function main() {
  const opts = args(process.argv.slice(2));
  const cmd = opts._[0] || 'run';
  const dataDir = dataDirFromEnv();
  if (cmd === 'run') return run(dataDir);
  if (cmd === 'setup') return setup(dataDir, opts);
  if (cmd === 'copy-data') return copyData(dataDir, opts);
  if (cmd === 'rebuild') return rebuild(dataDir, opts);
  if (cmd === 'backup' || cmd === 'drill') return backupCommand(dataDir, cmd);
  throw new Error(`Unknown command "${cmd}". See the top of host.js.`);
}

main().catch((err) => {
  console.error(`host: ${err.message}`);
  process.exit(1);
});
