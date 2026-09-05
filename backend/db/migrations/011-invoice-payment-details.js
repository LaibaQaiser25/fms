exports.up = (pgm) => {
  pgm.sql(`
    -- Invoices already denormalize customer/seller name, phone, address rather than
    -- joining at read time — payment_type/bank_name follow the same convention so
    -- an invoice can be displayed without joining back through payment_records
    -- (whose invoice_id points at the invoice being paid down, not the receipt
    -- invoice itself, so it can't be reliably joined from the invoice side).
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50);
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);
    ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50);
    ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);
  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.invoices DROP COLUMN IF EXISTS payment_type;
    ALTER TABLE public.invoices DROP COLUMN IF EXISTS bank_name;
    ALTER TABLE public.purchase_invoices DROP COLUMN IF EXISTS payment_type;
    ALTER TABLE public.purchase_invoices DROP COLUMN IF EXISTS bank_name;
  `)
}
