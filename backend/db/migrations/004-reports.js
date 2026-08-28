exports.up = (pgm) => {
  pgm.sql(`

    -- Frozen business-summary snapshots (sales/purchases/expenses/net cash/debt/payable),
    -- generated manually or by the report_schedules cron. Numbers are stored, not
    -- recomputed on read, so a report's figures stay stable once created.
    CREATE TABLE IF NOT EXISTS public.reports (
      id            SERIAL PRIMARY KEY,
      period_type   VARCHAR(10) NOT NULL CHECK (period_type IN ('daily','weekly','monthly','yearly')),
      period_start  DATE NOT NULL,
      period_end    DATE NOT NULL,
      label         VARCHAR(100) NOT NULL,
      generated_by  VARCHAR(10) NOT NULL CHECK (generated_by IN ('manual','auto')),
      data          JSONB NOT NULL,
      created_at    TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW()
    );

    -- One row per automation frequency; run_day_of_week/run_day_of_month are only
    -- meaningful for their matching frequency (weekly / monthly respectively).
    CREATE TABLE IF NOT EXISTS public.report_schedules (
      frequency         VARCHAR(10) PRIMARY KEY CHECK (frequency IN ('daily','weekly','monthly')),
      enabled           BOOLEAN NOT NULL DEFAULT FALSE,
      run_time          TIME NOT NULL DEFAULT '23:55',
      run_day_of_week   SMALLINT CHECK (run_day_of_week BETWEEN 0 AND 6),
      run_day_of_month  SMALLINT CHECK (run_day_of_month BETWEEN 1 AND 28),
      last_run_at       TIMESTAMP
    );

    INSERT INTO public.report_schedules (frequency, run_day_of_week, run_day_of_month)
    VALUES ('daily', NULL, NULL), ('weekly', 0, NULL), ('monthly', NULL, 1)
    ON CONFLICT (frequency) DO NOTHING;

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS public.report_schedules;
    DROP TABLE IF EXISTS public.reports;
  `)
}
