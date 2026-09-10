exports.up = (pgm) => {
  pgm.sql(`
    -- last_run_at was a naive TIMESTAMP, set via NOW(). If the Postgres
    -- session timezone differs from the Node process's local timezone (e.g.
    -- a hosted DB defaulting to UTC while the app runs in Asia/Karachi), the
    -- wall-clock value written and the wall-clock value read back disagree by
    -- the zone offset. The old once-per-calendar-day guard in cronJobs.js
    -- only compared dates, so the skew was invisible; the newer time-of-day
    -- guard (added to allow a same-day re-fire when run_time is pushed
    -- later) exposed it as a continuous every-minute re-fire. TIMESTAMPTZ
    -- stores an absolute instant, so it round-trips correctly regardless of
    -- session timezone. Existing values were written under the broken
    -- assumption and aren't trustworthy, so they're cleared rather than cast.
    ALTER TABLE public.report_schedules ALTER COLUMN last_run_at TYPE TIMESTAMPTZ;
    UPDATE public.report_schedules SET last_run_at = NULL;
  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.report_schedules ALTER COLUMN last_run_at TYPE TIMESTAMP;
  `)
}
