// First-run switchover: copy every business table from the VPS
// (GET /sync/snapshot) into this fresh local database, so the factory starts
// with exactly the server's data, ids included. From then on the factory is
// the single writer and lib/sync.js pushes its changes back.
const { Client } = require('pg');
const { EXCLUDED_TABLES } = require('./syncCapture');

const CHUNK = 1000;

async function downloadSnapshot({ serverUrl, token }) {
  let res;
  try {
    res = await fetch(`${serverUrl.replace(/\/$/, '')}/sync/snapshot`, {
      headers: { 'X-Sync-Token': token },
      signal: AbortSignal.timeout(10 * 60_000),
    });
  } catch (err) {
    throw new Error(`Could not reach ${serverUrl} (${err.cause?.code || err.message}). Check the internet connection.`);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch { /* not JSON */ }
    if (res.status === 401) throw new Error('The sync key is wrong.');
    if (res.status === 404) throw new Error('Sync is not enabled on the server yet (SYNC_TOKEN is not set there).');
    throw new Error(detail || `Server replied ${res.status}`);
  }
  return res.json();
}

// Replaces ALL local business data with the snapshot, in one transaction.
async function importSnapshot({ databaseUrl, snapshot, log }) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    // Replica mode: no FK checks (tables load in any order) and no triggers,
    // so the import itself doesn't fill sync_outbox with every row.
    await client.query('SET LOCAL session_replication_role = replica');

    const { rows: localTables } = await client.query(
      `SELECT c.relname AS name,
              (SELECT array_agg(a.attname::text) FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> ALL ($1)`,
      [EXCLUDED_TABLES]
    );
    const local = new Map(localTables.map((t) => [t.name, new Set(t.columns)]));

    // Never wipe changes that haven't reached the server yet.
    const { rows: [{ n: unsent }] } = await client.query('SELECT count(*)::int AS n FROM sync_outbox');
    if (unsent > 0) throw new Error(`This computer has ${unsent} change(s) not yet uploaded; refusing to replace its data.`);

    // Check everything fits before touching anything.
    for (const [name, rows] of Object.entries(snapshot.tables)) {
      const cols = local.get(name);
      if (!cols) throw new Error(`The server has a table "${name}" this app doesn't know. Install the latest FMS app, then try again.`);
      const extra = rows.length ? Object.keys(rows[0]).filter((c) => !cols.has(c)) : [];
      if (extra.length) throw new Error(`The server has newer columns (${name}: ${extra.join(', ')}). Install the latest FMS app, then try again.`);
    }

    // Clear local tables, including rows migrations seeded here, so ids match the server.
    const q = (n) => client.escapeIdentifier(n);
    await client.query(`TRUNCATE ${[...local.keys()].map((n) => `public.${q(n)}`).join(', ')}`);

    let total = 0;
    for (const [name, rows] of Object.entries(snapshot.tables)) {
      if (!rows.length) continue;
      const colList = Object.keys(rows[0]).map(q).join(', ');
      for (let i = 0; i < rows.length; i += CHUNK) {
        await client.query(
          `INSERT INTO public.${q(name)} (${colList})
           SELECT ${colList} FROM jsonb_populate_recordset(NULL::public.${q(name)}, $1::jsonb)`,
          [JSON.stringify(rows.slice(i, i + CHUNK))]
        );
      }
      total += rows.length;
    }

    // Serial sequences restart after the highest imported id.
    const { rows: seqs } = await client.query(
      `SELECT c.relname AS table_name, a.attname::text AS column_name
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND pg_get_serial_sequence(format('public.%I', c.relname), a.attname) IS NOT NULL`
    );
    for (const { table_name: t, column_name: col } of seqs) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT max(${q(col)}) FROM public.${q(t)}), 0) + 1, false)`,
        [`public.${q(t)}`, col]
      );
    }

    await client.query('DELETE FROM sync_outbox');
    await client.query('UPDATE sync_state SET last_synced_at = now() WHERE id = 1');
    await client.query('COMMIT');
    log(`snapshot: imported ${total} rows from ${Object.keys(snapshot.tables).length} tables (taken ${snapshot.takenAt})`);
    return total;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

module.exports = { downloadSnapshot, importSnapshot };
