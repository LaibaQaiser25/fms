// Automated checks for factory -> VPS sync (SYNC-HARDENING-PLAN.md T1.0, T1.1).
// Run with `npm test` in desktop/, with the FMS app CLOSED: this starts its own
// throwaway embedded Postgres on the app's database port (lib/ports.js).
//
// One Postgres instance, two databases built from the same schema +
// migrations: fms_db plays the factory (change capture installed) and vps_db
// plays the server. The server side is backend/controllers/SyncController.js
// called directly with a fake request/response — never a second server.js,
// which listens on import. SyncWorker's fetch is routed to it the same way,
// through the same middleware routes/sync.js puts in front of each route.
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
const NO_KEY = 'WriterNotRegistered';

let tmpDir;
let dataDir;
let factoryUrl;
let factory;        // pg Client on the factory database
let vps;            // pg Client on the server database
let vpsPool;        // backend/db/pool.js, used by SyncController
let SyncController;
let requireSyncWriter;
let requireSyncToken;
let syncWriter;     // backend/services/syncWriter.js
let uploadKey;      // the registered PC's key; a fresh PC registers before each test
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

// Calls an Express handler — or a chain of them, middleware first — with a
// minimal req/res; resolves { status, body }.
function call(handlers, { body, headers = {} } = {}) {
  const chain = [handlers].flat();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const req = { body, query: {}, get: (name) => lower[name.toLowerCase()] };
  return new Promise((resolve, reject) => {
    let done = false;
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { done = true; resolve({ status: this.statusCode, body: payload }); return this; },
    };
    (async () => {
      for (const handler of chain) {
        let next = false;
        await handler(req, res, () => { next = true; });
        if (!next) break;
      }
    })().then(() => { if (!done) reject(new Error('handler finished without responding')); }, reject);
  });
}

// The routes of backend/routes/sync.js, with their middleware.
const route = () => ({
  '/sync/register': [SyncController.register],
  '/sync/ingest': [requireSyncWriter, SyncController.ingest],
  '/sync/snapshot': [requireSyncWriter, SyncController.snapshot],
  '/sync/config': [requireSyncWriter, SyncController.getConfig],
  '/sync/heartbeat': [requireSyncWriter, SyncController.heartbeat],
  '/sync/health': [requireSyncToken, SyncController.health],
  '/sync/prune': [requireSyncWriter, SyncController.prune],
});
const withKey = (key = uploadKey) => ({ 'X-Upload-Key': key });

// What the Owner does in Offline Setup, then what the factory app does with
// the code. Returns the new PC's upload key.
async function registerPC() {
  const { code } = await syncWriter.createSetupCode(vpsPool);
  const { status, body } = await call(route()['/sync/register'], {
    body: { code, writer_id: crypto.randomUUID() },
  });
  assert.equal(status, 200, JSON.stringify(body));
  return body.uploadKey;
}

// SyncWorker and downloadSnapshot use global fetch; send their requests to
// SyncController instead of the network.
function routeFetchToController() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const handler = route()[pathname];
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
async function syncRound(key = uploadKey) {
  let status;
  const worker = new SyncWorker({
    databaseUrl: factoryUrl, serverUrl: SERVER_URL, uploadKey: key, log, onStatus: (s) => { status = s; },
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
  requireSyncWriter = require(path.join(BACKEND_DIR, 'middleware', 'requireSyncWriter'));
  requireSyncToken = require(path.join(BACKEND_DIR, 'middleware', 'requireSyncToken'));
  syncWriter = require(path.join(BACKEND_DIR, 'services', 'syncWriter'));
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
  uploadKey = await registerPC();
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

  const first = await call(route()['/sync/ingest'], { body: { changes }, headers: withKey() });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(await customersOn(vps), expected);

  // The reply got lost, so the worker sends the same batch again.
  const second = await call(route()['/sync/ingest'], { body: { changes }, headers: withKey() });
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
    const snap = await call(route()['/sync/snapshot'], { headers: withKey() });
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
    const fresh = await call(route()['/sync/snapshot'], { headers: withKey() });
    await importSnapshot({ databaseUrl: factoryUrl, snapshot: fresh.body, log });
    assert.deepEqual(await customersOn(factory), await customersOn(vps));
  } finally {
    if (prevReadOnly === undefined) delete process.env.READ_ONLY_MODE;
    else process.env.READ_ONLY_MODE = prevReadOnly;
  }
});

// ---- T1.1: one-PC lock + one-time setup code ----

test('a setup code is stored only as a hash, works once, and only while unexpired', async () => {
  const { code } = await syncWriter.createSetupCode(vpsPool);
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const { rows: stored } = await vps.query('SELECT code_hash, used_at FROM setup_code ORDER BY id DESC LIMIT 1');
  assert.notEqual(stored[0].code_hash, code);
  assert.ok(!stored[0].code_hash.includes(code.replace('-', '')), 'no plain code in the database');
  assert.equal(stored[0].used_at, null);

  const register = (c) => call(route()['/sync/register'], { body: { code: c, writer_id: crypto.randomUUID() } });

  const wrong = await register('AAAA-AAAA');
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.code, 'BadSetupCode');

  const ok = await register(code.toLowerCase().replace('-', ' ')); // typed loosely
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.match(ok.body.uploadKey, /^[0-9a-f]{64}$/);
  const { rows: [writer] } = await vps.query('SELECT writer_id, upload_key_hash, registered_at FROM sync_writer');
  assert.equal(writer.writer_id, ok.body.writerId);
  assert.ok(writer.registered_at);
  assert.notEqual(writer.upload_key_hash, ok.body.uploadKey, 'only the key hash is stored');

  const again = await register(code);
  assert.equal(again.status, 401, 'a used code is refused');

  const { code: expired } = await syncWriter.createSetupCode(vpsPool);
  await vps.query("UPDATE setup_code SET expires_at = now() - interval '1 second' WHERE used_at IS NULL");
  assert.equal((await register(expired)).status, 401, 'an expired code is refused');

  const { code: older } = await syncWriter.createSetupCode(vpsPool);
  const { code: newer } = await syncWriter.createSetupCode(vpsPool);
  assert.equal((await register(older)).status, 401, 'a newer code cancels an older unused one');
  assert.equal((await register(newer)).status, 200);
});

test('an upload without the registered key is refused and applies nothing', async () => {
  await factory.query("INSERT INTO customers (name) VALUES ('Ali')");
  const changes = await outbox();

  for (const headers of [{}, withKey('0'.repeat(64)), withKey('')]) {
    const res = await call(route()['/sync/ingest'], { body: { changes }, headers });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, NO_KEY);
  }
  // Past the middleware too: ingest checks the key again in its transaction.
  const direct = await call(SyncController.ingest, { body: { changes }, headers: withKey('0'.repeat(64)) });
  assert.equal(direct.status, 403);
  assert.equal(direct.body.code, NO_KEY);

  assert.deepEqual(await customersOn(vps), [], 'nothing was written');
  const { rows: [w] } = await vps.query('SELECT last_ingest_at FROM sync_writer');
  assert.equal(w.last_ingest_at, null);

  const ok = await call(route()['/sync/ingest'], { body: { changes }, headers: withKey() });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const { rows: [after] } = await vps.query('SELECT last_ingest_at FROM sync_writer');
  assert.ok(after.last_ingest_at, 'an accepted upload records last_ingest_at');
});

