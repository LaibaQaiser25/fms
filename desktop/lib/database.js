// Embedded Postgres for the desktop app: a real Postgres 16 (same major as the
// VPS's postgres:16-alpine, so pg_dump/restore between them just works) whose
// binaries ship inside node_modules and whose data lives in the user's
// AppData folder. Nothing is installed system-wide.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const { Client } = require('pg');
const { PG_PORT } = require('./ports');

const DB_USER = 'fms_app';
const DB_NAME = 'fms_db';

const execFileAsync = promisify(execFile);

let pgServer = null;

// Only ever on 127.0.0.1, even once the backend is opened to the factory
// network (T3.3): the database is never exposed beyond the main PC.
const POSTGRES_FLAGS = ['-c', 'listen_addresses=127.0.0.1'];

// detached (the Windows service, T3.2): Postgres runs outside this process's
// console. The service is stopped with Ctrl+C on that console, which Postgres
// on Windows takes as "fast shutdown" — it would be gone before the final
// upload and the closing backup. Detached, only pg_ctl stop (stopPostgres)
// shuts it down, last.
async function startPostgres({ dataDir, password, log, detached = false }) {
  // embedded-postgres is ESM-only; main.js is CommonJS.
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  pgServer = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: DB_USER,
    password,
    port: PG_PORT,
    persistent: true,
    // Without these, initdb on Windows picks the system code page (WIN1252),
    // and any Urdu text or emoji (the WhatsApp alerts use emoji) fails to
    // save. ICU en-US sorts text the way the VPS's en_US.utf8 does.
    initdbFlags: ['--encoding=UTF8', '--locale-provider=icu', '--icu-locale=en-US', '--locale=C'],
    postgresFlags: POSTGRES_FLAGS,
    onLog: (msg) => log(`[postgres] ${String(msg).trimEnd()}`),
    onError: (msg) => log(`[postgres:err] ${String(msg).trimEnd()}`),
  });

  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    log('initialising new Postgres data directory');
    await pgServer.initialise();
  } else {
    await stopLeftoverPostgres({ dataDir, log });
  }
  if (detached) {
    pgServer = await startDetached({ dataDir, log });
    // embedded-postgres (through async-exit-hook) answers SIGINT, SIGTERM,
    // SIGHUP and SIGBREAK by stopping Postgres and exiting at once, which
    // would cut the service's drain short. host.js runs the shutdown itself
    // (lib/runtime.js stop()), so those hooks go; the 'exit' one stays.
    const exitHook = require('async-exit-hook');
    for (const ev of ['SIGHUP', 'SIGINT', 'SIGTERM', 'SIGBREAK', 'message']) exitHook.unhookEvent(ev);
  }
  else await pgServer.start();

  const url = (db) => `postgresql://${DB_USER}:${encodeURIComponent(password)}@127.0.0.1:${PG_PORT}/${db}`;

  const admin = new Client({ connectionString: url('postgres') });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
  if (rowCount === 0) {
    log(`creating database ${DB_NAME}`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
  }
  await admin.end();

  // Data directories created by the first test builds (before initdbFlags
  // above) are WIN1252; say so plainly instead of failing on odd saves later.
  const db = new Client({ connectionString: url(DB_NAME) });
  await db.connect();
  const { rows: [{ enc }] } = await db.query('SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = current_database()');
  await db.end();
  if (enc !== 'UTF8') {
    throw new Error(`The local database uses ${enc} text encoding, not UTF-8, so Urdu text and emoji can't be saved. It was created by an early test build: back up and delete ${dataDir}, then start FMS again.`);
  }

  return url(DB_NAME);
}

// If the app crashed or was killed, its Postgres child can outlive it and
// still hold the data directory + port, so start() would fail. pg_ctl status
// exits 0 only when a server is running on this data directory.
async function stopLeftoverPostgres({ dataDir, log }) {
  const pgCtl = await pgCtlPath();
  try {
    await execFileAsync(pgCtl, ['status', '-D', dataDir], { windowsHide: true });
  } catch {
    return; // not running
  }
  log('found Postgres still running from a previous session, stopping it');
  await execFileAsync(pgCtl, ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '30'], { windowsHide: true });
}

