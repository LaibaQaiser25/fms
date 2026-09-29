// Embedded Postgres for the desktop app: a real Postgres 16 (same major as the
// VPS's postgres:16-alpine, so pg_dump/restore between them just works) whose
// binaries ship inside node_modules and whose data lives in the user's
// AppData folder. Nothing is installed system-wide.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { Client } = require('pg');
const { PG_PORT } = require('./ports');

const DB_USER = 'fms_app';
const DB_NAME = 'fms_db';

const execFileAsync = promisify(execFile);

let pgServer = null;

async function startPostgres({ dataDir, password, log }) {
  // embedded-postgres is ESM-only; main.js is CommonJS.
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  pgServer = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: DB_USER,
    password,
    port: PG_PORT,
    persistent: true,
    onLog: (msg) => log(`[postgres] ${String(msg).trimEnd()}`),
    onError: (msg) => log(`[postgres:err] ${String(msg).trimEnd()}`),
  });

  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    log('initialising new Postgres data directory');
    await pgServer.initialise();
  }
  await pgServer.start();

  const url = (db) => `postgresql://${DB_USER}:${encodeURIComponent(password)}@127.0.0.1:${PG_PORT}/${db}`;

  const admin = new Client({ connectionString: url('postgres') });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
  if (rowCount === 0) {
    log(`creating database ${DB_NAME}`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
  }
  await admin.end();

  return url(DB_NAME);
}

// embedded-postgres's own stop() does `taskkill /f` on Windows, which is a
// hard kill: Postgres then runs crash recovery on the next start. Ask pg_ctl
// for a proper fast shutdown instead, and only fall back to stop() if it fails.
async function stopPostgres({ dataDir, log }) {
  if (!pgServer) return;
  const server = pgServer;
  pgServer = null;

  if (process.platform === 'win32') {
    try {
      const { pg_ctl } = await import('@embedded-postgres/windows-x64');
      await execFileAsync(pg_ctl, ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '30'], { windowsHide: true });
      server.process = undefined; // already exited; stop() would wait for an exit event forever
      log('postgres stopped cleanly');
      return;
    } catch (err) {
      log(`pg_ctl stop failed, forcing: ${err.message}`);
    }
  }
  await server.stop();
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

module.exports = { startPostgres, stopPostgres, prepareSchema, ensureOwner };