test('the snapshot needs read-only mode and a registration less than an hour old, and never carries VPS-only tables', async () => {
  const prevReadOnly = process.env.READ_ONLY_MODE;
  try {
    process.env.READ_ONLY_MODE = 'false';
    assert.equal((await call(route()['/sync/snapshot'], { headers: withKey() })).status, 409);

    process.env.READ_ONLY_MODE = 'true';
    assert.equal((await call(route()['/sync/snapshot'], { headers: withKey('f'.repeat(64)) })).status, 403);

    const snap = await call(route()['/sync/snapshot'], { headers: withKey() });
    assert.equal(snap.status, 200, JSON.stringify(snap.body));
    assert.ok('customers' in snap.body.tables);
    for (const t of ['sync_writer', 'setup_code', 'offline_setup', 'sync_rejected', 'sync_heartbeat', 'report_dispatch_log', 'pgmigrations']) {
      assert.ok(!(t in snap.body.tables), `${t} is not in the snapshot`);
    }

    await vps.query("UPDATE sync_writer SET registered_at = now() - interval '61 minutes'");
    const late = await call(route()['/sync/snapshot'], { headers: withKey() });
    assert.equal(late.status, 403);
    assert.equal(late.body.code, 'SnapshotWindowClosed');
  } finally {
    if (prevReadOnly === undefined) delete process.env.READ_ONLY_MODE;
    else process.env.READ_ONLY_MODE = prevReadOnly;
  }
});

test('registering a second PC blocks the first: its worker stops as blocked_not_writer, changes kept', async () => {
  const firstKey = uploadKey;
  await factory.query("INSERT INTO customers (name) VALUES ('Ali')");
  assert.equal((await syncRound(firstKey)).state, 'ok');

  const secondKey = await registerPC();

  await factory.query("INSERT INTO customers (name) VALUES ('Bilal')");
  let status;
  const worker = new SyncWorker({
    databaseUrl: factoryUrl, serverUrl: SERVER_URL, uploadKey: firstKey, log, onStatus: (s) => { status = s; },
  });
  try {
    const next = await worker.round();
    assert.equal(status.state, 'blocked_not_writer', 'distinct from offline');
    assert.equal(status.pending, 1, 'the change stays in the outbox');
    assert.equal(worker.stopped, true, 'the worker stops trying');
    assert.equal(next, null);
  } finally {
    await worker.stop();
  }
  assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['Ali']);

  // The new main PC uploads fine.
  assert.equal((await syncRound(secondKey)).state, 'ok');
  assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['Ali', 'Bilal']);
});

// ---- T1.2: setup name and logo reach the main PC ----

test('register and /sync/config hand the setup name and logo to the main PC', async () => {
  const offlineSetup = require(path.join(BACKEND_DIR, 'services', 'offlineSetup'));
  const sharp = require('sharp');
  try {
    await offlineSetup.setSetupName('  Bin-Zahid   Factory ', vpsPool);
    const jpg = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#c00' } }).jpeg().toBuffer();
    await offlineSetup.setLogo(jpg, vpsPool);

    const { code } = await syncWriter.createSetupCode(vpsPool);
    const reg = await call(route()['/sync/register'], { body: { code, writer_id: crypto.randomUUID() } });
    assert.equal(reg.status, 200, JSON.stringify(reg.body));
    assert.equal(reg.body.setup.name, 'Bin-Zahid Factory');
    assert.match(reg.body.setup.logo, /^data:image\/png;base64,/);
    const logo = Buffer.from(reg.body.setup.logo.split(',')[1], 'base64');
    const meta = await sharp(logo).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['png', 256, 256], 'stored as a 256 x 256 PNG');

    const cfg = await call(route()['/sync/config'], { headers: withKey(reg.body.uploadKey) });
    assert.equal(cfg.status, 200);
    assert.deepEqual(cfg.body.setup, reg.body.setup);

    await assert.rejects(offlineSetup.setLogo(Buffer.from('GIF89a not allowed'), vpsPool), /PNG or JPG/);
    await assert.rejects(offlineSetup.setLogo(Buffer.alloc(1024 * 1024 + 1, 0xff), vpsPool), /1 MB/);
  } finally {
    await vps.query('UPDATE offline_setup SET setup_name = NULL, logo = NULL');
  }
});

// ---- T1.3: a bad row is set aside, the rest of the batch applies ----

async function resetProducts() {
  for (const db of [factory, vps]) await db.query('TRUNCATE products RESTART IDENTITY CASCADE');
  await factory.query('DELETE FROM sync_outbox');
  await factory.query('TRUNCATE sync_quarantine');
  await vps.query('TRUNCATE sync_rejected');
}

test('a row the server rejects (23505) is set aside while the rest of the batch applies', async () => {
  await resetProducts();
  // Someone made this product on the server; the factory makes the same one.
  await vps.query("INSERT INTO products (id, name, type, size) VALUES (900, 'Block', 'stock', '6in')");
  await factory.query("INSERT INTO customers (name) VALUES ('Ali')");
  await factory.query("INSERT INTO products (name, type, size) VALUES ('Block', 'stock', '6in')");
  await factory.query("INSERT INTO customers (name) VALUES ('Bilal')");
  const sent = await outbox();
  const productChange = sent.find((c) => c.table_name === 'products');

  const res = await call(route()['/sync/ingest'], { body: { changes: sent }, headers: withKey() });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.applied, sent.length - 1);
  assert.deepEqual(res.body.accepted, sent.filter((c) => c !== productChange).map((c) => c.id));
  assert.equal(res.body.rejected.length, 1);
  assert.equal(res.body.rejected[0].id, productChange.id);
  assert.equal(res.body.rejected[0].code, '23505');
  assert.equal(res.body.rejected[0].constraint, 'products_name_type_size_idx');

  const { rows: rej } = await vps.query('SELECT outbox_id, table_name, op, pk, code, constraint_name, resolved_at FROM sync_rejected');
  assert.equal(rej.length, 1);
  assert.equal(Number(rej[0].outbox_id), Number(productChange.id));
  assert.deepEqual([rej[0].table_name, rej[0].op, rej[0].code], ['products', 'I', '23505']);
  assert.deepEqual(rej[0].pk, { id: productChange.row_data.id });
  assert.equal(rej[0].resolved_at, null);

  assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['Ali', 'Bilal'], 'the rest of the batch applied');
  assert.deepEqual((await vps.query('SELECT id FROM products')).rows.map((r) => r.id), [900]);

  // The worker sees the same as a normal round: no "Problem" state.
  await vps.query('TRUNCATE customers RESTART IDENTITY CASCADE');
  const status = await syncRound();
  assert.equal(status.state, 'ok', status.error);
  assert.equal(status.pending, 0);
  assert.equal((await vps.query('SELECT count(*)::int AS n FROM sync_rejected')).rows[0].n, 2);

  // Once the conflict is gone on the server, a later change to that row is
  // accepted and settles the open rejections.
  await vps.query('DELETE FROM products WHERE id = 900');
  const retry = await call(route()['/sync/ingest'], {
    body: { changes: [{ id: 9999, table_name: 'products', op: 'U', row_data: productChange.row_data }] },
    headers: withKey(),
  });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.deepEqual(retry.body.rejected, []);
  const { rows: open } = await vps.query('SELECT count(*)::int AS n FROM sync_rejected WHERE resolved_at IS NULL');
  assert.equal(open[0].n, 0, 'resolved_at set on the matching rejections');
  assert.equal((await vps.query("SELECT name FROM products")).rows[0].name, 'Block');
});

// ---- T2.7: stock can't go below zero, on either side ----

