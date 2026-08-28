const pool = require('../db/pool');
const crypto = require('crypto');

class InvoiceController {
  /**
   * Generate a truly unique ID with timestamp + random + counter
   */
  static generateUniqueId(prefix) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex').substring(0, 6);
    return `${prefix}-${timestamp}-${random}`;
  }

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
   * Apply a payment to a customer's open invoices, oldest first.
   *
   * AddPaymentModal.jsx pays against the customer's total ledger debt and sends
   * no invoice_id, so the allocation has to happen here — otherwise
   * invoices.outstanding_debt / invoices.status and the linked sales.balance
   * never move after the sale is created, and every paid invoice keeps showing
   * up in the pending-payments list and the nightly debt alert.
   *
   * Runs inside the caller's transaction. When invoice_id is supplied only that
   * invoice is touched. Returns what it applied plus the first invoice consumed,
   * used to stamp payment_records so the payment stays traceable.
   */
  static async applyPaymentToInvoices(client, customerId, invoiceId, amount) {
    const targets = invoiceId
      ? await client.query(
          'SELECT id, sale_id, outstanding_debt FROM invoices WHERE id = $1 FOR UPDATE',
          [invoiceId]
        )
      : await client.query(
          `SELECT id, sale_id, outstanding_debt FROM invoices
            WHERE customer_id = $1
              AND status IN ('unpaid', 'partial')
              AND invoice_type <> 'payment_receipt'
            ORDER BY created_at ASC
            FOR UPDATE`,
          [customerId]
        );

    let remaining = amount;
    const allocations = [];

    for (const invoice of targets.rows) {
      if (remaining <= 0) break;

      const debt = Number(invoice.outstanding_debt) || 0;
      if (debt <= 0) continue;

      const applied = Math.min(remaining, debt);
      const newDebt = debt - applied;
      remaining -= applied;

      await client.query(
        'UPDATE invoices SET outstanding_debt = $1, status = $2 WHERE id = $3',
        [newDebt, newDebt > 0 ? 'partial' : 'paid', invoice.id]
      );

      // Keep the sale's balance in step with its invoice. Note: sales.status
      // tracks production/fulfillment ('pending' = awaiting production), not
      // payment state, so it is intentionally left untouched.
      if (invoice.sale_id) {
        await client.query(
          'UPDATE sales SET balance = GREATEST(balance - $1, 0), updated_at = NOW() WHERE id = $2',
          [applied, invoice.sale_id]
        );
      }

      allocations.push({ invoice_id: invoice.id, sale_id: invoice.sale_id, applied });
    }

    return {
      allocations,
      primaryInvoiceId: allocations.length > 0 ? allocations[0].invoice_id : null,
      primarySaleId: allocations.length > 0 ? allocations[0].sale_id : null,
      unallocated: remaining
    };
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

      // AddPaymentModal checks this too, but the endpoint is reachable without it
      const amount = Number(payment_amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'payment_amount must be a positive number' });
      }

      await client.query('BEGIN');

      // Outstanding debt comes from the ledger (debit - credit) — the same
      // figure AddPaymentModal shows the user before they submit.
      const debtResult = await client.query(
        `SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS outstanding
           FROM customer_ledger WHERE customer_id = $1`,
        [customer_id]
      );
      const outstanding = Number(debtResult.rows[0].outstanding) || 0;

      if (amount > outstanding + 0.01) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Payment amount exceeds outstanding debt of ${outstanding.toFixed(2)}`
        });
      }

      // 1. Apply the payment to the customer's open invoices (oldest first)
      const { allocations, primaryInvoiceId, primarySaleId } =
        await InvoiceController.applyPaymentToInvoices(client, customer_id, invoice_id, amount);

      const linkedInvoiceId = invoice_id || primaryInvoiceId;
      const linkedSaleId = sale_id || primarySaleId;

      // 2. Record payment, linked to whichever invoice/sale it landed on
      await client.query(
        `INSERT INTO payment_records (customer_id, customer_name, sale_id, invoice_id, payment_amount, payment_type, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [customer_id, customer_name, linkedSaleId, linkedInvoiceId, amount, payment_type, note]
      );

      // 3. Create payment receipt invoice
      const namePrefix = (customer_name || 'CUST').substring(0, 3).toUpperCase();
      const receiptInvoiceNo = InvoiceController.generateUniqueId(`INV-${namePrefix}`);

      const paymentReceiptResult = await client.query(
        `INSERT INTO invoices (invoice_no, sale_id, customer_id, customer_name, total_amount, advance_paid, outstanding_debt, invoice_type, status)
         VALUES ($1, $2, $3, $4, $5, 0, 0, 'payment_receipt', 'paid')
         RETURNING *`,
        [receiptInvoiceNo, linkedSaleId, customer_id, customer_name, amount]
      );

      // 4. Update ledger — linked to the payment receipt invoice, so the
      //    ledger history can show a clickable reference for this payment
      await client.query(
        `INSERT INTO customer_ledger (customer_id, customer_name, invoice_id, invoice_no, debit, credit, transaction_type, note)
         VALUES ($1, $2, $3, $4, 0, $5, 'payment', $6)`,
        [customer_id, customer_name, paymentReceiptResult.rows[0].id, receiptInvoiceNo, amount, `Payment received: ${payment_type}`]
      );

      // 5. Fall back to the caller-supplied sale when no invoice was allocated
      //    (nothing open to apply against, e.g. a legacy row)
      if (sale_id && allocations.length === 0) {
        await client.query(
          'UPDATE sales SET balance = GREATEST(balance - $1, 0), updated_at = NOW() WHERE id = $2',
          [amount, sale_id]
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Payment recorded successfully',
        data: {
          receipt: paymentReceiptResult.rows[0],
          allocations
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