// Postgres never auto-indexes the referencing side of a foreign key — only
// the primary key it points at. Confirmed by EXPLAIN during the perf audit:
// looking up a sale's items, an invoice's items, or a customer's ledger
// entries was doing a sequential scan on every call. Harmless today at 0-1
// rows per table, but each of these is a hot detail-view lookup path that
// will scale linearly with table size once real transaction volume shows up.
// Tables are tiny in production right now, so a plain (non-CONCURRENT)
// CREATE INDEX inside the migration transaction is safe and instant.
exports.up = (pgm) => {
  pgm.createIndex('sale_items', 'sale_id');
  pgm.createIndex('invoice_items', 'invoice_id');
  pgm.createIndex('customer_ledger', 'customer_id');
  pgm.createIndex('purchase_items', 'purchase_id');
  pgm.createIndex('purchase_ledger', 'purchase_id');
};

exports.down = (pgm) => {
  pgm.dropIndex('sale_items', 'sale_id');
  pgm.dropIndex('invoice_items', 'invoice_id');
  pgm.dropIndex('customer_ledger', 'customer_id');
  pgm.dropIndex('purchase_items', 'purchase_id');
  pgm.dropIndex('purchase_ledger', 'purchase_id');
};
