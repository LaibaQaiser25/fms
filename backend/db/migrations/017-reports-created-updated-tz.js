exports.up = (pgm) => {
  pgm.sql(`
    -- created_at/updated_at were naive TIMESTAMP columns written via NOW()
    -- while the db container's session timezone has always been UTC (no TZ
    -- ever set on the db service). The backend container's TZ is now
    -- Asia/Karachi (set for the report_schedules cron), so Node misreads
    -- these naive UTC wall-clock values as if they were Karachi wall-clock,
    -- silently shifting every displayed timestamp back by 5 hours (and the
    -- calendar day, near midnight) — e.g. the Reports page's "Generated"
    -- column. Since the db session has been UTC consistently the whole time,
    -- AT TIME ZONE 'UTC' on the existing values recovers the true absolute
    -- instant for every row, not just recent ones. TIMESTAMPTZ round-trips
    -- correctly from here on regardless of session timezone (same fix as
    -- migration 016 for report_schedules.last_run_at) — no server-wide TZ
    -- change needed.
    ALTER TABLE public.reports
      ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
      ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.reports
      ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC',
      ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at AT TIME ZONE 'UTC';
  `)
}
