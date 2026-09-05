exports.up = (pgm) => {
  pgm.sql(`

    -- Lets completing a production order for a not-yet-stocked product find/create
    -- the right stock row instead of silently no-opping (stock_id stays null until
    -- the order is queued for a product that already has a stock row).
    ALTER TABLE public.production_queue
      ADD COLUMN IF NOT EXISTS product_id INTEGER;

    ALTER TABLE public.production_queue
      ADD CONSTRAINT production_queue_product_id_fkey FOREIGN KEY (product_id)
        REFERENCES public.products (id) ON UPDATE NO ACTION ON DELETE NO ACTION;

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE IF EXISTS public.production_queue DROP CONSTRAINT IF EXISTS production_queue_product_id_fkey;
    ALTER TABLE IF EXISTS public.production_queue DROP COLUMN IF EXISTS product_id;
  `)
}