test('negative stock is refused locally (23514) and a negative change from sync is set aside', async () => {
  await resetProducts();
  await factory.query('TRUNCATE stock RESTART IDENTITY CASCADE');
  await vps.query('TRUNCATE stock RESTART IDENTITY CASCADE');
  await assert.rejects(
    factory.query("INSERT INTO stock (name, unit_price, quantity) VALUES ('neg probe', 0, -1)"),
    (err) => err.code === '23514' && err.constraint === 'stock_quantity_nonneg'
  );

  // A change made before the constraint existed (or by an old install)
  // carrying quantity = -1: crafted, since the factory itself refuses it now.
  await factory.query("INSERT INTO stock (name, unit_price, quantity) VALUES ('Block', 0, 5)");
  await factory.query("INSERT INTO customers (name) VALUES ('Ali')");
  const sent = await outbox();
  const stockChange = sent.find((c) => c.table_name === 'stock');
  stockChange.row_data = { ...stockChange.row_data, quantity: -1 };

  const res = await call(route()['/sync/ingest'], { body: { changes: sent }, headers: withKey() });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.rejected.map((r) => [r.id, r.code, r.constraint]),
    [[stockChange.id, '23514', 'stock_quantity_nonneg']]);
  assert.equal(res.body.applied, sent.length - 1);
  const { rows: rej } = await vps.query('SELECT table_name, op, code FROM sync_rejected');
  assert.deepEqual(rej.map((r) => [r.table_name, r.op, r.code]), [['stock', 'I', '23514']]);
  assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['Ali'], 'the rest of the batch applied');
  assert.equal((await vps.query('SELECT count(*)::int AS n FROM stock')).rows[0].n, 0);

  // Through the worker: the batch doesn't put sync into "Problem".
  await vps.query('TRUNCATE customers RESTART IDENTITY CASCADE');
  await vps.query('TRUNCATE sync_rejected');
  await factory.query("UPDATE sync_outbox SET row_data = jsonb_set(row_data, '{quantity}', '-1') WHERE table_name = 'stock'");
  const status = await syncRound();
  assert.equal(status.state, 'ok', status.error);
  assert.equal(status.pending, 0);
  assert.equal((await vps.query("SELECT code FROM sync_rejected")).rows[0].code, '23514');
});

test('a schema problem (unknown op) still refuses the whole batch: 409, nothing applied, nothing set aside', async () => {
  await resetProducts();
  await factory.query("INSERT INTO customers (name) VALUES ('Ali')");
  const changes = [...await outbox(), { id: 1, table_name: 'customers', op: 'X', row_data: { id: 1 } }];
  const res = await call(route()['/sync/ingest'], { body: { changes }, headers: withKey() });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /unknown op "X"/);
  assert.deepEqual(await customersOn(vps), []);
  assert.equal((await vps.query('SELECT count(*)::int AS n FROM sync_rejected')).rows[0].n, 0);
});

// ---- T1.4: the factory quarantines refused changes; the Owner retries ----

test('a refused change is quarantined on the factory, leaves the outbox, and is not re-sent', async () => {
  await resetProducts();
  await vps.query("INSERT INTO products (id, name, type, size) VALUES (900, 'Block', 'stock', '6in')");
  await factory.query("INSERT INTO customers (name) VALUES ('Ali')");
  await factory.query("INSERT INTO products (name, type, size) VALUES ('Block', 'stock', '6in')");
  const productChange = (await outbox()).find((c) => c.table_name === 'products');

  let status = await syncRound();
  assert.equal(status.state, 'ok', status.error);
  assert.equal(status.pending, 0, 'outbox drained');
  assert.equal(status.quarantined, 1);

  const { rows: q } = await factory.query('SELECT outbox_id, table_name, op, code, constraint_name, resolved_at FROM sync_quarantine');
  assert.equal(q.length, 1);
  assert.equal(String(q[0].outbox_id), String(productChange.id));
  assert.deepEqual([q[0].table_name, q[0].op, q[0].code, q[0].constraint_name], ['products', 'I', '23505', 'products_name_type_size_idx']);
  assert.deepEqual((await outbox()).filter((c) => c.id === productChange.id), [], 'gone from the outbox');
  assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['Ali']);

  // "Restart": a new worker sends nothing again.
  status = await syncRound();
  assert.equal(status.pending, 0);
  assert.equal((await vps.query('SELECT count(*)::int AS n FROM sync_rejected')).rows[0].n, 1, 'not re-sent');

  // An ordinary change: drains, quarantine count unchanged.
  await factory.query("INSERT INTO customers (name) VALUES ('Bilal')");
  status = await syncRound();
  assert.equal(status.state, 'ok');
  assert.equal(status.pending, 0);
  assert.equal(status.quarantined, 1);
  assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['Ali', 'Bilal']);
});

test('Retry re-sends the row as it is now and settles both sides; a row deleted since is retried as a delete', async () => {
  const { Pool } = require('pg');
  const factoryPool = new Pool({ connectionString: factoryUrl, max: 2 });
  const quarantine = require(path.join(BACKEND_DIR, 'services', 'syncQuarantine'));
  try {
    await resetProducts();
    await vps.query("INSERT INTO products (id, name, type, size) VALUES (900, 'Block', 'stock', '6in')");
    await factory.query("INSERT INTO products (name, type, size) VALUES ('Block', 'stock', '6in')");
    await syncRound();
    // The factory row changes after it was refused; retry must send this version.
    await factory.query("UPDATE products SET description = 'edited later' WHERE name = 'Block'");
    await syncRound(); // the update is refused too (same duplicate)
    const open = await quarantine.listOpen(factoryPool);
    assert.equal(open.length, 2);

    // The Owner has the conflicting product removed online, then presses Retry.
    await vps.query('DELETE FROM products WHERE id = 900');
    assert.deepEqual(await quarantine.retry(open[0].id, factoryPool), { op: 'U' });
    assert.equal((await quarantine.listOpen(factoryPool)).length, 0, 'every entry for that row is settled');
    assert.equal(await quarantine.retry(open[0].id, factoryPool), null, 'a second retry does nothing');
    const queued = await outbox();
    assert.equal(queued.length, 1);
    assert.equal(queued[0].op, 'U');
    assert.equal(queued[0].row_data.description, 'edited later', 'the row as it is now');

    const status = await syncRound();
    assert.equal(status.state, 'ok', status.error);
    assert.equal(status.quarantined, 0);
    const { rows: online } = await vps.query('SELECT id, name, description FROM products');
    assert.deepEqual(online, [{ id: queued[0].row_data.id, name: 'Block', description: 'edited later' }]);
    const { rows: [rej] } = await vps.query('SELECT count(*)::int AS n FROM sync_rejected WHERE resolved_at IS NULL');
    assert.equal(rej.n, 0, 'sync_rejected.resolved_at set on the server');

    // Refused, then deleted at the factory before the retry -> retried as a delete.
    await vps.query("INSERT INTO products (id, name, type, size) VALUES (901, 'Pipe', 'stock', '12in')");
    await factory.query("INSERT INTO products (name, type, size) VALUES ('Pipe', 'stock', '12in')");
    await syncRound();
    const [pipe] = await quarantine.listOpen(factoryPool);
    await factory.query("DELETE FROM products WHERE name = 'Pipe'");
    await syncRound();
    assert.deepEqual(await quarantine.retry(pipe.id, factoryPool), { op: 'D' });
    assert.deepEqual((await outbox()).map((c) => [c.op, c.row_data]), [['D', { id: pipe.row_data.id }]]);
  } finally {
    await factoryPool.end();
  }
});

// ---- T1.5: status on both sides + heartbeat ----

