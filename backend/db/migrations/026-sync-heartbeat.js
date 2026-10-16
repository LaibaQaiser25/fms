exports.up = (pgm) => {
  pgm.sql(`

    -- The main factory PC's last heartbeat (T1.5), POST /sync/heartbeat every
    -- minute: it's alive, and how far behind its uploads are. The online
    -- dashboard shows "Factory last updated X min ago" from this and
    -- sync_writer.last_ingest_at. Singleton row. VPS-only.
    CREATE TABLE IF NOT EXISTS public.sync_heartbeat (
      id                      int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      received_at             timestamptz NOT NULL DEFAULT now(),
      outbox_count            int,
      oldest_outbox_age_sec   int,
      quarantine_count        int,
      whatsapp_state          text,
      whatsapp_oldest_age_sec int,
      sync_state              text
    );

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS public.sync_heartbeat;
  `)
}
