// Rebuilding the online server from this PC (SYNC-HARDENING-PLAN.md T2.8,
// D17). If the server was lost, or restored from an older backup, its copy
// is missing whatever changed since; normal sync only sends new changes. This
// PC still has everything, so:
//   1. main.js registers again with a setup code (same writer_id, new key),
//      without downloading anything: this PC keeps its own data;
//   2. queueEverything() puts every row of every synced table in sync_outbox,
//      and the normal SyncWorker uploads it (ingest is an upsert, so doing
//      this twice does no harm);
//   3. once the outbox is empty, pruneServer() sends each table's primary
//      keys, and the server deletes the rows this PC no longer has.
// Server-only tables (syncCapture EXCLUDED_TABLES) are never resent or pruned.
// Plain Node (no Electron), like sync.js.
const { Client } = require('pg');

// The tables change capture is on (syncCapture.js): exactly what sync carries.
async function capturedTables(client) {
  const { rows } = await client.query(
    `SELECT c.relname AS table_name,
            (SELECT array_agg(a.attname::text ORDER BY array_position(i.indkey, a.attnum))
               FROM pg_index i JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
              WHERE i.indrelid = c.oid AND i.indisprimary) AS pk
       FROM pg_trigger tg
       JOIN pg_class c ON c.oid = tg.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE tg.tgname = 'fms_sync_capture'
      ORDER BY c.relname`
  );
  return rows;
}

// Step 2: every row as 'U', in one local transaction. Returns { table: rows }.
async function queueEverything({ databaseUrl, log }) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const counts = {};
    for (const { table_name: name } of await capturedTables(client)) {
      const t = `public.${client.escapeIdentifier(name)}`;
      const { rowCount } = await client.query(
        `INSERT INTO sync_outbox (table_name, op, row_data) SELECT $1, 'U', to_jsonb(t) FROM ${t} t`,
        [name]
      );
      counts[name] = rowCount;
    }
    await client.query('COMMIT');
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    log(`rebuild: queued ${total} row(s) from ${Object.keys(counts).length} tables for upload`);
    return counts;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

// Step 3. Call with the SyncWorker paused: a row added here and uploaded
// between reading the keys and the server's delete would otherwise be
// deleted there and never sent again. Keys come from one consistent point in
// time. Returns { table: rows deleted on the server }.
async function pruneServer({ databaseUrl, serverUrl, uploadKey, log }) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const deleted = {};
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const { table_name: name, pk } of await capturedTables(client)) {
      const t = `public.${client.escapeIdentifier(name)}`;
      const cols = pk.map((c) => `${client.escapeLiteral(c)}, ${client.escapeIdentifier(c)}`).join(', ');
      const { rows } = await client.query(`SELECT jsonb_build_object(${cols}) AS k FROM ${t}`);
      deleted[name] = await sendPrune({ serverUrl, uploadKey, tableName: name, keys: rows.map((r) => r.k) });
      if (deleted[name]) log(`rebuild: the server had ${deleted[name]} ${name} row(s) this PC no longer has — removed`);
    }
    await client.query('COMMIT');
    return deleted;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

async function sendPrune({ serverUrl, uploadKey, tableName, keys }) {
  let res;
  try {
    res = await fetch(`${serverUrl.replace(/\/$/, '')}/sync/prune`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Upload-Key': uploadKey },
      body: JSON.stringify({ table_name: tableName, keys }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    throw new Error(`Could not reach ${serverUrl} (${err.cause?.code || err.message}). Check the internet connection.`);
  }
  let body = {};
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new Error(`Removing old ${tableName} rows on the server failed: ${body.error || `server replied ${res.status}`}`);
  return body.deleted || 0;
}

// Steps 2 and 3 with a running worker that already has the new upload key.
// progress(message) is called as it goes. Resolves { queued, deleted }.
async function resendAndPrune({ databaseUrl, worker, serverUrl, uploadKey, log, progress = () => {}, pollMs = 2000 }) {
  const queued = await queueEverything({ databaseUrl, log });
  worker.kick();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (;;) {
      const { rows: [{ n }] } = await client.query('SELECT count(*)::int AS n FROM sync_outbox');
      if (n === 0) break;
      if (worker.blocked) throw new Error('The server no longer accepts uploads from this PC (another PC was registered).');
      progress(`Uploading… ${n} change(s) left${worker.lastError ? ` (${worker.lastError.message})` : ''}`);
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } finally {
    await client.end();
  }
  progress('Removing rows on the server that this PC no longer has…');
  await worker.pause();
  try {
    const deleted = await pruneServer({ databaseUrl, serverUrl, uploadKey, log });
    return { queued, deleted };
  } finally {
    worker.resume();
  }
}

module.exports = { queueEverything, pruneServer, resendAndPrune };
