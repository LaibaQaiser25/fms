exports.up = (pgm) => {
  pgm.sql(`

    -- Factory changes this server could not apply (T1.3): a unique, check or
    -- not-null violation, or a value that doesn't fit the column. Set aside
    -- here so the rest of the batch still applies; the factory keeps its own
    -- copy (sync_quarantine) and can retry. resolved_at is set when a later
    -- change to the same row is accepted. VPS-only: never synced, never in
    -- the snapshot.
    CREATE TABLE IF NOT EXISTS public.sync_rejected (
      id              bigserial PRIMARY KEY,
      received_at     timestamptz NOT NULL DEFAULT now(),
      outbox_id       bigint,          -- the factory's sync_outbox id
      table_name      text NOT NULL,
      op              char(1) NOT NULL,
      pk              jsonb,           -- just the primary key columns
      row_data        jsonb NOT NULL,
      code            text,            -- SQLSTATE, e.g. 23505
      constraint_name text,
      detail          text,
      resolved_at     timestamptz
    );
    CREATE INDEX IF NOT EXISTS sync_rejected_open_idx
      ON public.sync_rejected (table_name, pk) WHERE resolved_at IS NULL;

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS public.sync_rejected;
  `)
}
