exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);
    ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);
    ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);
    ALTER TABLE public.purchase_payment_records ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);
  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.sales DROP COLUMN IF EXISTS bank_name;
    ALTER TABLE public.purchases DROP COLUMN IF EXISTS bank_name;
    ALTER TABLE public.payment_records DROP COLUMN IF EXISTS bank_name;
    ALTER TABLE public.purchase_payment_records DROP COLUMN IF EXISTS bank_name;
  `)
}
