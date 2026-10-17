exports.up = (pgm) => {
  pgm.sql(`

    -- Stock can't go below zero (T2.7). Added NOT VALID so existing rows don't
    -- block the migration: new and changed rows are checked from now on. The
    -- existing rows are validated only when none is negative (0 on the VPS on
    -- 12 Oct 2026); otherwise list them, fix them, and run
    -- ALTER TABLE stock VALIDATE CONSTRAINT stock_quantity_nonneg by hand.
    -- A synced change that breaks it is set aside in sync_rejected (23514).
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_quantity_nonneg') THEN
        ALTER TABLE public.stock ADD CONSTRAINT stock_quantity_nonneg CHECK (quantity >= 0) NOT VALID;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.stock WHERE quantity < 0) THEN
        ALTER TABLE public.stock VALIDATE CONSTRAINT stock_quantity_nonneg;
      ELSE
        RAISE WARNING 'stock_quantity_nonneg left NOT VALID: % stock row(s) have a negative quantity',
          (SELECT count(*) FROM public.stock WHERE quantity < 0);
      END IF;
    END $$;

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.stock DROP CONSTRAINT IF EXISTS stock_quantity_nonneg;
  `)
}
