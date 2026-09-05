exports.up = (pgm) => {
  pgm.sql(`

    -- Raw-material unit lookup, same shape/role as product_categories for Stock
    CREATE TABLE IF NOT EXISTS public.product_units (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(50) NOT NULL,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    INSERT INTO public.product_units (name) VALUES ('Bag'), ('Truck'), ('Cft');

    -- Case-insensitive uniqueness (replaces the case-sensitive UNIQUE(name) used
    -- for product_categories, applied here too so both lookups behave the same way)
    CREATE UNIQUE INDEX IF NOT EXISTS product_units_name_lower_idx ON public.product_units (LOWER(name));

    ALTER TABLE public.product_categories DROP CONSTRAINT IF EXISTS product_categories_name_key;
    CREATE UNIQUE INDEX IF NOT EXISTS product_categories_name_lower_idx ON public.product_categories (LOWER(name));

    -- products.unit was a free-text column limited by a fixed CHECK constraint.
    -- Replace it with a real FK into product_units, mirroring category_id/product_categories.
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES public.product_units(id) ON UPDATE NO ACTION ON DELETE NO ACTION;

    UPDATE public.products p
      SET unit_id = pu.id
      FROM public.product_units pu
      WHERE p.unit = pu.name;

    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_unit_check;
    ALTER TABLE public.products DROP COLUMN IF EXISTS unit;

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit VARCHAR(20) CHECK (unit IN ('Bag', 'Truck', 'Cft'));

    UPDATE public.products p
      SET unit = pu.name
      FROM public.product_units pu
      WHERE p.unit_id = pu.id;

    ALTER TABLE public.products DROP COLUMN IF EXISTS unit_id;

    DROP INDEX IF EXISTS product_categories_name_lower_idx;
    ALTER TABLE public.product_categories ADD CONSTRAINT product_categories_name_key UNIQUE (name);

    DROP TABLE IF EXISTS public.product_units;
  `)
}
