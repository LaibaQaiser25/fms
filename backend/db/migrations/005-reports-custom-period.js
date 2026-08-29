exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_period_type_check;
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_period_type_check
      CHECK (period_type IN ('daily','weekly','monthly','yearly','custom'));
  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_period_type_check;
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_period_type_check
      CHECK (period_type IN ('daily','weekly','monthly','yearly'));
  `)
}
