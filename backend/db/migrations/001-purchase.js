exports.up = (pgm) => {
  pgm.sql(`

    -- sellers table
    CREATE TABLE IF NOT EXISTS public.sellers (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      phone       VARCHAR(20),
      address     TEXT,
      email       VARCHAR(100),
      created_at  TIMESTAMP DEFAULT NOW(),
      updated_at  TIMESTAMP DEFAULT NOW()
    );

    -- purchases table
    CREATE TABLE IF NOT EXISTS public.purchases (
      id            SERIAL PRIMARY KEY,
      purchase_no   VARCHAR(50) NOT NULL UNIQUE,
      seller_id     INTEGER NOT NULL,
      seller_name   VARCHAR(100),
      phone         VARCHAR(20),
      address       TEXT,
      category      VARCHAR(50) NOT NULL CHECK (category IN ('stock-ready', 'raw-material')),
      type          VARCHAR(50) CHECK (type IN ('truck', 'bag')),
      total_amount  NUMERIC(10,2) NOT NULL,
      advance_paid  NUMERIC(10,2) DEFAULT 0,
      balance       NUMERIC(10,2),
      payment_type  VARCHAR(50),
      status        VARCHAR(20) DEFAULT 'pending',
      notes         TEXT,
      created_at    TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW(),
      CONSTRAINT purchases_seller_id_fkey FOREIGN KEY (seller_id)
        REFERENCES public.sellers (id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE
    );

    -- purchase invoices table
    CREATE TABLE IF NOT EXISTS public.purchase_invoices (
      id               SERIAL PRIMARY KEY,
      invoice_no       VARCHAR(50) NOT NULL UNIQUE,
      seller_id        INTEGER,
      seller_name      VARCHAR(100),
      phone            VARCHAR(20),
      address          TEXT,
      total_amount     NUMERIC(10,2) DEFAULT 0,
      advance_paid     NUMERIC(10,2) DEFAULT 0,
      outstanding_debt NUMERIC(10,2) DEFAULT 0,
      status           VARCHAR(20) DEFAULT 'unpaid',
      invoice_type     VARCHAR(20) DEFAULT 'purchase_invoice',
      purchase_id      INTEGER,
      created_at       TIMESTAMP DEFAULT NOW(),
      CONSTRAINT purchase_invoices_seller_id_fkey FOREIGN KEY (seller_id)
        REFERENCES public.sellers (id)
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
      CONSTRAINT purchase_invoices_purchase_id_fkey FOREIGN KEY (purchase_id)
        REFERENCES public.purchases (id)
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
    );

    -- purchase items table
    CREATE TABLE IF NOT EXISTS public.purchase_items (
      id           SERIAL PRIMARY KEY,
      purchase_id  INTEGER,
      description  VARCHAR(200),
      price        NUMERIC(10,2),
      quantity     INTEGER DEFAULT 1,
      stock_id     INTEGER,
      product_name VARCHAR(200),
      amount       NUMERIC(10,2),
      CONSTRAINT purchase_items_purchase_id_fkey FOREIGN KEY (purchase_id)
        REFERENCES public.purchases (id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE
    );

    -- purchase ledger table
    CREATE TABLE IF NOT EXISTS public.purchase_ledger (
      id               SERIAL PRIMARY KEY,
      seller_id        INTEGER NOT NULL,
      seller_name      VARCHAR(100),
      purchase_id      INTEGER,
      invoice_no       VARCHAR(50),
      debit            NUMERIC(10,2) DEFAULT 0,
      credit           NUMERIC(10,2) DEFAULT 0,
      debt             NUMERIC(10,2),
      note             TEXT,
      transaction_type VARCHAR(20),
      created_at       TIMESTAMP DEFAULT NOW(),
      updated_at       TIMESTAMP DEFAULT NOW(),
      CONSTRAINT purchase_ledger_seller_id_fkey FOREIGN KEY (seller_id)
        REFERENCES public.sellers (id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
      CONSTRAINT purchase_ledger_purchase_id_fkey FOREIGN KEY (purchase_id)
        REFERENCES public.purchases (id)
        ON UPDATE NO ACTION
        ON DELETE SET NULL
    );

    -- purchase payment records table
    CREATE TABLE IF NOT EXISTS public.purchase_payment_records (
      id             SERIAL PRIMARY KEY,
      seller_id      INTEGER NOT NULL,
      seller_name    VARCHAR(100),
      purchase_id    INTEGER,
      invoice_id     INTEGER,
      payment_amount NUMERIC(10,2) NOT NULL,
      payment_type   VARCHAR(50),
      notes          TEXT,
      created_at     TIMESTAMP DEFAULT NOW(),
      CONSTRAINT purchase_payment_records_seller_id_fkey FOREIGN KEY (seller_id)
        REFERENCES public.sellers (id)
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
      CONSTRAINT purchase_payment_records_purchase_id_fkey FOREIGN KEY (purchase_id)
        REFERENCES public.purchases (id)
        ON UPDATE NO ACTION
        ON DELETE NO ACTION,
      CONSTRAINT purchase_payment_records_invoice_id_fkey FOREIGN KEY (invoice_id)
        REFERENCES public.purchase_invoices (id)
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
    );

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS public.purchase_payment_records;
    DROP TABLE IF EXISTS public.purchase_ledger;
    DROP TABLE IF EXISTS public.purchase_items;
    DROP TABLE IF EXISTS public.purchase_invoices;
    DROP TABLE IF EXISTS public.purchases;
    DROP TABLE IF EXISTS public.sellers;
  `)
}