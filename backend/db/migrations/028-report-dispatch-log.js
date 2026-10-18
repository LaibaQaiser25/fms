exports.up = (pgm) => {
  pgm.sql(`

    -- Reports and digests sent by the online server's send-only scheduler
    -- (T2.1, services/sendOnlyScheduler.js): one row per sent period, so a
    -- restart never sends the same one twice. Written only after the send
    -- succeeded (same transaction). The mirror tables stay pure (D2): this is
    -- the only table that scheduler writes. VPS-only: never synced, never in
    -- the snapshot (SyncController PROTECTED_TABLES / VPS_ONLY_TABLES).
    CREATE TABLE IF NOT EXISTS public.report_dispatch_log (
      id         bigserial PRIMARY KEY,
      frequency  text NOT NULL,          -- daily | weekly | monthly | digest
      period_key text NOT NULL,          -- e.g. 'daily:2026-10-18', 'digest:0730:2026-10-18'
      sent_at    timestamptz NOT NULL DEFAULT now(),
      status     text NOT NULL,          -- 'sent' (a failed send writes no row)
      payload    jsonb,                  -- label, period, the message as sent
      UNIQUE (frequency, period_key)
    );

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS public.report_dispatch_log;
  `)
}
