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
   * Apply a payment to a seller's open purchase invoices, oldest first.
   *
   * Mirror of InvoiceController.applyPaymentToInvoices — PurchasePaymentModal.jsx
   * pays against the seller's total ledger debt and sends no invoice_id, so
   * without allocating here purchase_invoices.outstanding_debt / status and the
   * linked purchases.balance would never move after the purchase is created.
   *
   * Runs inside the caller's transaction.
   */
  static async applyPaymentToInvoices(client, sellerId, invoiceId, amount) {
    const targets = invoiceId
      ? await client.query(
          'SELECT id, purchase_id, outstanding_debt FROM purchase_invoices WHERE id = $1 FOR UPDATE',
          [invoiceId]
        )
      : await client.query(
          `SELECT id, purchase_id, outstanding_debt FROM purchase_invoices
            WHERE seller_id = $1
              AND status IN ('unpaid', 'partial')
              AND invoice_type <> 'payment_receipt'
            ORDER BY created_at ASC
            FOR UPDATE`,
          [sellerId]
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
        'UPDATE purchase_invoices SET outstanding_debt = $1, status = $2 WHERE id = $3',
        [newDebt, newDebt > 0 ? 'partial' : 'paid', invoice.id]
      );

      if (invoice.purchase_id) {
        await client.query(
          'UPDATE purchases SET balance = GREATEST(balance - $1, 0), updated_at = NOW() WHERE id = $2',
          [applied, invoice.purchase_id]
        );
      }

      allocations.push({ invoice_id: invoice.id, purchase_id: invoice.purchase_id, applied });
    }

    return {
      allocations,
      primaryInvoiceId: allocations.length > 0 ? allocations[0].invoice_id : null,
      primaryPurchaseId: allocations.length > 0 ? allocations[0].purchase_id : null,
      unallocated: remaining
    };
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

      // PurchasePaymentModal checks this too, but the endpoint is reachable without it
      const amount = Number(payment_amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'payment_amount must be a positive number' });
      }

      await client.query('BEGIN');

      // Outstanding debt comes from the ledger (debit - credit) — the same
      // figure PurchasePaymentModal shows the user before they submit.
      const debtResult = await client.query(
        `SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS outstanding
           FROM purchase_ledger WHERE seller_id = $1`,
        [seller_id]
      );
      const outstanding = Number(debtResult.rows[0].outstanding) || 0;

      if (amount > outstanding + 0.01) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Payment amount exceeds outstanding debt of ${outstanding.toFixed(2)}`
        });
      }

      // 1. Apply the payment to the seller's open invoices (oldest first)
      const { allocations, primaryInvoiceId, primaryPurchaseId } =
        await PurchaseInvoiceController.applyPaymentToInvoices(client, seller_id, invoice_id, amount);

      const linkedInvoiceId = invoice_id || primaryInvoiceId;
      const linkedPurchaseId = purchase_id || primaryPurchaseId;

      // 2. Record payment, linked to whichever invoice/purchase it landed on
      await client.query(
        `INSERT INTO purchase_payment_records (seller_id, seller_name, purchase_id, invoice_id, payment_amount, payment_type, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [seller_id, seller_name, linkedPurchaseId, linkedInvoiceId, amount, payment_type, note]
      );

      // 3. Create payment receipt invoice
      const namePrefix = (seller_name || 'SELL').substring(0, 3).toUpperCase();
      const receiptInvoiceNo = PurchaseInvoiceController.generateUniqueId(`PINV-${namePrefix}`);

      const paymentReceiptResult = await client.query(
        `INSERT INTO purchase_invoices (invoice_no, purchase_id, seller_id, seller_name, total_amount, advance_paid, outstanding_debt, invoice_type, status)
         VALUES ($1, $2, $3, $4, $5, 0, 0, 'payment_receipt', 'paid')
         RETURNING *`,
        [receiptInvoiceNo, linkedPurchaseId, seller_id, seller_name, amount]
      );

      // 4. Update ledger
      await client.query(
        `INSERT INTO purchase_ledger (seller_id, seller_name, purchase_id, debit, credit, transaction_type, note)
         VALUES ($1, $2, $3, 0, $4, 'payment', $5)`,
        [seller_id, seller_name, linkedPurchaseId, amount, `Payment made: ${payment_type}`]
      );

      // 5. Fall back to the caller-supplied purchase when no invoice was
      //    allocated (nothing open to apply against, e.g. a legacy row)
      if (purchase_id && allocations.length === 0) {
        await client.query(
          'UPDATE purchases SET balance = GREATEST(balance - $1, 0), updated_at = NOW() WHERE id = $2',
          [amount, purchase_id]
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
