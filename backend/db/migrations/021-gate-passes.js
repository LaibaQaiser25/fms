exports.up = (pgm) => {
  pgm.sql(`

    -- Gate passes: 'order' = outward pass for a ready sale leaving the gate,
    -- 'received' = inward pass for purchased goods arriving. Exactly one of
    -- sale_id / purchase_id is set, matching the kind.
    CREATE TABLE IF NOT EXISTS public.gate_passes (
      id            SERIAL PRIMARY KEY,
      gate_pass_no  VARCHAR(50) NOT NULL UNIQUE,
      kind          VARCHAR(20) NOT NULL CHECK (kind IN ('order', 'received')),
      sale_id       INTEGER REFERENCES public.sales (id) ON DELETE CASCADE,
      purchase_id   INTEGER REFERENCES public.purchases (id) ON DELETE CASCADE,
      party_name    VARCHAR(100),
      phone         VARCHAR(20),
      address       TEXT,
      vehicle_no    VARCHAR(50),
      driver_name   VARCHAR(100),
      notes         TEXT,
      created_by    INTEGER REFERENCES public.users (id) ON DELETE SET NULL,
      created_by_name VARCHAR(100),
      created_at    TIMESTAMP DEFAULT NOW(),
      CONSTRAINT gate_passes_kind_ref_check CHECK (
        (kind = 'order'    AND sale_id IS NOT NULL AND purchase_id IS NULL) OR
        (kind = 'received' AND purchase_id IS NOT NULL AND sale_id IS NULL)
      )
    );

    -- One gate pass per sale / per purchase
    CREATE UNIQUE INDEX IF NOT EXISTS gate_passes_sale_id_uniq ON public.gate_passes (sale_id) WHERE sale_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS gate_passes_purchase_id_uniq ON public.gate_passes (purchase_id) WHERE purchase_id IS NOT NULL;

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS public.gate_passes;
  `)
}
