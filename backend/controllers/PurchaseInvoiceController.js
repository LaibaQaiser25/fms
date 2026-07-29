const pool = require('../db/pool');
const crypto = require('crypto');

class PurchaseInvoiceController {
  /**
   * Generate a truly unique ID with timestamp + random + counter
   */
  static generateUniqueId(prefix) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex').substring(0, 6);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Get all invoices for a seller
   * GET /api/purchase-invoices/seller/:seller_id
   */
  static async getSellerInvoices(req, res) {
    try {
      const { seller_id } = req.params;

      const result = await pool.query(
        `SELECT * FROM purchase_invoices 
         WHERE seller_id = $1 
         ORDER BY created_at DESC`,
        [seller_id]
      );

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ Error fetching seller invoices:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get single purchase invoice with items
   * GET /api/purchase-invoices/:id
   *
   * Note: purchase_items has no invoice_id column — it links to purchases
   * via purchase_id. So items are looked up through the invoice's
   * purchase_id rather than a direct invoice_id join.
   */
  static async getPurchaseInvoice(req, res) {
    try {
      const { id } = req.params;

      const invoiceResult = await pool.query(
        'SELECT * FROM purchase_invoices WHERE id = $1',
        [id]
      );

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const invoice = invoiceResult.rows[0];

      const itemsResult = invoice.purchase_id
        ? await pool.query('SELECT * FROM purchase_items WHERE purchase_id = $1', [invoice.purchase_id])
        : { rows: [] };

      res.json({
        success: true,
        data: {
          invoice: invoice,
          items: itemsResult.rows
        }
      });

    } catch (error) {
      console.error('❌ Error fetching purchase invoice:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get invoice by invoice number
   * GET /api/purchase-invoices/number/:invoice_no
   */
  static async getPurchaseInvoiceByNumber(req, res) {
    try {
      const { invoice_no } = req.params;

      const invoiceResult = await pool.query(
        'SELECT * FROM purchase_invoices WHERE invoice_no = $1',
        [invoice_no]
      );

      if (invoiceResult.rows.length === 0) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const invoice = invoiceResult.rows[0];

      const itemsResult = invoice.purchase_id
        ? await pool.query('SELECT * FROM purchase_items WHERE purchase_id = $1', [invoice.purchase_id])
        : { rows: [] };

      res.json({
        success: true,
        data: {
          invoice: invoice,
          items: itemsResult.rows
        }
      });

    } catch (error) {
      console.error('❌ Error fetching purchase invoice:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Record a payment to a seller and create payment receipt invoice
   * POST /api/purchase-invoices/payment
   * Body: { seller_id, seller_name, purchase_id, invoice_id, payment_amount, payment_type, note }
   */
  static async recordPayment(req, res) {
    const client = await pool.connect();
    try {
      const { seller_id, seller_name, purchase_id, invoice_id, payment_amount, payment_type, note } = req.body;

      if (!seller_id || !payment_amount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      await client.query('BEGIN');

      // 1. Record payment
      await client.query(
        `INSERT INTO purchase_payment_records (seller_id, seller_name, purchase_id, invoice_id, payment_amount, payment_type, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [seller_id, seller_name, purchase_id || null, invoice_id || null, payment_amount, payment_type, note]
      );

      // 2. Update original invoice status
      if (invoice_id) {
        const invoiceResult = await client.query(
          'SELECT * FROM purchase_invoices WHERE id = $1',
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
            'UPDATE purchase_invoices SET outstanding_debt = $1, status = $2 WHERE id = $3',
            [Math.max(0, newOutstandingDebt), newStatus, invoice_id]
          );
        }
      }

      // 3. Create payment receipt invoice
      const receiptInvoiceNo = PurchaseInvoiceController.generateUniqueId(`PINV-${seller_name.substring(0, 3).toUpperCase()}`);

      const paymentReceiptResult = await client.query(
        `INSERT INTO purchase_invoices (invoice_no, purchase_id, seller_id, seller_name, total_amount, advance_paid, outstanding_debt, invoice_type, status)
         VALUES ($1, $2, $3, $4, $5, 0, 0, 'payment_receipt', 'paid')
         RETURNING *`,
        [receiptInvoiceNo, purchase_id || null, seller_id, seller_name, payment_amount]
      );

      // 4. Update ledger
      await client.query(
        `INSERT INTO purchase_ledger (seller_id, seller_name, purchase_id, debit, credit, transaction_type, note)
         VALUES ($1, $2, $3, 0, $4, 'payment', $5)`,
        [seller_id, seller_name, purchase_id || null, payment_amount, `Payment made: ${payment_type}`]
      );

      // 5. Update purchase balance if applicable
      if (purchase_id) {
        const purchaseResult = await client.query(
          'SELECT balance FROM purchases WHERE id = $1',
          [purchase_id]
        );

        if (purchaseResult.rows.length > 0) {
          const newBalance = purchaseResult.rows[0].balance - payment_amount;

          await client.query(
            'UPDATE purchases SET balance = $1, updated_at = NOW() WHERE id = $2',
            [Math.max(0, newBalance), purchase_id]
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
   * Get all purchase invoices with pagination
   * GET /api/purchase-invoices?page=1&limit=10
   */
  static async getAllPurchaseInvoices(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const result = await pool.query(
        `SELECT * FROM purchase_invoices ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await pool.query('SELECT COUNT(*) FROM purchase_invoices');
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
      console.error('❌ Error fetching purchase invoices:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get pending payments (unpaid/partial invoices owed to sellers)
   * GET /api/purchase-invoices/pending/list
   */
  static async getPendingPayments(req, res) {
    try {
      const result = await pool.query(
        `SELECT 
          id, invoice_no, seller_name, total_amount, advance_paid, outstanding_debt, status, created_at
         FROM purchase_invoices 
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

module.exports = PurchaseInvoiceController;
