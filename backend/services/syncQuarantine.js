const pool = require('../db/pool');

// Factory PC only (T1.4): changes the VPS refused, set aside in
// sync_quarantine by desktop/lib/sync.js. Retrying re-sends the row AS IT IS
// NOW (D11) — after the Owner fixed the cause, e.g. renamed a duplicate
// product here or had the conflicting row removed online. There is no retry
// endpoint on the VPS: the factory is the only writer.

async function listOpen(db = pool) {
  const { rows } = await db.query(
    `SELECT id, outbox_id, table_name, op, row_data, code, constraint_name, detail, detected_at
       FROM sync_quarantine WHERE resolved_at IS NULL ORDER BY id`
  );
  return rows;
}

async function primaryKeyOf(client, tableName) {
  const { rows: [r] } = await client.query(
    `SELECT array_agg(a.attname::text ORDER BY array_position(i.indkey, a.attnum)) AS pk
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
      WHERE c.relname = $1 AND c.relkind = 'r'`,
    [tableName]
  );
  return r?.pk || null;
}

// Queues the row's current state for upload: 'U' with the whole row, or 'D'
// with its primary key if it no longer exists here. Settles every open
// quarantine entry for that same row (the new upload supersedes them all).
// Returns { op } or null if there is no such open entry.
async function retry(id, db = pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [entry] } = await client.query(
      'SELECT table_name, row_data FROM sync_quarantine WHERE id = $1 AND resolved_at IS NULL FOR UPDATE',
      [id]
    );
    if (!entry) {
      await client.query('ROLLBACK');
      return null;
    }
    const pk = await primaryKeyOf(client, entry.table_name);
    if (!pk) throw new Error(`table ${entry.table_name} no longer exists or has no primary key`);
    const pkData = Object.fromEntries(pk.map((c) => [c, entry.row_data[c]]));

    const t = `public.${client.escapeIdentifier(entry.table_name)}`;
    const pkList = pk.map((c) => client.escapeIdentifier(c)).join(', ');
    const { rows: [live] } = await client.query(
      `SELECT to_jsonb(t) AS row FROM ${t} t
        WHERE (${pkList}) = (SELECT ${pkList} FROM jsonb_populate_record(NULL::${t}, $1::jsonb))`,
      [pkData]
    );
    const op = live ? 'U' : 'D';
    await client.query(
      'INSERT INTO sync_outbox (table_name, op, row_data) VALUES ($1, $2, $3)',
      [entry.table_name, op, live ? live.row : pkData]
    );
    await client.query(
      `UPDATE sync_quarantine SET resolved_at = now()
        WHERE resolved_at IS NULL AND table_name = $1
          AND (SELECT jsonb_object_agg(k, row_data -> k) FROM unnest($2::text[]) AS k) = $3::jsonb`,
      [entry.table_name, pk, pkData]
    );
    await client.query('COMMIT');
    return { op };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { listOpen, retry };