test('the heartbeat needs the registered key and drives the online green / amber / red', async () => {
  const { getFactoryStatus } = require(path.join(BACKEND_DIR, 'services', 'factoryStatus'));
  const beat = { sync_state: 'ok', outbox_count: 3, oldest_outbox_age_sec: 42, quarantine_count: 1, whatsapp_state: 'no_target', whatsapp_oldest_age_sec: 7 };

  const refused = await call(route()['/sync/heartbeat'], { body: beat, headers: withKey('0'.repeat(64)) });
  assert.equal(refused.status, 403);

  const ok = await call(route()['/sync/heartbeat'], { body: beat, headers: withKey() });
  assert.equal(ok.status, 200);
  const { rows: [hb] } = await vps.query('SELECT outbox_count, oldest_outbox_age_sec, quarantine_count, whatsapp_state, sync_state FROM sync_heartbeat');
  assert.deepEqual(hb, { outbox_count: 3, oldest_outbox_age_sec: 42, quarantine_count: 1, whatsapp_state: 'no_target', sync_state: 'ok' });

  let st = await getFactoryStatus(vpsPool);
  assert.equal(st.level, 'green');
  assert.equal(st.heartbeat.outboxCount, 3);

  // Factory switched off: nothing heard for 5 min, then 45 min.
  await vps.query("UPDATE sync_writer SET last_ingest_at = NULL");
  await vps.query("UPDATE sync_heartbeat SET received_at = now() - interval '5 minutes'");
  st = await getFactoryStatus(vpsPool);
  assert.equal(st.level, 'amber');
  await vps.query("UPDATE sync_heartbeat SET received_at = now() - interval '45 minutes'");
  st = await getFactoryStatus(vpsPool);
  assert.equal(st.level, 'red');
  // An upload counts as being heard from, too.
  await vps.query('UPDATE sync_writer SET last_ingest_at = now()');
  assert.equal((await getFactoryStatus(vpsPool)).level, 'green');

  // A newly registered PC starts with a clean slate, not the old PC's heartbeat.
  uploadKey = await registerPC();
  st = await getFactoryStatus(vpsPool);
  assert.equal(st.heartbeat, null);
  assert.equal(st.lastSeenAt, null);
  assert.equal(st.level, 'red', 'not heard from yet');
});

test('factory status: green when uploaded, amber after 5 min of backlog, red when blocked, refused or a table has no key', async () => {
  const { Pool } = require('pg');
  const { collectStatus } = require('../lib/status');
  const pool = new Pool({ connectionString: factoryUrl, max: 1 });
  const fakeRelay = (relayState, whatsappQueued) => ({
    status: async () => ({ relayState, relayError: null, whatsappQueued, oldestWhatsappAge: 0 }),
  });
  try {
    await resetProducts();
    let s = await collectStatus({ pool, sync: { state: 'ok' }, relay: fakeRelay('ok', 0) });
    for (const k of ['state', 'lastSyncedAt', 'outboxCount', 'oldestOutboxAge', 'quarantineCount', 'relayState', 'whatsappQueued', 'oldestWhatsappAge', 'tablesWithoutPk']) {
      assert.ok(k in s, `status has ${k}`);
    }
    assert.equal(s.level, 'green');

    await factory.query("INSERT INTO customers (name) VALUES ('Ali')");
    s = await collectStatus({ pool, sync: { state: 'ok' }, relay: null });
    assert.equal(s.outboxCount, 1);
    assert.equal(s.level, 'green', 'a fresh backlog is still green');
    await factory.query("UPDATE sync_outbox SET created_at = now() - interval '6 minutes'");
    s = await collectStatus({ pool, sync: { state: 'offline' }, relay: null });
    assert.equal(s.level, 'amber');
    assert.ok(s.oldestOutboxAge >= 360);

    s = await collectStatus({ pool, sync: { state: 'blocked_not_writer' }, relay: null });
    assert.equal(s.level, 'red');
    s = await collectStatus({ pool, sync: { state: 'ok' }, relay: null, tablesWithoutPk: ['notes'] });
    assert.equal(s.level, 'red');
    assert.match(s.problems.join(' '), /notes/);

    await factory.query("INSERT INTO sync_quarantine (table_name, op, row_data, code) VALUES ('products', 'I', '{}', '23505')");
    s = await collectStatus({ pool, sync: { state: 'ok' }, relay: null });
    assert.equal(s.quarantineCount, 1);
    assert.equal(s.level, 'red');

    await resetProducts();
    s = await collectStatus({ pool, sync: { state: 'ok' }, relay: fakeRelay('n8n_rejecting', 2) });
    assert.equal(s.level, 'amber', 'WhatsApp alerts stuck: amber');
  } finally {
    await pool.end();
  }
});

// ---- T1.7: /sync/config says why WhatsApp is off ----

test('/sync/config gives a reason when N8N_PUBLIC_WEBHOOK_URL is unset, and none when set', async () => {
  const prev = process.env.N8N_PUBLIC_WEBHOOK_URL;
  try {
    delete process.env.N8N_PUBLIC_WEBHOOK_URL;
    let res = await call(route()['/sync/config'], { headers: withKey() });
    assert.equal(res.status, 200);
    assert.equal(res.body.whatsapp, null);
    assert.equal(res.body.reason, 'N8N_PUBLIC_WEBHOOK_URL unset');

    process.env.N8N_PUBLIC_WEBHOOK_URL = 'https://n8n.example/webhook/fms-alert';
    res = await call(route()['/sync/config'], { headers: withKey() });
    assert.equal(res.body.whatsapp.url, 'https://n8n.example/webhook/fms-alert');
    assert.ok(!('reason' in res.body));
  } finally {
    if (prev === undefined) delete process.env.N8N_PUBLIC_WEBHOOK_URL;
    else process.env.N8N_PUBLIC_WEBHOOK_URL = prev;
  }
});

// ---- T1.9: faster upload + final upload on quit ----

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return Date.now() - started;
    await sleep(100);
  }
  return null;
}

test('a write is uploaded within ~3 s, and a burst of five goes up as one push', async (t) => {
  await resetProducts();
  const worker = new SyncWorker({ databaseUrl: factoryUrl, serverUrl: SERVER_URL, uploadKey, log, onStatus: () => {} });
  worker.start();
  try {
    // Let the start-up round finish, so only the notification can trigger the next one.
    await waitFor(async () => !worker.running && worker.timer, 5000);
    await sleep(300);

    const t0 = Date.now();
    await factory.query("INSERT INTO customers (name) VALUES ('Ali')");
    const took = await waitFor(async () => (await customersOn(vps)).length === 1, 6000);
    assert.ok(took !== null && Date.now() - t0 < 3500, `on the server after ${took} ms (idle poll is 15 s)`);
    t.diagnostic(`write -> on the server in ${Date.now() - t0} ms`);

    const before = logs.length;
    for (const name of ['B1', 'B2', 'B3', 'B4', 'B5']) {
      await factory.query('INSERT INTO customers (name) VALUES ($1)', [name]);
    }
    assert.ok(await waitFor(async () => (await customersOn(vps)).length === 6, 6000) !== null);
    const pushes = logs.slice(before).filter((l) => l.startsWith('sync: pushed'));
    assert.deepEqual(pushes, ['sync: pushed 5 change(s)'], 'one coalesced push');
    t.diagnostic(`five writes -> log: ${JSON.stringify(pushes)}`);
  } finally {
    await worker.stop();
  }
});

test('the final upload on quit sends what is waiting; with the server unreachable it gives up at the cap and keeps it', async () => {
  await resetProducts();
  await factory.query("INSERT INTO customers (name) VALUES ('Ali')");
  let worker = new SyncWorker({ databaseUrl: factoryUrl, serverUrl: SERVER_URL, uploadKey, log, onStatus: () => {} });
  assert.equal(await worker.finalUpload(10_000), 0);
  await worker.stop();
  assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['Ali']);

  // Server never answers: the request hangs until the final upload aborts it.
  await factory.query("INSERT INTO customers (name) VALUES ('Bilal')");
  const routed = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => new Promise((resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('aborted', { cause: { code: 'ABORT_ERR' } })));
  });
  let status;
  worker = new SyncWorker({ databaseUrl: factoryUrl, serverUrl: SERVER_URL, uploadKey, log, onStatus: (s) => { status = s; } });
  try {
    const t0 = Date.now();
    assert.equal(await worker.finalUpload(1000), 1, 'one change left for the next start');
    assert.ok(Date.now() - t0 < 2500, `returned after ${Date.now() - t0} ms`);
    assert.equal(status.state, 'offline');
  } finally {
    globalThis.fetch = routed;
    await worker.stop();
  }
  assert.equal((await outbox()).length, 1, 'still in the outbox');

  // Next start, network back: it drains.
  assert.equal((await syncRound()).pending, 0);
  assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['Ali', 'Bilal']);
});

