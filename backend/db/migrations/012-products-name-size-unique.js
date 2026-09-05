exports.up = (pgm) => {
  pgm.sql(`

    -- Previously name+type had to be unique outright, blocking e.g. two "Tile"
    -- stock products in different sizes. Swap for name+type+size so same-name
    -- products are fine as long as size differs. Raw materials have no size
    -- column (always NULL), so COALESCE'd to '' they keep the old name+type
    -- uniqueness unchanged.
    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_name_type_key;

    CREATE UNIQUE INDEX IF NOT EXISTS products_name_type_size_idx
      ON public.products (name, type, COALESCE(size, ''));

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS products_name_type_size_idx;
    ALTER TABLE public.products ADD CONSTRAINT products_name_type_key UNIQUE (name, type);
  `)
}
