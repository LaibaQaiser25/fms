exports.up = (pgm) => {
  pgm.sql(`

    -- raw materials table
    CREATE TABLE IF NOT EXISTS public.raw_materials (
      id             SERIAL PRIMARY KEY,
      name           VARCHAR(200) NOT NULL,
      unit           VARCHAR(20),
      unit_price     NUMERIC(10,2),
      quantity       NUMERIC(10,2) DEFAULT 0,
      category       VARCHAR(100),
      minimum_stock  NUMERIC(10,2) DEFAULT 10,
      created_at     TIMESTAMP DEFAULT NOW(),
      updated_at     TIMESTAMP DEFAULT NOW()
    );

    -- link purchase_items to raw_materials (stock_id stays null for these rows)
    ALTER TABLE public.purchase_items
      ADD COLUMN IF NOT EXISTS raw_material_id INTEGER;

    ALTER TABLE public.purchase_items
      ADD CONSTRAINT purchase_items_raw_material_id_fkey FOREIGN KEY (raw_material_id)
        REFERENCES public.raw_materials (id) ON UPDATE NO ACTION ON DELETE SET NULL;

    -- raw material consumption log
    CREATE TABLE IF NOT EXISTS public.raw_material_consumption (
      id                 SERIAL PRIMARY KEY,
      raw_material_id    INTEGER NOT NULL,
      raw_material_name  VARCHAR(200),
      quantity_used      NUMERIC(10,2) NOT NULL,
      user_id            INTEGER,
      logged_by_name     VARCHAR(100),
      notes              TEXT,
      consumption_date   DATE DEFAULT CURRENT_DATE,
      created_at         TIMESTAMP DEFAULT NOW(),
      CONSTRAINT raw_material_consumption_raw_material_id_fkey FOREIGN KEY (raw_material_id)
        REFERENCES public.raw_materials (id) ON UPDATE NO ACTION ON DELETE CASCADE,
      CONSTRAINT raw_material_consumption_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) ON UPDATE NO ACTION ON DELETE SET NULL
    );

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS public.raw_material_consumption;
    ALTER TABLE IF EXISTS public.purchase_items DROP CONSTRAINT IF EXISTS purchase_items_raw_material_id_fkey;
    ALTER TABLE IF EXISTS public.purchase_items DROP COLUMN IF EXISTS raw_material_id;
    DROP TABLE IF EXISTS public.raw_materials;
  `)
}