test('an idle PC that was replaced finds out from its heartbeat: worker stops, status red', async () => {
  const { StatusReporter } = require('../lib/status');
  await resetProducts();
  const firstKey = uploadKey;
  let lastSync = { state: 'ok' };
  const worker = new SyncWorker({
    databaseUrl: factoryUrl, serverUrl: SERVER_URL, uploadKey: firstKey, log, onStatus: (s) => { lastSync = s; },
  });
  const reporter = new StatusReporter({
    databaseUrl: factoryUrl, statusFile: path.join(tmpDir, 'status.json'), getSync: () => lastSync,
    relay: null, tablesWithoutPk: [], upload: { serverUrl: SERVER_URL, uploadKey: firstKey }, log,
    onNotWriter: (m) => worker.markNotWriter(m),
  });
  try {
    await reporter.refresh();
    await reporter.sendHeartbeat();
    assert.equal(lastSync.state, 'ok', 'still the main PC');

    await registerPC(); // another PC takes over; this one has nothing to upload
    await reporter.sendHeartbeat();
    assert.equal(lastSync.state, 'blocked_not_writer');
    assert.equal(worker.stopped, true);
    assert.equal(reporter.last.level, 'red');
    assert.match(reporter.last.problems[0], /no longer the registered main PC/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmpDir, 'status.json'), 'utf8')).state, 'blocked_not_writer');
  } finally {
    await reporter.stop();
    await worker.stop();
  }
});

// ---- Ingest: a table whose primary key is text (report_schedules) ----

test('a change to report_schedules (text primary key) uploads instead of stalling sync', async () => {
  // The factory's cron does this every time a scheduled report runs.
  await factory.query("UPDATE report_schedules SET last_run_at = now(), enabled = true WHERE frequency = 'daily'");
  await factory.query("INSERT INTO customers (name) VALUES ('same batch')");
  const status = await syncRound();
  assert.equal(status.state, 'ok', status.error);
  assert.equal(status.pending, 0);
  const { rows: [r] } = await vps.query("SELECT enabled, last_run_at FROM report_schedules WHERE frequency = 'daily'");
  assert.equal(r.enabled, true);
  assert.ok(r.last_run_at);
  assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['same batch']);
  await factory.query("UPDATE report_schedules SET last_run_at = NULL, enabled = false WHERE frequency = 'daily'");
  assert.equal((await syncRound()).state, 'ok');
});

// ---- T2.4: health endpoint for the n8n watchdog ----

test('/sync/health needs SYNC_TOKEN, alerts on each problem with a recent heartbeat, and stays quiet when the PC is off', async () => {
  const prevToken = process.env.SYNC_TOKEN;
  process.env.SYNC_TOKEN = 'watchdog-test-token';
  const health = async (token = 'watchdog-test-token') => call(route()['/sync/health'], { headers: { 'X-Sync-Token': token } });
  const beat = async (fields) => {
    const r = await call(route()['/sync/heartbeat'], {
      body: { sync_state: 'ok', outbox_count: 0, oldest_outbox_age_sec: 0, quarantine_count: 0, whatsapp_state: 'ok', whatsapp_oldest_age_sec: 0, ...fields },
      headers: withKey(),
    });
    assert.equal(r.status, 200);
  };
  const keys = async () => (await health()).body.alerts.map((a) => a.key);
  try {
    assert.equal((await health('wrong')).status, 403);
    assert.equal((await call(route()['/sync/health'], {})).status, 403, 'no token');
    assert.equal((await health('watchdog-test-token-and-more')).status, 403);

    // Freshly registered, never heard from: no heartbeat, nothing to alert on.
    let h = await health();
    assert.equal(h.status, 200);
    assert.equal(h.body.writer_registered, true);
    assert.equal(h.body.heartbeat, null);
    assert.equal(h.body.heartbeat_recent, false);
    assert.deepEqual(h.body.alerts, []);

    await beat({});
    h = await health();
    assert.equal(h.body.heartbeat_recent, true);
    assert.equal(h.body.heartbeat.sync_state, 'ok');
    assert.deepEqual(h.body.alerts, [], 'all fine');

    // Each condition on its own (plan T2.4 step 2).
    await beat({ outbox_count: 4, oldest_outbox_age_sec: 1801 });
    assert.deepEqual(await keys(), ['outbox_backlog']);
    await beat({ outbox_count: 4, oldest_outbox_age_sec: 1800 });
    assert.deepEqual(await keys(), [], 'exactly 30 min is not yet a backlog');
    await beat({ quarantine_count: 2 });
    assert.deepEqual(await keys(), ['quarantine']);
    await beat({ whatsapp_state: 'n8n_rejecting' });
    assert.deepEqual(await keys(), ['whatsapp_state']);
    await beat({ whatsapp_state: null });
    assert.deepEqual(await keys(), [], 'a PC with no relay state is not a WhatsApp fault');
    await beat({ whatsapp_oldest_age_sec: 3601 });
    assert.deepEqual(await keys(), ['whatsapp_backlog']);
    await beat({ sync_state: 'blocked_not_writer' });
    assert.deepEqual(await keys(), ['not_writer']);
    await beat({ quarantine_count: 1, whatsapp_state: 'no_target' });
    h = await health();
    assert.deepEqual(h.body.alerts.map((a) => a.key), ['quarantine', 'whatsapp_state']);
    assert.match(h.body.alerts[0].message, /1 change\(s\) were refused/);

    // Negative case: the PC goes off with problems still in its last
    // heartbeat. After 20 minutes of silence, no alert.
    await vps.query("UPDATE sync_heartbeat SET received_at = now() - interval '20 minutes'");
    h = await health();
    assert.equal(h.body.heartbeat_recent, false);
    assert.deepEqual(h.body.alerts, []);
    // A few missed heartbeats still count as on.
    await vps.query("UPDATE sync_heartbeat SET received_at = now() - interval '4 minutes'");
    assert.deepEqual(await keys(), ['quarantine', 'whatsapp_state']);

    // Open rejections on the server side are counted.
    await vps.query(`INSERT INTO sync_rejected (outbox_id, table_name, op, pk, row_data, code)
                     VALUES (1, 'customers', 'I', '{"id":1}', '{"id":1}', '23505')`);
    assert.equal((await health()).body.rejectedOpenCount, 1);
    await vps.query('DELETE FROM sync_rejected');
  } finally {
    if (prevToken === undefined) delete process.env.SYNC_TOKEN; else process.env.SYNC_TOKEN = prevToken;
  }
});

// ---- T2.8: rebuild the online server from the factory ----

// Every synced table, row for row, as one comparable value.
async function allSyncedRows(client) {
  const { rows: tables } = await factory.query(
    `SELECT c.relname AS t FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
      WHERE tg.tgname = 'fms_sync_capture' ORDER BY 1`
  );
  const out = {};
  for (const { t } of tables) {
    const { rows } = await client.query(`SELECT to_jsonb(x) AS r FROM public.${client.escapeIdentifier(t)} x`);
    out[t] = rows.map((r) => JSON.stringify(r.r)).sort();
  }
  return out;
}
const countsOf = (all) => Object.fromEntries(Object.entries(all).map(([t, rows]) => [t, rows.length]));

