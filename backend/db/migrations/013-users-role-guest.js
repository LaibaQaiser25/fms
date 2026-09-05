exports.up = (pgm) => {
  pgm.sql(`
    -- Adds the 'Guest' role (dashboard-only, read-only access) alongside
    -- the existing 'Owner' / 'Manager' roles enforced by this constraint.
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('Owner', 'Manager', 'Guest'));
  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('Owner', 'Manager'));
  `)
}
