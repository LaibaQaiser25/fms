exports.up = (pgm) => {
  pgm.sql(`

    -- One-time setup codes for registering the main factory PC (T1.1).
    -- Only the hash is stored; the code is shown to the Owner once. VPS-only.
    CREATE TABLE IF NOT EXISTS public.setup_code (
      id         bigserial PRIMARY KEY,
      code_hash  text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_at    timestamptz
    );

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS public.setup_code;
  `)
}