const binaries = () => import(`@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`);

async function pgCtlPath() {
  return (await binaries()).pg_ctl;
}

// Like EmbeddedPostgres.start(), in its own process group with no console
// (libuv: DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP on Windows, setsid
// elsewhere), so a Ctrl+C meant for this process never reaches it.
async function startDetached({ dataDir, log }) {
  const { postgres } = await binaries();
  const child = spawn(postgres, ['-D', dataDir, '-p', String(PG_PORT), ...POSTGRES_FLAGS], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    child.stderr.on('data', (chunk) => {
      const msg = chunk.toString('utf8');
      log(`[postgres] ${msg.trimEnd()}`);
      if (msg.includes('database system is ready to accept connections')) resolve();
    });
    child.once('error', reject);
    child.once('close', (code) => reject(new Error(`postgres exited during start (code ${code})`)));
  });
  return { detached: true, process: child };
}

// embedded-postgres's own stop() does `taskkill /f` on Windows, which is a
// hard kill: Postgres then runs crash recovery on the next start. Ask pg_ctl
// for a proper fast shutdown instead, and only fall back to stop() if it fails.
async function stopPostgres({ dataDir, log }) {
  if (!pgServer) return;
  const server = pgServer;
  pgServer = null;

  if (process.platform === 'win32' || server.detached) {
    try {
      await execFileAsync(await pgCtlPath(), ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '30'], { windowsHide: true });
      server.process = undefined; // already exited; stop() would wait for an exit event forever
      log('postgres stopped cleanly');
      return;
    } catch (err) {
      log(`pg_ctl stop failed, forcing: ${err.message}`);
    }
  }
  if (server.detached) server.process.kill();
  else await server.stop();
}

// Same order as deploy/setup.sh: base schema (pgdb.sql) on a fresh database,
// then every node-pg-migrate migration, exactly like the Docker CMD does.
async function prepareSchema({ databaseUrl, backendDir, log }) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT to_regclass('public.users') AS t");
    if (!rows[0].t) {
      log('loading base schema (pgdb.sql)');
      await client.query(fs.readFileSync(path.join(backendDir, 'db', 'pgdb.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }

  const { runner } = await import('node-pg-migrate');
  await runner({
    databaseUrl,
    dir: path.join(backendDir, 'db', 'migrations'),
    migrationsTable: 'pgmigrations',
    direction: 'up',
    count: Infinity,
    log: (msg) => log(`[migrate] ${msg}`),
  });
}

// A brand-new install has no users, so nobody could log in. Create the
// 'owner' account (same username deploy/seed-owner.js uses on the VPS) with a
// random password and hand it back so main.js can show it once.
async function ensureOwner({ databaseUrl }) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT count(*)::int AS n FROM users');
    if (rows[0].n > 0) return null;

    const bcrypt = require('bcrypt');
    const password = crypto.randomBytes(9).toString('base64url');
    await client.query(
      `INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, 'Owner')`,
      ['owner', 'owner@factory.local', bcrypt.hashSync(password, 10)]
    );
    return { username: 'owner', password };
  } finally {
    await client.end();
  }
}

// T2.6: the settings that keep committed data safe through a power cut. The
// embedded server starts with no flags, so they are at their safe defaults;
// this logs them at every start (the factory PC has no psql to check with)
// and returns any that are off.
const DURABILITY = ['fsync', 'synchronous_commit', 'full_page_writes'];
async function checkDurability({ databaseUrl, log }) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT name, setting FROM pg_settings WHERE name = ANY($1) ORDER BY name', [DURABILITY]);
    log(`postgres durability: ${rows.map((r) => `${r.name}=${r.setting}`).join(', ')}`);
    return rows.filter((r) => r.setting !== 'on').map((r) => r.name);
  } finally {
    await client.end();
  }
}

module.exports = { startPostgres, stopPostgres, prepareSchema, ensureOwner, checkDurability };