// What the Owner does on the factory PC: a code from scripts/createSetupCode.js
// on the new server, register with this PC's existing writer_id, then resend
// everything and prune — through the real SyncWorker.
async function rebuildFromFactory(writerId) {
  const { resendAndPrune } = require('../lib/rebuild');
  const { registerWriter } = require('../lib/snapshot');
  const { code } = await syncWriter.createSetupCode(vpsPool);
  const { uploadKey: key } = await registerWriter({ serverUrl: SERVER_URL, code, writerId });
  uploadKey = key;
  const worker = new SyncWorker({ databaseUrl: factoryUrl, serverUrl: SERVER_URL, uploadKey: key, log, onStatus: () => {} });
  worker.start();
  try {
    return await resendAndPrune({ databaseUrl: factoryUrl, worker, serverUrl: SERVER_URL, uploadKey: key, log, pollMs: 100, progress: (m) => console.log('PROGRESS', m) });
  } finally {
    await worker.stop();
  }
}

test('rebuild: an empty new server gets every row; a second run changes nothing; the factory is untouched', async () => {
  await factory.query("INSERT INTO customers (name, phone) VALUES ('Ali', '0300'), ('Bilal', NULL), ('Chand', '0333')");
  await factory.query("DELETE FROM customers WHERE name = 'Bilal'");
  await factory.query("INSERT INTO stock (name, unit_price, quantity) VALUES ('rebuild probe', 10, 4)");
  await factory.query("INSERT INTO users (username, email, password_hash, role) VALUES ('rebuild-owner', 'rebuild@test', 'x', 'Owner')");
  assert.equal((await syncRound()).state, 'ok');

  // The server is lost and replaced: migrations only, nobody registered.
  const { rows: tables } = await factory.query(
    "SELECT c.relname AS t FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid WHERE tg.tgname = 'fms_sync_capture'"
  );
  await vps.query(`TRUNCATE ${tables.map((r) => `public.${vps.escapeIdentifier(r.t)}`).join(', ')} RESTART IDENTITY CASCADE`);
  await vps.query('UPDATE sync_writer SET writer_id = NULL, upload_key_hash = NULL, registered_at = NULL, last_ingest_at = NULL');
  assert.equal((await customersOn(vps)).length, 0);
  // The factory's old key means nothing to the new server.
  await factory.query("INSERT INTO customers (name) VALUES ('Dawood')");
  assert.equal((await syncRound()).state, 'blocked_not_writer');

  const before = await allSyncedRows(factory);
  assert.ok(before.users.length > 0, 'the factory has users, so the Owner can log in online afterwards');
  const writerId = crypto.randomUUID();
  const first = await rebuildFromFactory(writerId);
  assert.equal(first.queued.customers, 3);
  assert.deepEqual(await allSyncedRows(vps), before, 'every synced table identical on both sides');
  assert.deepEqual(await allSyncedRows(factory), before, 'nothing changed at the factory');
  assert.equal((await outbox()).length, 0);
  const { rows: [w] } = await vps.query('SELECT writer_id FROM sync_writer');
  assert.equal(w.writer_id, writerId);
  // Sequences on the server moved past the resent ids.
  const { rows: [{ next }] } = await vps.query("SELECT nextval(pg_get_serial_sequence('customers', 'id'))::int AS next");
  assert.ok(next > Math.max(...(await customersOn(factory)).map((c) => c.id)));

  // Again: same counts, no duplicates.
  const second = await rebuildFromFactory(writerId);
  assert.deepEqual(countsOf(await allSyncedRows(vps)), countsOf(before));
  assert.deepEqual(await allSyncedRows(vps), before);
  assert.ok(Object.values(second.deleted).every((n) => n === 0), 'nothing left to prune the second time');
  await factory.query("DELETE FROM stock WHERE name = 'rebuild probe'");
  await factory.query("DELETE FROM users WHERE username = 'rebuild-owner'");
  assert.equal((await syncRound()).state, 'ok');
});

test('rebuild: a server restored from an older backup gets the newer rows, and loses rows deleted since', async () => {
  await factory.query("INSERT INTO customers (name) VALUES ('Ali'), ('Bilal'), ('Chand')");
  assert.equal((await syncRound()).state, 'ok');
  const ids = Object.fromEntries((await customersOn(factory)).map((c) => [c.name, c.id]));

  // The backup was taken here. Since then the factory renamed Ali, deleted
  // Bilal and added Dawood, and the server took those changes too...
  await factory.query("UPDATE customers SET name = 'Ali Khan' WHERE id = $1", [ids.Ali]);
  await factory.query('DELETE FROM customers WHERE id = $1', [ids.Bilal]);
  await factory.query("INSERT INTO customers (name) VALUES ('Dawood')");
  assert.equal((await syncRound()).state, 'ok');
  // ...then the server was restored from that backup: back to Ali, Bilal, Chand.
  await vps.query('TRUNCATE customers RESTART IDENTITY CASCADE');
  await vps.query(
    "INSERT INTO customers (id, name) VALUES ($1, 'Ali'), ($2, 'Bilal'), ($3, 'Chand')",
    [ids.Ali, ids.Bilal, ids.Chand]
  );
  assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['Ali', 'Bilal', 'Chand']);

  const result = await rebuildFromFactory(crypto.randomUUID());
  assert.equal(result.deleted.customers, 1, 'Bilal, deleted at the factory after the backup');
  assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['Ali Khan', 'Chand', 'Dawood']);
  assert.deepEqual(await customersOn(vps), await customersOn(factory));
});

test('prune: only the registered PC, never a server-only table; uploads wait while the worker is paused', async () => {
  const prune = (body, key = uploadKey) => call(route()['/sync/prune'], { body, headers: withKey(key) });
  assert.equal((await prune({ table_name: 'customers', keys: [] }, '0'.repeat(64))).status, 403);
  assert.equal((await prune({ table_name: 'sync_writer', keys: [] })).status, 409);
  assert.equal((await prune({ table_name: 'pgmigrations', keys: [] })).status, 409);
  assert.equal((await prune({ table_name: 'customers', keys: [{ name: 'x' }] })).status, 409, 'a key without the primary key');
  assert.equal((await prune({ table_name: 'customers' })).status, 400);
  const { rows: [w] } = await vps.query('SELECT writer_id FROM sync_writer');
  assert.ok(w.writer_id, 'sync_writer untouched');

  const worker = new SyncWorker({ databaseUrl: factoryUrl, serverUrl: SERVER_URL, uploadKey, log, onStatus: () => {} });
  worker.start();
  try {
    await worker.pause();
    await factory.query("INSERT INTO customers (name) VALUES ('Paused')");
    await new Promise((r) => setTimeout(r, 3000));
    assert.equal((await customersOn(vps)).length, 0, 'nothing uploaded while paused');
    worker.resume();
    for (let i = 0; i < 50 && (await customersOn(vps)).length === 0; i++) await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual((await customersOn(vps)).map((c) => c.name), ['Paused']);
  } finally {
    await worker.stop();
  }
});

// ---- T2.1: send-only report scheduler on the online server ----

