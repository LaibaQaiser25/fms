// Change capture for factory -> VPS sync. Every insert/update/delete on a
// business table appends a row to sync_outbox (same transaction, so a rolled-
// back sale never gets shipped); lib/sync.js pushes the outbox to the VPS.
//
// Lives here, not in backend/db/migrations, on purpose: the VPS runs those
// migrations too, and it must NOT capture its own changes.
//
// Run on every start AFTER migrations: CREATE OR REPLACE TRIGGER makes this
// idempotent, and it attaches the trigger to any table a new migration added.
const { Client } = require('pg');

// Tables that are local bookkeeping, not business data.
const EXCLUDED_TABLES = ['pgmigrations', 'sync_outbox', 'sync_state'];

const SETUP_SQL = `
CREATE TABLE IF NOT EXISTS public.sync_outbox (
  id         bigserial PRIMARY KEY,
  -- Writing transaction's id: lib/sync.js only ships rows whose transaction
  -- has definitely finished, so a slow transaction's rows (lower outbox id,
  -- committed later) are never skipped.
  txid       xid8 NOT NULL DEFAULT pg_current_xact_id(),
  table_name text NOT NULL,
  op         char(1) NOT NULL CHECK (op IN ('I', 'U', 'D')),
  -- Full new row for I/U; only the primary key columns for D.
  row_data   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Singleton row: when the factory last pushed successfully. Survives restarts
-- so the window title can say "synced 3 h ago" right after launch.
CREATE TABLE IF NOT EXISTS public.sync_state (
  id             int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_synced_at timestamptz
);
INSERT INTO public.sync_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- TG_ARGV = the table's primary key column names.
CREATE OR REPLACE FUNCTION public.fms_sync_capture() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
  old_pk  jsonb;
  new_pk  jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_row := to_jsonb(OLD);
    SELECT jsonb_object_agg(k, old_row -> k) INTO old_pk FROM unnest(TG_ARGV) AS k;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_row := to_jsonb(NEW);
    SELECT jsonb_object_agg(k, new_row -> k) INTO new_pk FROM unnest(TG_ARGV) AS k;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.sync_outbox (table_name, op, row_data) VALUES (TG_TABLE_NAME, 'D', old_pk);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF new_row = old_row THEN
      RETURN NEW; -- nothing actually changed
    END IF;
    IF new_pk <> old_pk THEN
      -- The key itself changed: the VPS upserts by key, so drop the old row there.
      INSERT INTO public.sync_outbox (table_name, op, row_data) VALUES (TG_TABLE_NAME, 'D', old_pk);
    END IF;
  END IF;

  INSERT INTO public.sync_outbox (table_name, op, row_data)
  VALUES (TG_TABLE_NAME, CASE TG_OP WHEN 'INSERT' THEN 'I' ELSE 'U' END, new_row);
  RETURN NEW;
END
$$;
`;

async function installSyncCapture({ databaseUrl, log }) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(SETUP_SQL);

    const { rows: tables } = await client.query(
      `SELECT c.relname AS table_name,
              array_agg(a.attname::text ORDER BY array_position(i.indkey, a.attnum)) AS pk
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname <> ALL ($1)
        GROUP BY c.relname
        ORDER BY c.relname`,
      [EXCLUDED_TABLES]
    );

    for (const { table_name: table, pk } of tables) {
      const ident = client.escapeIdentifier(table);
      const args = pk.map((col) => client.escapeLiteral(col)).join(', ');
      await client.query(
        `CREATE OR REPLACE TRIGGER fms_sync_capture
           AFTER INSERT OR UPDATE OR DELETE ON public.${ident}
           FOR EACH ROW EXECUTE FUNCTION public.fms_sync_capture(${args})`
      );
    }

    // A table with no primary key can't be upserted on the VPS; say so loudly
    // instead of silently never syncing it.
    const { rows: noPk } = await client.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> ALL ($1)
          AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary)`,
      [EXCLUDED_TABLES]
    );
    for (const { relname } of noPk) log(`sync: table ${relname} has no primary key and will NOT sync`);

    await client.query('COMMIT');
    log(`sync: change capture on ${tables.length} tables`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

module.exports = { installSyncCapture, EXCLUDED_TABLES };
