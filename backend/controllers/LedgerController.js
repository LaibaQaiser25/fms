const pool = require('../db/pool');

// Helper: update invoice status
exports.updateInvoiceStatus = async (invoiceId) => {
  const inv = await pool.query(
    'SELECT total, created_at, client_name FROM invoices WHERE id = $1',
    [invoiceId]
  );
  if (!inv.rows[0]) return;

  const { total, created_at, client_name } = inv.rows[0];

  const led = await pool.query(
    'SELECT SUM(credit) as total_credit, SUM(debit) as total_debit FROM ledger WHERE customer_name ILIKE $1',
    [client_name]
  );

  const totalDebit  = Number(led.rows[0]?.total_debit  || 0);
  const totalCredit = Number(led.rows[0]?.total_credit || 0);
  const daysOld     = (Date.now() - new Date(created_at)) / (1000 * 60 * 60 * 24);

  let status = 'unpaid';
  if (totalCredit >= totalDebit) status = 'paid';
  else if (totalCredit > 0)        status = 'partial';
  else if (daysOld > 30)           status = 'overdue';

  await pool.query(
    'UPDATE invoices SET status = $1 WHERE id = $2',
    [status, invoiceId]
  );
  return status;
};

// GET all customers grouped
exports.getAllCustomers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        customer_name,
        SUM(debit)               AS total_debit,
        SUM(credit)              AS total_credit,
        SUM(debit) - SUM(credit) AS total_debt,
        COUNT(*)                 AS total_invoices,
        MAX(date)                AS last_transaction
      FROM ledger
      GROUP BY customer_name
      ORDER BY customer_name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST add credit + auto receipt
exports.addCredit = async (req, res) => {
  const { customer_name, credit, note, invoice_id } = req.body;

  try {
    // 1 — Record credit in ledger
    await pool.query(
      `INSERT INTO ledger (customer_name, invoice_id, debit, credit, note)
       VALUES ($1, $2, 0, $3, $4)`,
      [customer_name, invoice_id || null, credit, note || 'Payment received']
    );

    // 2 — Get phone/address from latest invoice
    const clientInfo = await pool.query(
      `SELECT phone, address FROM invoices
       WHERE customer_name ILIKE $1 AND type = 'invoice'
       ORDER BY id DESC LIMIT 1`,
      [customer_name]
    );
    const phone   = clientInfo.rows[0]?.phone   || '';
    const address = clientInfo.rows[0]?.address || '';

    // 3 — Auto-generate receipt number
    const lastInv    = await pool.query("SELECT invoice_no FROM invoices ORDER BY id DESC LIMIT 1");
    const lastNum    = lastInv.rows[0] ? parseInt(lastInv.rows[0].invoice_no.split('-')[1]) : 0;
    const receipt_no = `REC-${String(lastNum + 1).padStart(5, '0')}`;

    // 4 — Create receipt invoice
    const receipt = await pool.query(
      `INSERT INTO invoices (invoice_no, client_name, phone, address, total, status, type)
       VALUES ($1, $2, $3, $4, $5, 'paid', 'receipt') RETURNING *`,
      [receipt_no, customer_name, phone, address, credit]
    );

    // 5 — Update status for ALL invoices of this customer
    const customerInvoices = await pool.query(
      `SELECT id FROM invoices WHERE customer_name ILIKE $1 AND type = 'invoice'`,
      [customer_name]
    );
    for (const inv of customerInvoices.rows) {
      await exports.updateInvoiceStatus(inv.id);
    }

    res.status(201).json({ receipt: receipt.rows[0] });

  } catch (err) {
    console.error('❌ Credit error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET ledger entries for a customer
exports.getCustomerLedger = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*, i.total as invoice_total
      FROM ledger l
      LEFT JOIN invoices i ON l.invoice_id = i.id
      WHERE l.customer_name ILIKE $1
      ORDER BY l.date ASC
    `, [req.params.name]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE customer and all their data
exports.deleteCustomer = async (req, res) => {
  const { name } = req.params;
  console.log('🗑️ Deleting customer:', name);

  try {
    // 1 — Get all invoice IDs for this customer
    const invoices = await pool.query(
      `SELECT id FROM invoices WHERE client_name ILIKE $1`,
      [name]
    );
    console.log('Found invoices:', invoices.rows.length);
    const invoiceIds = invoices.rows.map(row => row.id);

    // 2 — Delete invoice items for these invoices
    if (invoiceIds.length > 0) {
      await pool.query(
        `DELETE FROM invoice_items WHERE invoice_id = ANY($1)`,
        [invoiceIds]
      );
      console.log('Deleted invoice items');
    }

    // 3 — Delete all invoices for this customer
    await pool.query(
      `DELETE FROM invoices WHERE client_name ILIKE $1`,
      [name]
    );
    console.log('Deleted invoices');

    // 4 — Delete all ledger entries for this customer
    await pool.query(
      `DELETE FROM ledger WHERE customer_name ILIKE $1`,
      [name]
    );
    console.log('Deleted ledger entries');

    res.json({ message: `✅ Customer '${name}' deleted successfully` });

  } catch (err) {
    console.error('❌ Delete error:', err.message);
    console.error('Query stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
};