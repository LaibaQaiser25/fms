exports.up = (pgm) => {
  pgm.sql(`

    -- Link each payment record to the ledger row recordPayment wrote alongside
    -- it, so editing/deleting a 'payment' ledger entry can find and update the
    -- matching payment record (Cashbook/Analytics read payment_records).
    ALTER TABLE public.payment_records ADD COLUMN IF NOT EXISTS ledger_id INTEGER
      REFERENCES public.customer_ledger (id) ON DELETE SET NULL;
    ALTER TABLE public.purchase_payment_records ADD COLUMN IF NOT EXISTS ledger_id INTEGER
      REFERENCES public.purchase_ledger (id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS payment_records_ledger_id_idx ON public.payment_records (ledger_id);
    CREATE INDEX IF NOT EXISTS purchase_payment_records_ledger_id_idx ON public.purchase_payment_records (ledger_id);

    -- Backfill: both rows were inserted in the same transaction, so they share
    -- party, amount and (NOW()) timestamp. Claim the closest unclaimed record
    -- for each ledger payment row, one-to-one.
    DO $$
    DECLARE l RECORD;
    BEGIN
      FOR l IN SELECT id, customer_id, credit, created_at FROM public.customer_ledger
                WHERE transaction_type = 'payment' ORDER BY id LOOP
        UPDATE public.payment_records SET ledger_id = l.id
         WHERE id = (
           SELECT pr.id FROM public.payment_records pr
            WHERE pr.ledger_id IS NULL
              AND pr.customer_id = l.customer_id
              AND pr.payment_amount = l.credit
              AND ABS(EXTRACT(EPOCH FROM (pr.created_at - l.created_at))) < 60
            ORDER BY ABS(EXTRACT(EPOCH FROM (pr.created_at - l.created_at))), pr.id
            LIMIT 1
         );
      END LOOP;

      FOR l IN SELECT id, seller_id, credit, created_at FROM public.purchase_ledger
                WHERE transaction_type = 'payment' ORDER BY id LOOP
        UPDATE public.purchase_payment_records SET ledger_id = l.id
         WHERE id = (
           SELECT pr.id FROM public.purchase_payment_records pr
            WHERE pr.ledger_id IS NULL
              AND pr.seller_id = l.seller_id
              AND pr.payment_amount = l.credit
              AND ABS(EXTRACT(EPOCH FROM (pr.created_at - l.created_at))) < 60
            ORDER BY ABS(EXTRACT(EPOCH FROM (pr.created_at - l.created_at))), pr.id
            LIMIT 1
         );
      END LOOP;
    END $$;

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS purchase_payment_records_ledger_id_idx;
    DROP INDEX IF EXISTS payment_records_ledger_id_idx;
    ALTER TABLE public.purchase_payment_records DROP COLUMN IF EXISTS ledger_id;
    ALTER TABLE public.payment_records DROP COLUMN IF EXISTS ledger_id;
  `)
}
