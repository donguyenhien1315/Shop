PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS legacy_backups (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  payload TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  legacy_id TEXT
);

CREATE TABLE IF NOT EXISTS store_settings (
  store_id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'product',
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(store_id, name, kind),
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Khác',
  unit TEXT NOT NULL DEFAULT 'cái',
  barcode TEXT,
  sale_price INTEGER NOT NULL DEFAULT 0,
  cost_price INTEGER NOT NULL DEFAULT 0,
  stock REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  pack_size REAL NOT NULL DEFAULT 1,
  track_stock INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  legacy_id TEXT,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_products_store_name ON products(store_id, name);

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Nguyên liệu',
  unit TEXT NOT NULL,
  purchase_price INTEGER NOT NULL DEFAULT 0,
  package_qty REAL NOT NULL DEFAULT 1,
  unit_cost REAL NOT NULL DEFAULT 0,
  stock REAL NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  legacy_id TEXT,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  note TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  legacy_id TEXT,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_customers_store_name ON customers(store_id, name);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  note TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  legacy_id TEXT,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT NOT NULL DEFAULT '',
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  cost_total INTEGER NOT NULL DEFAULT 0,
  profit INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  legacy_id TEXT,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sales_store_date ON sales(store_id, created_at);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL,
  FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sale_payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  method TEXT NOT NULL,
  amount INTEGER NOT NULL,
  FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customer_debts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  sale_id TEXT,
  amount INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  legacy_id TEXT,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_debts_store_date ON customer_debts(store_id, created_at);

CREATE TABLE IF NOT EXISTS debt_payments (
  id TEXT PRIMARY KEY,
  debt_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  legacy_id TEXT,
  FOREIGN KEY(debt_id) REFERENCES customer_debts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_receipts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  supplier_id TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  debt INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  legacy_id TEXT,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_receipt_items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(receipt_id) REFERENCES stock_receipts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_counts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  period_key TEXT,
  created_at TEXT NOT NULL,
  legacy_id TEXT,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_count_items (
  id TEXT PRIMARY KEY,
  count_id TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL,
  before_qty REAL NOT NULL DEFAULT 0,
  actual_qty REAL NOT NULL DEFAULT 0,
  delta REAL NOT NULL DEFAULT 0,
  sale_price_snapshot INTEGER NOT NULL DEFAULT 0,
  cost_price_snapshot INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(count_id) REFERENCES stock_counts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  product_id TEXT,
  movement_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  before_qty REAL,
  after_qty REAL,
  reference_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_inventory_store_date ON inventory_movements(store_id, created_at);

CREATE TABLE IF NOT EXISTS cash_entries (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Khác',
  amount INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  created_at TEXT NOT NULL,
  legacy_id TEXT,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cash_store_date ON cash_entries(store_id, created_at);

CREATE TABLE IF NOT EXISTS supplier_debts (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  supplier_id TEXT,
  amount INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  balance INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  legacy_id TEXT,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cash_sessions (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  opening_cash INTEGER NOT NULL DEFAULT 0,
  expected_cash INTEGER NOT NULL DEFAULT 0,
  actual_cash INTEGER NOT NULL DEFAULT 0,
  difference INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  legacy_id TEXT,
  FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
);