test('send-only scheduler: a due report goes out once, a failed send retries, a racing second process does not double-send, the mirror is never written', async () => {
  const scheduler = require(path.join(BACKEND_DIR, 'services', 'sendOnlyScheduler'));
  const sent = [];
  let failing = false;
  const send = async (message) => {
    await new Promise((r) => setTimeout(r, 150)); // n8n round trip
    if (failing) return { ok: false, error: 'n8n webhook responded with 500' };
    sent.push(message);
    return { ok: true, queued: false };
  };
  const reports = () => sent.filter((m) => /Report — /.test(m));
  const digests = () => sent.filter((m) => /FMS Daily Alerts/.test(m));
  const at = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
  const logRows = async (frequency) => (await vps.query(
    'SELECT frequency, period_key, status, payload FROM report_dispatch_log WHERE frequency = $1', [frequency]
  )).rows;
  const mirror = async () => (await vps.query(
    `SELECT (SELECT count(*)::int FROM reports) AS reports,
            (SELECT json_agg(r ORDER BY frequency) FROM report_schedules r) AS schedules`
  )).rows[0];

  await vps.query('DELETE FROM report_dispatch_log');
  // As synced from the factory: daily report at 21:00. Weekly/monthly off.
  await vps.query("UPDATE report_schedules SET enabled = (frequency = 'daily'), run_time = '21:00', last_run_at = NULL");
  const before = await mirror();
  try {
    // Digests first. 7:30 is caught up until 10:00; a start at 10:05 sends
    // only the 10:00 one, never both.
    await scheduler.tick(at(7, 29), { send });
    assert.equal(sent.length, 0, 'nothing due at 7:29');
    await scheduler.tick(at(9, 15), { send });
    await scheduler.tick(at(9, 16), { send });
    assert.equal(digests().length, 1);
    assert.match(digests()[0], /FMS Daily Alerts\* \(7:30 AM\)/);
    await vps.query("DELETE FROM report_dispatch_log WHERE frequency = 'digest'");
    await scheduler.tick(at(10, 5), { send });
    assert.equal(digests().length, 2);
    assert.match(digests()[1], /\(10:00 AM\)/);
    assert.equal((await logRows('digest')).length, 1);
    assert.match((await logRows('digest'))[0].period_key, /^digest:1000:\d{4}-\d{2}-\d{2}$/);

    await scheduler.tick(at(20, 59), { send });
    assert.equal(reports().length, 0, 'not due before run_time');

    // n8n down at 21:00: nothing recorded, so the next minute tries again.
    failing = true;
    await scheduler.tick(at(21, 0), { send });
    assert.equal((await logRows('daily')).length, 0);
    failing = false;

    // 21:01, and a second backend (or a restart) ticking in the same minute.
    await Promise.all([scheduler.tick(at(21, 1), { send }), scheduler.tick(at(21, 1), { send })]);
    await scheduler.tick(at(21, 2), { send });
    await scheduler.tick(at(23, 59), { send });
    assert.equal(reports().length, 1, 'exactly one report message for the day');
    assert.match(reports()[0], /Report — Daily/);
    const log = await logRows('daily');
    assert.equal(log.length, 1);
    assert.match(log[0].period_key, /^daily:\d{4}-\d{2}-\d{2}$/);
    assert.equal(log[0].status, 'sent');
    assert.equal(log[0].payload.message, reports()[0]);
    assert.equal(digests().length, 2, 'the 10:00 digest was not sent again either');

    assert.deepEqual(await mirror(), before, 'no report row stored, report_schedules untouched');

    // Registered in all four places (§4): no capture trigger on the factory,
    // ingest refuses it (snapshot: see the snapshot test).
    const { rowCount: trig } = await factory.query(
      "SELECT 1 FROM pg_trigger WHERE tgname = 'fms_sync_capture' AND tgrelid = 'report_dispatch_log'::regclass"
    );
    assert.equal(trig, 0);
    const forged = await call(route()['/sync/ingest'], {
      body: { changes: [{ id: 1, table_name: 'report_dispatch_log', op: 'I', row_data: { id: 9, frequency: 'x', period_key: 'x', status: 'sent' } }] },
      headers: withKey(),
    });
    assert.equal(forged.status, 409);
  } finally {
    await vps.query('DELETE FROM report_dispatch_log');
    await vps.query("UPDATE report_schedules SET enabled = false, run_time = '23:55'");
  }
});

// ---- T2.3: freshness label on server-sent messages + history ----

test('server-sent reports say how fresh the data is: stale warning after 2 h, "period incomplete", data as of; the history lists them', async () => {
  const scheduler = require(path.join(BACKEND_DIR, 'services', 'sendOnlyScheduler'));
  const ReportsController = require(path.join(BACKEND_DIR, 'controllers', 'ReportsController'));
  const sent = [];
  const send = async (message) => { sent.push(message); return { ok: true, queued: false }; };
  const now = new Date(); now.setHours(21, 30, 0, 0);
  const ago = (min) => new Date(now.getTime() - min * 60000);
  const beat = (receivedAt, outbox) => vps.query(
    `INSERT INTO sync_heartbeat (id, received_at, outbox_count) VALUES (1, $1, $2)
     ON CONFLICT (id) DO UPDATE SET received_at = $1, outbox_count = $2`, [receivedAt, outbox]
  );
  const daily = async () => {
    await vps.query('DELETE FROM report_dispatch_log');
    await scheduler.tick(now, { send });
    return sent.filter((m) => /Report — Daily/.test(m)).at(-1);
  };
  await vps.query("UPDATE report_schedules SET enabled = (frequency = 'daily'), run_time = '21:00'");
  try {
    // Fresh: uploaded a minute ago.
    await vps.query('UPDATE sync_writer SET last_ingest_at = $1', [ago(1)]);
    await vps.query('DELETE FROM sync_heartbeat');
    let m = await daily();
    assert.doesNotMatch(m, /Old data|Period incomplete/);
    assert.match(m, /\n\n_Data as of .+_$/);
    const asOf = m.match(/_Data as of (.+)_$/)[1];

    // Nothing uploaded for 5 h, but a heartbeat a minute ago said nothing was
    // waiting: the copy is still complete.
    await vps.query('UPDATE sync_writer SET last_ingest_at = $1', [ago(300)]);
    await beat(ago(1), 0);
    m = await daily();
    assert.doesNotMatch(m, /Old data|Period incomplete/);
    assert.equal(m.match(/_Data as of (.+)_$/)[1], asOf, 'data as of = the caught-up heartbeat');

    // Factory off since 3 h ago (last heartbeat then, changes were waiting).
    await vps.query('UPDATE sync_writer SET last_ingest_at = $1', [ago(185)]);
    await beat(ago(180), 4);
    m = await daily();
    assert.match(m, /^⚠️ \*Old data:\* the factory has not uploaded for 3 h\./);
    assert.match(m, /⚠️ \*Period incomplete:\* anything entered at the factory after .+ is not included\./);
    const { rows: [row] } = await vps.query("SELECT payload FROM report_dispatch_log WHERE frequency = 'daily'");
    assert.equal(new Date(row.payload.dataAsOf).getTime(), ago(185).getTime(), 'dataAsOf stored with what was sent');

    // 30 min behind: not stale, but the period is incomplete.
    await vps.query('UPDATE sync_writer SET last_ingest_at = $1', [ago(30)]);
    await vps.query('DELETE FROM sync_heartbeat');
    m = await daily();
    assert.doesNotMatch(m, /Old data/);
    assert.match(m, /Period incomplete/);

    // Digests carry the label too (no period).
    await vps.query('DELETE FROM report_dispatch_log');
    const morning = new Date(now); morning.setHours(7, 45, 0, 0);
    await vps.query('UPDATE sync_writer SET last_ingest_at = $1', [new Date(morning.getTime() - 10 * 3600000)]);
    await scheduler.tick(morning, { send });
    const digest = sent.at(-1);
    assert.match(digest, /^⚠️ \*Old data:\* the factory has not uploaded for 10 h\./);
    assert.match(digest, /FMS Daily Alerts/);
    assert.doesNotMatch(digest, /Period incomplete/);

    // History view (GET /api/reports/dispatch-log): the 7:45 digest, then at
    // 21:30 the daily report and the 10:00 digest (still in its window).
    await scheduler.tick(now, { send });
    const list = await call(ReportsController.listDispatchLog, {});
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.map((r) => r.period_key.replace(/:\d{4}-\d{2}-\d{2}$/, '')).sort(),
      ['daily', 'digest:0730', 'digest:1000']);
    const d = list.body.data.find((r) => r.frequency === 'daily');
    assert.match(d.label, /^Daily — /);
    assert.equal(d.message, sent.filter((x) => /Report — Daily/.test(x)).at(-1), 'the message as sent');
    assert.ok(d.data_as_of);
    assert.equal(list.body.pagination.total, 3);
  } finally {
    await vps.query('DELETE FROM report_dispatch_log');
    await vps.query('DELETE FROM sync_heartbeat');
    await vps.query("UPDATE report_schedules SET enabled = false, run_time = '23:55'");
  }
});

