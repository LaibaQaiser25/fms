exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS quantity NUMERIC(10,2) DEFAULT 0;
  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.products DROP COLUMN IF EXISTS quantity;
  `)
}
