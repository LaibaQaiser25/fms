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
    for (const t of ['sync_writer', 'setup_code', 'offline_setup', 'pgmigrations']) {
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