// T2.5. pg_dump / pg_restore come from PATH here (Postgres 16 client tools);
// the installer ships the Windows ones in tools/ (scripts/fetch-tools.js).
test('backup: a dump taken while the factory keeps writing restores with matching row counts; a failed or damaged one is never kept', async () => {
  const { backupNow, restoreDrill, BackupScheduler } = require('../lib/backup');
  const { levelOf } = require('../lib/status');
  const dir = path.join(tmpDir, 'backups');
  const dbs = async () => (await factory.query("SELECT datname FROM pg_database WHERE datname LIKE 'fms_drill_%'")).rows;
  for (let i = 0; i < 20; i++) await factory.query('INSERT INTO customers (name) VALUES ($1)', [`Before ${i}`]);

  // Writes keep landing while the dump runs; the counts are the dump's own snapshot.
  let writing = true;
  const writer = (async () => {
    for (let i = 0; writing; i++) await factory.query('INSERT INTO customers (name) VALUES ($1)', [`During ${i}`]);
  })();
  const r = await backupNow({ databaseUrl: factoryUrl, dir });
  writing = false;
  await writer;
  const counts = JSON.parse(fs.readFileSync(`${r.file}.counts.json`, 'utf8')).counts;
  assert.ok(counts['public.customers'] >= 20);
  assert.ok(counts['public.sync_outbox'] >= 20, 'the outbox is backed up too');
  assert.deepEqual(fs.readdirSync(dir).sort(), [path.basename(r.file), `${path.basename(r.file)}.counts.json`]);

  const drill = await restoreDrill({ databaseUrl: factoryUrl, file: r.file });
  assert.equal(drill.ok, true, JSON.stringify(drill.mismatches));
  assert.equal(drill.tables, r.tables);
  assert.equal(drill.rows, r.rows);
  const live = Number((await factory.query('SELECT count(*) FROM customers')).rows[0].count);
  assert.ok(live > counts['public.customers'], `rows written during the dump are not in it (${live} live, ${counts['public.customers']} dumped)`);
  assert.deepEqual(await dbs(), [], 'the drill database is dropped');

  // A count that doesn't match is reported, not hidden.
  const wrong = path.join(tmpDir, 'wrong.dump');
  fs.copyFileSync(r.file, wrong);
  fs.writeFileSync(`${wrong}.counts.json`, JSON.stringify({ counts: { ...counts, 'public.customers': counts['public.customers'] + 1 } }));
  const bad = await restoreDrill({ databaseUrl: factoryUrl, file: wrong });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.mismatches, [{ table: 'public.customers', expected: counts['public.customers'] + 1, restored: counts['public.customers'] }]);

  // A damaged dump fails the drill and leaves no drill database.
  const cut = path.join(tmpDir, 'cut.dump');
  fs.writeFileSync(cut, fs.readFileSync(r.file).subarray(0, Math.floor(r.bytes / 2)));
  fs.copyFileSync(`${r.file}.counts.json`, `${cut}.counts.json`);
  await assert.rejects(restoreDrill({ databaseUrl: factoryUrl, file: cut }), /pg_restore failed/);
  assert.deepEqual(await dbs(), []);

  // pg_dump missing (or failing): an error, and no file of any kind left.
  const failDir = path.join(tmpDir, 'backups-fail');
  process.env.FMS_PG_TOOLS_DIR = path.join(tmpDir, 'no-such-dir');
  try {
    await assert.rejects(backupNow({ databaseUrl: factoryUrl, dir: failDir }), /pg_dump failed/);
  } finally {
    delete process.env.FMS_PG_TOOLS_DIR;
  }
  assert.deepEqual(fs.readdirSync(failDir), []);

  // The scheduler: a backup when due, one more on stop; status says when the
  // folder shares the database's drive, and when the last attempt failed.
  const logs2 = [];
  const sched = new BackupScheduler({
    databaseUrl: factoryUrl, getDir: () => dir, pgDataDir: dataDir, log: (m) => logs2.push(m), everyMs: 0, firstCheckMs: 0, checkMs: 3600_000,
  });
  sched.start();
  await waitFor(() => logs2.some((m) => m.startsWith('backup OK (scheduled)')), 10_000);
  await sleep(1100); // names are per second
  await sched.stop();
  assert.ok(logs2.some((m) => m.startsWith('backup OK (shutdown)')), logs2.join('\n'));
  assert.equal(fs.readdirSync(dir).filter((n) => n.endsWith('.dump')).length, 3);
  const st = sched.status();
  assert.equal(st.sameDrive, true);
  assert.equal(st.lastError, null);
  assert.deepEqual(levelOf({ state: 'ok', quarantineCount: 0, tablesWithoutPk: [], outboxCount: 0, backup: st }),
    { level: 'amber', problems: ['Backups are on the same drive as the database — choose a folder on another drive'] });
  process.env.FMS_PG_TOOLS_DIR = path.join(tmpDir, 'no-such-dir');
  try {
    await assert.rejects(sched.run('test'));
  } finally {
    delete process.env.FMS_PG_TOOLS_DIR;
  }
  assert.match(levelOf({ state: 'ok', quarantineCount: 0, tablesWithoutPk: [], outboxCount: 0, backup: { ...sched.status(), sameDrive: false } }).problems[0],
    /^Last backup failed: pg_dump failed/);
});

test('backup: keeps the last 24 h, the newest of 14 days and of 8 weeks, also when the PC is off on Sundays', () => {
  const { prune, listBackups } = require('../lib/backup');
  const dir = fs.mkdtempSync(path.join(tmpDir, 'prune-'));
  const pad = (n) => String(n).padStart(2, '0');
  const name = (d) => `fms_db-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}00.dump`;
  const now = new Date(2026, 9, 19, 20, 0, 0); // Monday 19 Oct 2026
  // 120 days, 4 dumps a day (8:00, 14:00, 20:00 and one at 18:30 on close), none on Sundays.
  for (let i = 0; i < 120; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (day.getDay() === 0) continue;
    for (const [h, m] of [[8, 0], [14, 0], [18, 30], [20, 0]]) {
      const d = new Date(day); d.setHours(h, m);
      if (d > now) continue;
      fs.writeFileSync(path.join(dir, name(d)), 'x');
      fs.writeFileSync(path.join(dir, `${name(d)}.counts.json`), '{}');
    }
  }
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not ours');
  prune(dir, now);
  const kept = listBackups(dir).map((b) => b.name);
  // Last 24 h: all four of today's (18 Oct is a Sunday, no dumps).
  const today = kept.filter((n) => n.startsWith('fms_db-2026-10-19'));
  assert.equal(today.length, 4);
  const days = new Set(kept.map((n) => n.slice(7, 17)));
  // 14 newest days that have a dump (Sundays skipped), plus older weekly ones.
  const daily = [...days].sort().reverse().slice(0, 14);
  assert.equal(daily.at(-1), '2026-10-03');
  for (const d of daily.slice(1)) assert.equal(kept.filter((n) => n.startsWith(`fms_db-${d}`)).length, 1, `one dump kept for ${d}`);
  // Weekly: the newest dump of each of the 8 newest weeks, this one included
  // (weeks start on Monday) -> the Saturdays back to 5 Sep, all 20:00.
  const older = [...days].sort().filter((d) => d < '2026-10-03');
  assert.deepEqual(older, ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26']);
  assert.ok(kept.filter((n) => !n.startsWith('fms_db-2026-10-19')).every((n) => n.endsWith('_200000.dump')));
  // Counts files follow their dump; other files are left alone.
  const files = fs.readdirSync(dir);
  assert.equal(files.filter((n) => n.endsWith('.counts.json')).length, kept.length);
  assert.ok(files.includes('notes.txt'));
});
