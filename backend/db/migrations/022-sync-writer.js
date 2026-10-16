exports.up = (pgm) => {
  pgm.sql(`

    -- The one factory PC allowed to upload (SYNC-HARDENING-PLAN.md D6, T1.1).
    -- Singleton row. Registering a new PC (POST /sync/register) overwrites it,
    -- so the previous PC's upload key stops working. VPS-only: never synced,
    -- never in the snapshot (SyncController PROTECTED_TABLES / VPS_ONLY_TABLES).
    CREATE TABLE IF NOT EXISTS public.sync_writer (
      id              int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      writer_id       uuid,          -- the registered main PC; NULL = none yet
      upload_key_hash text,          -- sha256 hex of that PC's upload key
      registered_at   timestamptz,
      last_ingest_at  timestamptz
    );
    INSERT INTO public.sync_writer (id) VALUES (1) ON CONFLICT DO NOTHING;

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS public.sync_writer;
  `)
}
