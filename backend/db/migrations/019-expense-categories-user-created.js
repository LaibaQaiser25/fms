exports.up = (pgm) => {
  pgm.sql(`

    -- Expense categories are now created by the user (with an initial expense),
    -- mirroring product_categories. The old seeded rows are dropped — their names
    -- live on only as suggestions in the frontend (ExpenseCategoryManager).
    -- Categories that already have expenses recorded against them are kept,
    -- since expenses.category_id is NOT NULL and deleting them would mean
    -- deleting real expense history.
    DELETE FROM public.expense_categories ec
      WHERE NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.category_id = ec.id);

    -- Case-insensitive uniqueness, same as product_categories (see 008-product-units.js)
    ALTER TABLE public.expense_categories DROP CONSTRAINT IF EXISTS expense_categories_name_key;
    CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_name_lower_idx ON public.expense_categories (LOWER(name));

  `)
}

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS expense_categories_name_lower_idx;
    ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_name_key UNIQUE (name);

    INSERT INTO public.expense_categories (name, description) VALUES
      ('Daily Expenses', 'General daily expenses'),
      ('Petrol', 'Fuel expenses'),
      ('WiFi', 'Internet services'),
      ('Electricity', 'Power bills'),
      ('Gas', 'Gas expenses'),
      ('Maintenance', 'Equipment maintenance'),
      ('Carriage', 'Transportation charges'),
      ('Staff Transportation', 'Employee transport'),
      ('General Office Expense', 'Office supplies and misc')
    ON CONFLICT (name) DO NOTHING;
  `)
}
