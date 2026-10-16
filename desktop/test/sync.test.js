// Automated checks for factory -> VPS sync (SYNC-HARDENING-PLAN.md T1.0).
// Run with `npm test` in desktop/, with the FMS app CLOSED: this starts its own
// throwaway embedded Postgres on the app's database port (lib/ports.js).
//
// One Postgres instance, two databases built from the same schema +
// migrations: fms_db plays the factory (change capture installed) and vps_db
// plays the server. The server side is backend/controllers/SyncController.js
// called directly with a fake request/response — never a second server.js,
// which listens on import. SyncWorker's fetch is routed to it the same way.
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const BACKEND_DIR = path.join(__dirname, '..', '..', 'backend');

// Like the staged copy inside the app, backend/ resolves its dependencies
// (pg, dotenv) from desktop/node_modules.
process.env.NODE_PATH = path.join(__dirname, '..', 'node_modules');
Module._initPaths();

const { Client } = require('pg');
const { startPostgres, stopPostgres, prepareSchema } = require('../lib/database');
const { installSyncCapture } = require('../lib/syncCapture');
const { SyncWorker } = require('../lib/sync');
const { importSnapshot } = require('../lib/snapshot');
const { PG_PORT } = require('../lib/ports');

const SERVER_URL = 'http://vps.test';

let tmpDir;
let dataDir;
let factoryUrl;
let factory;        // pg Client on the factory database
let vps;            // pg Client on the server database
let vpsPool;        // backend/db/pool.js, used by SyncController
let SyncController;
let restoreFetch;
const logs = [];
const log = (msg) => logs.push(msg);

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

// Calls an Express handler with a minimal req/res; resolves { status, body }.
function call(handler, { body, headers = {} } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const req = { body, query: {}, get: (name) => lower[name.toLowerCase()] };
  return new Promise((resolve, reject) => {
    let done = false;
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { done = true; resolve({ status: this.statusCode, body: payload }); return this; },
    };
    Promise.resolve()
      .then(() => handler(req, res))
      .then(() => { if (!done) reject(new Error('handler finished without responding')); }, reject);
  });
}

// SyncWorker and downloadSnapshot use global fetch; send their requests to
// SyncController instead of the network.
function routeFetchToController() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const handler = {
      '/sync/ingest': SyncController.ingest,
      '/sync/snapshot': SyncController.snapshot,
      '/sync/config': SyncController.getConfig,
    }[pathname];
    if (!handler) return new Response('{"error":"not found"}', { status: 404 });
    const { status, body } = await call(handler, {
      body: init.body ? JSON.parse(init.body) : undefined,
      headers: init.headers,
    });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return () => { globalThis.fetch = realFetch; };
}

// One SyncWorker round, as the app runs it; returns the status it reported.
async function syncRound() {
  let status;
  const worker = new SyncWorker({
    databaseUrl: factoryUrl, serverUrl: SERVER_URL, token: 'test', log, onStatus: (s) => { status = s; },
  });
  try {
    await worker.round();
  } finally {
    await worker.stop();
  }
  return status;
}

async function outbox() {
  const { rows } = await factory.query('SELECT id, table_name, op, row_data FROM sync_outbox ORDER BY id');
  return rows;
}

const customersOn = async (client) => (await client.query('SELECT * FROM customers ORDER BY id')).rows;

before(async () => {
  if (await portInUse(PG_PORT)) {
    throw new Error(`Port ${PG_PORT} is in use. Close the FMS app (and any other test run) first.`);
  }
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fms-sync-test-'));
  dataDir = path.join(tmpDir, 'pgdata');
  const password = crypto.randomBytes(12).toString('hex');

  factoryUrl = await startPostgres({ dataDir, password, log });
  const vpsUrl = factoryUrl.replace(/\/fms_db$/, '/vps_db');
  const admin = new Client({ connectionString: factoryUrl.replace(/\/fms_db$/, '/postgres') });
  await admin.connect();
  await admin.query('CREATE DATABASE vps_db');
  await admin.end();

  await prepareSchema({ databaseUrl: factoryUrl, backendDir: BACKEND_DIR, log });
  await prepareSchema({ databaseUrl: vpsUrl, backendDir: BACKEND_DIR, log });
  await installSyncCapture({ databaseUrl: factoryUrl, log });

  // Set before requiring the backend: db/pool.js reads it on import, and
  // dotenv never overrides a variable that is already set.
  process.env.DATABASE_URL = vpsUrl;
  SyncController = require(path.join(BACKEND_DIR, 'controllers', 'SyncController'));
  vpsPool = require(path.join(BACKEND_DIR, 'db', 'pool'));
  // pool.js checks out one client on import and never releases it; keep its
  // connection error at shutdown from crashing the run.
  vpsPool.on('connect', (c) => c.on('error', () => {}));
  vpsPool.on('error', () => {});

  factory = new Client({ connectionString: factoryUrl });
  vps = new Client({ connectionString: vpsUrl });
  await factory.connect();
  await vps.connect();
  restoreFetch = routeFetchToController();
});

