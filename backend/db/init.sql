-- FMS Database Schema
-- Factory Management System with Sales, Invoices, Ledger, Production, and Inventory

-- ============ CUSTOMERS TABLE ============
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  email VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ STOCK TABLE ============
CREATE TABLE IF NOT EXISTS stock (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INTEGER DEFAULT 0,
  category VARCHAR(100),
  size VARCHAR(50),
  extra TEXT,
  minimum_stock INTEGER DEFAULT 10,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ SALES/ORDERS TABLE ============
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  sale_no VARCHAR(20) UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_name VARCHAR(100),
  phone VARCHAR(20),
  address TEXT,
  total_amount NUMERIC(10,2) NOT NULL,
  advance_paid NUMERIC(10,2) DEFAULT 0,
  balance NUMERIC(10,2),
  payment_type VARCHAR(20), -- 'Cash', 'Udhaar' (Credit)
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'ready', 'delivered', 'cancelled'
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ SALE ITEMS TABLE ============
CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  stock_id INTEGER REFERENCES stock(id),
  product_name VARCHAR(200) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  amount NUMERIC(10,2), -- quantity * unit_price
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ PRODUCTION QUEUE TABLE ============
CREATE TABLE IF NOT EXISTS production_queue (
  id SERIAL PRIMARY KEY,
  product_name VARCHAR(200) NOT NULL,
  stock_id INTEGER REFERENCES stock(id),
  required_quantity INTEGER NOT NULL,
  notes TEXT,
  priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'cancelled'
  sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ INVOICES TABLE ============
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_no VARCHAR(20) UNIQUE NOT NULL,
  sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_name VARCHAR(100),
  phone VARCHAR(20),
  address TEXT,
  total_amount NUMERIC(10,2) NOT NULL,
  advance_paid NUMERIC(10,2) DEFAULT 0,
  outstanding_debt NUMERIC(10,2),
  invoice_type VARCHAR(30), -- 'proforma', 'payment_receipt', 'final'
  status VARCHAR(20) DEFAULT 'unpaid', -- 'paid', 'partial', 'unpaid'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ INVOICE ITEMS TABLE ============
CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  stock_id INTEGER REFERENCES stock(id),
  product_name VARCHAR(200) NOT NULL,
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL,
  amount NUMERIC(10,2), -- quantity * price
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ CUSTOMER LEDGER TABLE ============
CREATE TABLE IF NOT EXISTS customer_ledger (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_name VARCHAR(100),
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  invoice_no VARCHAR(20),
  debit NUMERIC(10,2) DEFAULT 0, -- amount owed
  credit NUMERIC(10,2) DEFAULT 0, -- payment received
  debt NUMERIC(10,2), -- remaining balance
  note TEXT,
  transaction_type VARCHAR(20), -- 'sale', 'payment', 'adjustment'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============ PAYMENT RECORDS TABLE ============
CREATE TABLE IF NOT EXISTS payment_records (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_name VARCHAR(100),
  sale_id INTEGER REFERENCES sales(id),
  invoice_id INTEGER REFERENCES invoices(id),
  payment_amount NUMERIC(10,2) NOT NULL,
  payment_type VARCHAR(20), -- 'Cash', 'Check', 'Bank Transfer', etc.
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ EXPENSE CATEGORIES TABLE ============
CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ EXPENSES TABLE ============
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============ ASSET CATEGORIES TABLE ============
CREATE TABLE IF NOT EXISTS asset_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ ASSETS TABLE ============
CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES asset_categories(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  purchase_date DATE NOT NULL,
  purchase_cost DECIMAL(12, 2) NOT NULL,
  current_value DECIMAL(12, 2),
  depreciation_rate DECIMAL(5, 2),
  status VARCHAR(20) DEFAULT 'active',
  location VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============ EMPLOYEE TYPES TABLE ============
CREATE TABLE IF NOT EXISTS employee_types (
  id SERIAL PRIMARY KEY,
  type_name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============ EMPLOYEES TABLE ============
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  employee_type_id INTEGER NOT NULL REFERENCES employee_types(id) ON DELETE CASCADE,
  hire_date DATE,
  salary DECIMAL(12, 2),
  status VARCHAR(20) DEFAULT 'active',
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============ INSERT DEFAULT DATA ============

-- Expense Categories
INSERT INTO expense_categories (name, description) VALUES
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

-- Asset Categories
INSERT INTO asset_categories (name, description) VALUES
  ('Furniture', 'Office and factory furniture'),
  ('Machinery', 'Production machinery'),
  ('Building', 'Building and structure'),
  ('Moulds', 'Production moulds and tools')
ON CONFLICT (name) DO NOTHING;

-- Employee Types
INSERT INTO employee_types (type_name, description) VALUES
  ('Company', 'Full-time company employee'),
  ('Sub-contract', 'Contract/temporary employee')
ON CONFLICT (type_name) DO NOTHING;

-- ============ CREATE INDEXES FOR PERFORMANCE ============

CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sale_id ON invoices(sale_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_production_queue_status ON production_queue(status);
CREATE INDEX IF NOT EXISTS idx_production_queue_sale_id ON production_queue(sale_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer_id ON customer_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_customer_id ON payment_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_stock_quantity ON stock(quantity);
