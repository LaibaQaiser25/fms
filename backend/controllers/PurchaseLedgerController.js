const pool = require('../db/pool');

class PurchaseLedgerController {
  /**
   * Get full ledger for all sellers
   * GET /api/purchase-ledger?page=1&limit=10
   */
  static async getFullPurchaseLedger(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      // Get unique sellers with their ledger summary
      const result = await pool.query(
        `SELECT DISTINCT ON (s.id)
          s.id,
          s.name as seller_name,
          s.phone,
          s.address,
          COALESCE(SUM(CASE WHEN pl.debit > 0 THEN pl.debit ELSE 0 END), 0) as total_debit,
          COALESCE(SUM(CASE WHEN pl.credit > 0 THEN pl.credit ELSE 0 END), 0) as total_credit,
          COALESCE(SUM(CASE WHEN pl.debit > 0 THEN pl.debit ELSE 0 END) - SUM(CASE WHEN pl.credit > 0 THEN pl.credit ELSE 0 END), 0) as debt
         FROM purchase_ledger pl
         JOIN sellers s ON s.id = pl.seller_id
         GROUP BY s.id, s.name, s.phone, s.address
         ORDER BY s.id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await pool.query('SELECT COUNT(DISTINCT seller_id) FROM purchase_ledger');
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
      console.error('❌ Error fetching purchase ledger:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get seller ledger history
   * GET /api/purchase-ledger/seller/:seller_id
   */
  static async getSellerLedgerHistory(req, res) {
    try {
      const { seller_id } = req.params;

      const sellerResult = await pool.query(
        'SELECT * FROM sellers WHERE id = $1',
        [seller_id]
      );

      if (sellerResult.rows.length === 0) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      const ledgerResult = await pool.query(
        `SELECT
          id, invoice_no, debit, credit, debt, transaction_type, note, created_at
         FROM purchase_ledger
         WHERE seller_id = $1
         ORDER BY created_at ASC, id ASC`,
        [seller_id]
      );

      // Running balance has to accumulate oldest-first (debit raises debt,
      // credit lowers it) — the API still returns newest-first, so the array
      // is reversed only after each row's cumulative value is computed.
      let runningBalance = 0;
      const ledgerWithBalance = ledgerResult.rows
        .map(entry => {
          runningBalance += (entry.debit || 0) - (entry.credit || 0);
          return {
            ...entry,
            running_balance: runningBalance
          };
        })
        .reverse();

      // Get summary
      const summaryResult = await pool.query(
        `SELECT 
          COALESCE(SUM(debit), 0) as total_debit,
          COALESCE(SUM(credit), 0) as total_credit,
          COALESCE(SUM(debit) - SUM(credit), 0) as total_debt
         FROM purchase_ledger 
         WHERE seller_id = $1`,
        [seller_id]
      );

      res.json({
        success: true,
        data: {
          seller: sellerResult.rows[0],
          history: ledgerWithBalance,
          summary: summaryResult.rows[0]
        }
      });

    } catch (error) {
      console.error('❌ Error fetching seller ledger:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get ledger summary (all sellers)
   * GET /api/purchase-ledger/summary/all?asOfDate= — asOfDate caps the snapshot
   * at that day (used by Reports for "payable as of X"); omitted, it's all-time.
   */
  static async getLedgerSummary(req, res) {
    try {
      const { asOfDate } = req.query;
      const result = await pool.query(
        `SELECT
          COUNT(DISTINCT seller_id) as total_sellers,
          COALESCE(SUM(CASE WHEN debit > 0 THEN debit ELSE 0 END), 0) as total_debit,
          COALESCE(SUM(CASE WHEN credit > 0 THEN credit ELSE 0 END), 0) as total_credit,
          COALESCE(SUM(CASE WHEN debit > 0 THEN debit ELSE 0 END) - SUM(CASE WHEN credit > 0 THEN credit ELSE 0 END), 0) as total_outstanding
         FROM purchase_ledger
         WHERE $1::date IS NULL OR created_at::date <= $1`,
        [asOfDate || null]
      );

      res.json({
        success: true,
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error fetching purchase ledger summary:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Add manual ledger entry
   * POST /api/purchase-ledger
   * Body: { seller_id, seller_name, debit, credit, transaction_type, note }
   */
  static async addLedgerEntry(req, res) {
    try {
      const { seller_id, seller_name, debit = 0, credit = 0, transaction_type, note } = req.body;

      if (!seller_id) {
        return res.status(400).json({ error: 'Missing seller_id' });
      }

      // 'purchase' and 'payment' rows are written by createPurchase/recordPayment,
      // which also update purchase_invoices.outstanding_debt/status and
      // purchases.balance in the same transaction. A manual entry of those types
      // would insert a ledger row without touching those balances, desyncing
      // them from the ledger.
      if (['purchase', 'payment'].includes(transaction_type)) {
        return res.status(400).json({
          error: `transaction_type '${transaction_type}' must go through the purchase/payment endpoints, not a manual ledger entry`
        });
      }

      const debt = debit - credit;

      const result = await pool.query(
        `INSERT INTO purchase_ledger (seller_id, seller_name, debit, credit, debt, transaction_type, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [seller_id, seller_name, debit, credit, debt, transaction_type, note]
      );

      res.status(201).json({
        success: true,
        message: 'Ledger entry added',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error adding ledger entry:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get outstanding debts owed to sellers (high to low)
   * GET /api/purchase-ledger/debts/outstanding
   */
  static async getOutstandingDebts(req, res) {
    try {
      const result = await pool.query(
        `SELECT DISTINCT ON (s.id)
          s.id,
          s.name as seller_name,
          s.phone,
          COALESCE(SUM(CASE WHEN pl.debit > 0 THEN pl.debit ELSE 0 END), 0) as total_amount,
          COALESCE(SUM(CASE WHEN pl.credit > 0 THEN pl.credit ELSE 0 END), 0) as total_paid,
          COALESCE(SUM(CASE WHEN pl.debit > 0 THEN pl.debit ELSE 0 END) - SUM(CASE WHEN pl.credit > 0 THEN pl.credit ELSE 0 END), 0) as outstanding_debt
         FROM sellers s
         LEFT JOIN purchase_ledger pl ON s.id = pl.seller_id
         GROUP BY s.id, s.name, s.phone
         HAVING COALESCE(SUM(CASE WHEN pl.debit > 0 THEN pl.debit ELSE 0 END) - SUM(CASE WHEN pl.credit > 0 THEN pl.credit ELSE 0 END), 0) > 0
         ORDER BY outstanding_debt DESC`
      );

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ Error fetching outstanding debts:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = PurchaseLedgerController;
