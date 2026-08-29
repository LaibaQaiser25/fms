exports.up = (pgm) => {
  pgm.sql(`
    -- Belt-and-suspenders against duplicate auto-generated reports: if more
    -- than one backend process is alive at once (e.g. an orphaned node
    -- process left running after a restart), each runs its own copy of the
    -- report_schedules cron against the same DB and can race the same
    -- schedule at the same minute. This makes a second INSERT for the exact
    -- same auto period fail at the DB instead of silently duplicating.
    -- Manual reports are untouched — a user can create as many as they like
    -- for the same range (e.g. after deleting one to redo it).
    CREATE UNIQUE INDEX IF NOT EXISTS reports_auto_period_uniq
      ON public.reports (period_type, period_start, period_end)
      WHERE generated_by = 'auto';
  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS public.reports_auto_period_uniq;
  `)
}
