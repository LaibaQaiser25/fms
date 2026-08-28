exports.up = (pgm) => {
  pgm.sql(`

    -- Stock-side sub-category lookup, same shape as asset_categories/expense_categories
    CREATE TABLE IF NOT EXISTS public.product_categories (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(100) NOT NULL UNIQUE,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    -- products catalog: pure reference/master list, not touched by stock/purchase/sale logic
    CREATE TABLE IF NOT EXISTS public.products (
      id           SERIAL PRIMARY KEY,
      name         VARCHAR(200) NOT NULL,
      type         VARCHAR(20) NOT NULL CHECK (type IN ('stock', 'raw_material')),
      category_id  INTEGER REFERENCES public.product_categories(id) ON UPDATE NO ACTION ON DELETE NO ACTION,
      unit         VARCHAR(20) CHECK (unit IN ('Bag', 'Truck', 'Cft')),
      size         VARCHAR(50),
      description  TEXT,
      sale_price   NUMERIC(10,2),
      cost_price   NUMERIC(10,2),
      created_at   TIMESTAMP DEFAULT NOW(),
      updated_at   TIMESTAMP DEFAULT NOW(),
      UNIQUE (name, type)
    );

    -- FK columns only, schema-ready for future wiring — not backfilled or populated here
    ALTER TABLE public.stock
      ADD COLUMN IF NOT EXISTS product_id INTEGER;

    ALTER TABLE public.stock
      ADD CONSTRAINT stock_product_id_fkey FOREIGN KEY (product_id)
      REFERENCES public.products (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

    ALTER TABLE public.raw_materials
      ADD COLUMN IF NOT EXISTS product_id INTEGER;

    ALTER TABLE public.raw_materials
      ADD CONSTRAINT raw_materials_product_id_fkey FOREIGN KEY (product_id)
      REFERENCES public.products (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE IF EXISTS public.raw_materials DROP CONSTRAINT IF EXISTS raw_materials_product_id_fkey;
    ALTER TABLE IF EXISTS public.raw_materials DROP COLUMN IF EXISTS product_id;
    ALTER TABLE IF EXISTS public.stock DROP CONSTRAINT IF EXISTS stock_product_id_fkey;
    ALTER TABLE IF EXISTS public.stock DROP COLUMN IF EXISTS product_id;
    DROP TABLE IF EXISTS public.products;
    DROP TABLE IF EXISTS public.product_categories;
  `)
}