after(async () => {
  restoreFetch?.();
  await factory?.end().catch(() => {});
  await vps?.end().catch(() => {});
  // Not awaited: pool.js's never-released client keeps end() pending until
  // Postgres stops below and drops the connection.
  vpsPool?.end().catch(() => {});
  if (dataDir) await stopPostgres({ dataDir, log }).catch(() => {});
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  // TRUNCATE fires no row triggers, so this leaves sync_outbox alone.
  await factory.query('TRUNCATE customers RESTART IDENTITY CASCADE');
  await factory.query('DELETE FROM sync_outbox');
  await vps.query('TRUNCATE customers RESTART IDENTITY CASCADE');
});

test('a factory change lands in sync_outbox: insert, update, delete, key change', async () => {
  const { rows: [{ id }] } = await factory.query("INSERT INTO customers (name) VALUES ('Ali') RETURNING id");
  await factory.query("UPDATE customers SET phone = '0300' WHERE id = $1", [id]);
  await factory.query('UPDATE customers SET name = name WHERE id = $1', [id]); // no real change
  await factory.query('UPDATE customers SET id = $2 WHERE id = $1', [id, id + 100]);
  await factory.query('DELETE FROM customers WHERE id = $1', [id + 100]);

  const rows = await outbox();
  assert.deepEqual(rows.map((r) => r.op), ['I', 'U', 'D', 'U', 'D']);
  assert.ok(rows.every((r) => r.table_name === 'customers'));

  const [ins, upd, keyDel, keyUpd, del] = rows.map((r) => r.row_data);
  assert.equal(ins.id, id);
  assert.equal(ins.name, 'Ali');
  assert.equal(upd.phone, '0300', 'an update carries the full new row');
  assert.equal(upd.name, 'Ali');
  assert.deepEqual(keyDel, { id }, 'a key change first deletes the old key');
  assert.equal(keyUpd.id, id + 100, '...then upserts the row under its new key');
  assert.equal(keyUpd.phone, '0300');
  assert.deepEqual(del, { id: id + 100 }, 'a delete carries only the primary key');
});

test('applying the same upload twice gives the same result (idempotent upsert)', async () => {
  await factory.query("INSERT INTO customers (name) VALUES ('Ali'), ('Bilal')");
  await factory.query("UPDATE customers SET address = 'Lahore' WHERE name = 'Ali'");
  const changes = await outbox();
  const expected = await customersOn(factory);

  const first = await call(SyncController.ingest, { body: { changes } });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(await customersOn(vps), expected);

  // The reply got lost, so the worker sends the same batch again.
  const second = await call(SyncController.ingest, { body: { changes } });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.deepEqual(await customersOn(vps), expected);
});

test('the worker uploads the outbox, and a delete removes the row on the server', async () => {
  await factory.query("INSERT INTO customers (name) VALUES ('Ali'), ('Bilal')");
  let status = await syncRound();
  assert.equal(status.state, 'ok', status.error);
  assert.equal(status.pending, 0);
  assert.equal((await customersOn(vps)).length, 2);

  await factory.query("DELETE FROM customers WHERE name = 'Ali'");
  status = await syncRound();
  assert.equal(status.state, 'ok', status.error);
  assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['Bilal']);
  assert.deepEqual(await customersOn(vps), await customersOn(factory));
});

test('the factory refuses to replace its data while changes are still waiting', async () => {
  await factory.query("INSERT INTO customers (name) VALUES ('Ali')");
  const waiting = (await outbox()).length;

  const prevReadOnly = process.env.READ_ONLY_MODE;
  process.env.READ_ONLY_MODE = 'true';
  try {
    const snap = await call(SyncController.snapshot);
    assert.equal(snap.status, 200, JSON.stringify(snap.body));

    await assert.rejects(
      importSnapshot({ databaseUrl: factoryUrl, snapshot: snap.body, log }),
      /not yet uploaded; refusing to replace its data/
    );
    assert.deepEqual((await customersOn(factory)).map((c) => c.name), ['Ali'], 'local data untouched');
    assert.equal((await outbox()).length, waiting, 'waiting changes kept');

    // Once they are uploaded, the same import goes through.
    const status = await syncRound();
    assert.equal(status.state, 'ok', status.error);
    const fresh = await call(SyncController.snapshot);
    await importSnapshot({ databaseUrl: factoryUrl, snapshot: fresh.body, log });
    assert.deepEqual(await customersOn(factory), await customersOn(vps));
  } finally {
    if (prevReadOnly === undefined) delete process.env.READ_ONLY_MODE;
    else process.env.READ_ONLY_MODE = prevReadOnly;
  }
});
