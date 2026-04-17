const pool = require('../db/pool');

class InvoiceController {
  /**
   * Get all invoices for a customer
   * GET /api/invoices/customer/:customer_id
   */
  static async getCustomerInvoices(req, res) {
    try {
      const { customer_id } = req.params;

      const result = await pool.query(
        `SELECT * FROM invoices 
         WHERE customer_id = $1 
         ORDER BY created_at DESC`,
        [customer_id]
      );

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ Error fetching customer invoices:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get single invoice with items
   * GET /api/invoices/:id
   */
  static async getInvoice(req, res) {
    try {
      const { id } = req.params;

      const invoiceResult = await pool.query(
        'SELECT * FROM invoices WHERE id = $1',
        [id]
      );

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const itemsResult = await pool.query(
        'SELECT * FROM invoice_items WHERE invoice_id = $1',
        [id]
      );

      res.json({
        success: true,
        data: {
          invoice: invoiceResult.rows[0],
          items: itemsResult.rows
        }
      });

    } catch (error) {
      console.error('❌ Error fetching invoice:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get invoice by invoice number
   * GET /api/invoices/number/:invoice_no
   */
  static async getInvoiceByNumber(req, res) {
    try {
      const { invoice_no } = req.params;

      const invoiceResult = await pool.query(
        'SELECT * FROM invoices WHERE invoice_no = $1',
        [invoice_no]
      );

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const itemsResult = await pool.query(
        'SELECT * FROM invoice_items WHERE invoice_id = $1',
        [invoiceResult.rows[0].id]
      );

      res.json({
        success: true,
        data: {
          invoice: invoiceResult.rows[0],
          items: itemsResult.rows
        }
      });

    } catch (error) {
      console.error('❌ Error fetching invoice:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Record a payment and create payment receipt invoice
   * POST /api/invoices/payment
   * Body: { customer_id, customer_name, sale_id, invoice_id, payment_amount, payment_type, note }
   */
  static async recordPayment(req, res) {
    const client = await pool.connect();
    try {
      const { customer_id, customer_name, sale_id, invoice_id, payment_amount, payment_type, note } = req.body;

      if (!customer_id || !payment_amount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      await client.query('BEGIN');

      // 1. Record payment
      await client.query(
        `INSERT INTO payment_records (customer_id, customer_name, sale_id, invoice_id, payment_amount, payment_type, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [customer_id, customer_name, sale_id || null, invoice_id || null, payment_amount, payment_type, note]
      );

      // 2. Update original invoice status
      if (invoice_id) {
        const invoiceResult = await client.query(
          'SELECT * FROM invoices WHERE id = $1',
          [invoice_id]
        );

        if (invoiceResult.rows.length > 0) {
          const invoice = invoiceResult.rows[0];
          const newOutstandingDebt = invoice.outstanding_debt - payment_amount;
          let newStatus = 'paid';

          if (newOutstandingDebt > 0) {
            newStatus = 'partial';
          }

          await client.query(
            'UPDATE invoices SET outstanding_debt = $1, status = $2, updated_at = NOW() WHERE id = $3',
            [Math.max(0, newOutstandingDebt), newStatus, invoice_id]
          );
        }
      }

      // 3. Create payment receipt invoice
      const receiptInvoiceNoResult = await client.query(
        'SELECT COUNT(*) FROM invoices WHERE customer_id = $1',
        [customer_id]
      );
      const receiptInvoiceNo = `INV-${customer_name.substring(0, 3).toUpperCase()}-${receiptInvoiceNoResult.rows[0].count + 1}`;

      const paymentReceiptResult = await client.query(
        `INSERT INTO invoices (invoice_no, sale_id, customer_id, customer_name, total_amount, advance_paid, outstanding_debt, invoice_type, status)
         VALUES ($1, $2, $3, $4, $5, 0, 0, 'payment_receipt', 'paid')
         RETURNING *`,
        [receiptInvoiceNo, sale_id || null, customer_id, customer_name, payment_amount]
      );

      // 4. Update ledger
      await client.query(
        `INSERT INTO customer_ledger (customer_id, customer_name, invoice_id, debit, credit, transaction_type, note)
         VALUES ($1, $2, $3, 0, $4, 'payment', $5)`,
        [customer_id, customer_name, paymentReceiptResult.rows[0].id, payment_amount, `Payment received: ${payment_type}`]
      );

      // 5. Update sale balance if applicable
      if (sale_id) {
        const saleResult = await client.query(
          'SELECT balance FROM sales WHERE id = $1',
          [sale_id]
        );

        if (saleResult.rows.length > 0) {
          const newBalance = saleResult.rows[0].balance - payment_amount;
          const newSaleStatus = newBalance <= 0 ? 'ready' : 'pending';

          await client.query(
            'UPDATE sales SET balance = $1, updated_at = NOW() WHERE id = $2',
            [Math.max(0, newBalance), sale_id]
          );
        }
      }

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Payment recorded successfully',
        data: {
          receipt: paymentReceiptResult.rows[0]
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error recording payment:', error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Get all invoices with pagination
   * GET /api/invoices?page=1&limit=10
   */
  static async getAllInvoices(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const result = await pool.query(
        `SELECT * FROM invoices ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await pool.query('SELECT COUNT(*) FROM invoices');
      const total = parseInt(countResult.rows[0].count);

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('❌ Error fetching invoices:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get pending payments (unpaid/partial invoices)
   * GET /api/invoices/pending/list
   */
  static async getPendingPayments(req, res) {
    try {
      const result = await pool.query(
        `SELECT 
          id, invoice_no, customer_name, total_amount, advance_paid, outstanding_debt, status, created_at
         FROM invoices 
         WHERE status IN ('unpaid', 'partial')
         ORDER BY created_at DESC`
      );

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ Error fetching pending payments:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = InvoiceController;