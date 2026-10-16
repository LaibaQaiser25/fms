exports.up = (pgm) => {
  pgm.sql(`

    -- Offline Setup (T1.2): the setup name and logo the main factory PC shows
    -- in its title bar and login screen. It gets them when it registers and
    -- hourly through GET /sync/config. Singleton row. The logo lives here, not
    -- on disk, because the backend container is rebuilt on every deploy.
    -- VPS-only: never synced, never in the snapshot.
    CREATE TABLE IF NOT EXISTS public.offline_setup (
      id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      setup_name  text,
      logo        bytea,          -- 256 x 256 PNG; NULL = default logo
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.offline_setup (id) VALUES (1) ON CONFLICT DO NOTHING;

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS public.offline_setup;
  `)
}
