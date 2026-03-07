const pool = require('../db/pool');

// GET all invoices
exports.getAllInvoices = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET one invoice with items
exports.getInvoice = async (req, res) => {
  try {
    const invoice = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    const items = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [req.params.id]);
    res.json({ ...invoice.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST create invoice
exports.createInvoice = async (req, res) => {
  const { client_name, phone, address, items } = req.body;

  try {
    const lastInv = await pool.query("SELECT invoice_no FROM invoices ORDER BY id DESC LIMIT 1");
    const lastNum = lastInv.rows[0] ? parseInt(lastInv.rows[0].invoice_no.split('-')[1]) : 0;
    const invoice_no = `INV-${String(lastNum + 1).padStart(5, '0')}`;
    const total = items.reduce((sum, i) => sum + (Number(i.price) * Number(i.quantity || 1)), 0);

    const inv = await pool.query(
      `INSERT INTO invoices (invoice_no, client_name, phone, address, total)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [invoice_no, client_name, phone, address, total]
    );

    const invId = inv.rows[0].id;

    for (const item of items) {
      await pool.query(
        'INSERT INTO invoice_items (invoice_id, description, price, quantity) VALUES ($1, $2, $3, $4)',
        [invId, item.description, item.price, item.quantity || 1]
      );

      if (item.stock_id) {
        await pool.query(
          'UPDATE stock SET quantity = quantity - $1 WHERE id = $2',
          [item.quantity || 1, item.stock_id]
        );
      }
    }

    await pool.query(
      `INSERT INTO ledger (customer_name, invoice_id, invoice_no, debit, credit)
       VALUES ($1, $2, $3, $4, $5)`,
      [client_name, invId, invoice_no, total, 0]
    );

    res.status(201).json(inv.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE invoice
exports.deleteInvoice = async (req, res) => {
  try {
    await pool.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
    res.json({ message: 'Invoice deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET invoices for a client
exports.getClientInvoices = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM invoices WHERE client_name ILIKE $1 ORDER BY created_at DESC`,
      [req.params.name]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

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

  const totalDebit = Number(led.rows[0]?.total_debit || 0);
  const totalCredit = Number(led.rows[0]?.total_credit || 0);
  const daysOld = (Date.now() - new Date(created_at)) / (1000 * 60 * 60 * 24);

  let status = 'unpaid';
  if (totalCredit >= totalDebit) status = 'paid';
  else if (totalCredit > 0) status = 'partial';
  else if (daysOld > 30) status = 'overdue';

  await pool.query(
    'UPDATE invoices SET status = $1 WHERE id = $2',
    [status, invoiceId]
  );
  return status;
};