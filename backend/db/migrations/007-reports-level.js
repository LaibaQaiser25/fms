exports.up = (pgm) => {
  pgm.sql(`
    -- The level (how much detail) is chosen once at creation time, not
    -- switched afterward — so it has to be part of the frozen row, not a
    -- client-side toggle. Existing rows default to 'medium', matching the
    -- detail level the detail view showed before this column existed.
    ALTER TABLE public.reports
      ADD COLUMN IF NOT EXISTS report_level VARCHAR(10) NOT NULL DEFAULT 'medium'
      CHECK (report_level IN ('summary','medium','full'));
  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.reports DROP COLUMN IF EXISTS report_level;
  `)
}
