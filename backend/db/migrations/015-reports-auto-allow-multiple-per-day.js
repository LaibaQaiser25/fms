exports.up = (pgm) => {
  pgm.sql(`
    -- The report_schedules cron can now legitimately re-fire an 'auto' report
    -- for the same day (e.g. run_time pushed later after it already fired
    -- once) instead of being capped to exactly one per calendar day. The old
    -- unique index rejected that second insert outright since a daily
    -- report's period_start/period_end is always just "today" regardless of
    -- how many times it runs. Race protection between concurrent backend
    -- processes now relies solely on cronJobs.js's last_run_at check.
    DROP INDEX IF EXISTS public.reports_auto_period_uniq;
  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS reports_auto_period_uniq
      ON public.reports (period_type, period_start, period_end)
      WHERE generated_by = 'auto';
  `)
}
