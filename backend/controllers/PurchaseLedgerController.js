const pool = require('../db/pool');
const PurchaseInvoiceController = require('./PurchaseInvoiceController');

// Rows written by createPurchase/recordPayment — editing them cascades into
// purchase invoices, purchases and purchase_payment_records, so it's
// restricted to the Owner.
const LINKED_TYPES = ['purchase', 'payment'];

const isOwner = (req) => req.user?.role?.toLowerCase() === 'owner';

const ledgerError = (status, message) => Object.assign(new Error(message), { status });

class PurchaseLedgerController {
  /**
   * Get full ledger for all sellers
   * GET /api/purchase-ledger?page=1&limit=10
   */
  static async getFullPurchaseLedger(req, res) {
    try {
      const { page = 1, limit = 10, search = '', sortBy = 'id', sortOrder = 'desc' } = req.query;
      const offset = (page - 1) * limit;

      const sortColumns = {
        name: 's.name',
        debit: 'total_debit',
        credit: 'total_credit',
        debt: 'debt',
        id: 's.id'
      };
      const sortColumn = sortColumns[sortBy] || sortColumns.id;
      const order = String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      const params = [];
      let searchClause = '';
      if (search) {
        params.push(`%${search}%`);
        searchClause = `WHERE (s.name ILIKE $${params.length} OR s.phone ILIKE $${params.length})`;
      }
      params.push(limit, offset);

      // Get unique sellers with their ledger summary
      const result = await pool.query(
        `SELECT
          s.id,
          s.name as seller_name,
          s.phone,
          s.address,
          COALESCE(SUM(CASE WHEN pl.debit > 0 THEN pl.debit ELSE 0 END), 0) as total_debit,
          COALESCE(SUM(CASE WHEN pl.credit > 0 THEN pl.credit ELSE 0 END), 0) as total_credit,
          COALESCE(SUM(CASE WHEN pl.debit > 0 THEN pl.debit ELSE 0 END) - SUM(CASE WHEN pl.credit > 0 THEN pl.credit ELSE 0 END), 0) as debt
         FROM purchase_ledger pl
         JOIN sellers s ON s.id = pl.seller_id
         ${searchClause}
         GROUP BY s.id, s.name, s.phone, s.address
         ORDER BY ${sortColumn} ${order}
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const countParams = search ? [`%${search}%`] : [];
      const countResult = await pool.query(
        `SELECT COUNT(DISTINCT pl.seller_id)
         FROM purchase_ledger pl
         JOIN sellers s ON s.id = pl.seller_id
         ${searchClause}`,
        countParams
      );
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
   * Update a ledger entry
   * PUT /api/purchase-ledger/:id
   * Body: { debit, credit, note }
   *
   * Mirror of CustomerLedgerController.updateLedgerEntry.
   * Manual entries: debit/credit/note are written as-is.
   * 'purchase' entries (Owner only): only the advance (credit) and note — the
   *   total (debit) comes from the purchase's items/stock. The purchase and its
   *   invoice get the new advance.
   * 'payment' entries (Owner only): only the amount (credit) and note — the
   *   receipt invoice and purchase_payment_records row get the new amount.
   * Either linked type then rebuilds the seller's invoice/purchase balances.
   */
  static async updateLedgerEntry(req, res) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { debit = 0, credit = 0, note } = req.body;

      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM purchase_ledger WHERE id = $1 FOR UPDATE', [id]);
      if (existing.rows.length === 0) {
        throw ledgerError(404, 'Ledger entry not found');
      }
      const entry = existing.rows[0];
      const type = entry.transaction_type;
      const isLinked = LINKED_TYPES.includes(type);

      if (isLinked && !isOwner(req)) {
        throw ledgerError(403, `Only the Owner can edit '${type}' entries`);
      }

      let newDebit = Number(debit) || 0;
      let newCredit = Number(credit) || 0;
      if (newDebit < 0 || newCredit < 0) {
        throw ledgerError(400, 'Debit and credit cannot be negative');
      }

      if (type === 'purchase') {
        newDebit = Number(entry.debit) || 0;
        if (newCredit > newDebit + 0.01) {
          throw ledgerError(400, `Advance cannot exceed the purchase total of ${newDebit.toFixed(2)}`);
        }
        // purchase_ledger links by purchase_id + invoice_no, not invoice_id
        if (entry.purchase_id) {
          await client.query(
            `UPDATE purchase_invoices SET advance_paid = $1
              WHERE purchase_id = $2 AND invoice_type <> 'payment_receipt'`,
            [newCredit, entry.purchase_id]
          );
          await client.query(
            'UPDATE purchases SET advance_paid = $1, updated_at = NOW() WHERE id = $2',
            [newCredit, entry.purchase_id]
          );
        }
      } else if (type === 'payment') {
        newDebit = 0;
        if (newCredit <= 0) {
          throw ledgerError(400, 'Payment amount must be positive — delete the entry instead');
        }
        if (entry.invoice_no) {
          await client.query(
            `UPDATE purchase_invoices SET total_amount = $1
              WHERE invoice_no = $2 AND invoice_type = 'payment_receipt'`,
            [newCredit, entry.invoice_no]
          );
        }
        await client.query(
          'UPDATE purchase_payment_records SET payment_amount = $1 WHERE ledger_id = $2',
          [newCredit, id]
        );
      }

      const result = await client.query(
        `UPDATE purchase_ledger
         SET debit = $1, credit = $2, debt = $3, note = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [newDebit, newCredit, newDebit - newCredit, note, id]
      );

      if (isLinked) {
        const unallocated = await PurchaseInvoiceController.rebuildSellerBalances(client, entry.seller_id);
        // Only block edits that push payments past what's owed — lowering a
        // payment or advance on an already-overpaid seller is still allowed.
        if (unallocated > 0.01 && newCredit > Number(entry.credit)) {
          throw ledgerError(400, `This would make payments exceed what is owed to the seller by ${unallocated.toFixed(2)}`);
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Ledger entry updated',
        data: result.rows[0]
      });

    } catch (error) {
      await client.query('ROLLBACK');
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('❌ Error updating ledger entry:', error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Delete a ledger entry
   * DELETE /api/purchase-ledger/:id
   *
   * Manual entries are simply removed. 'payment' entries (Owner only) also
   * remove their receipt invoice and purchase_payment_records row, then
   * rebuild the seller's balances. 'purchase' entries can't be deleted here —
   * the purchase's items, stock movement and invoice would be left behind.
   */
  static async deleteLedgerEntry(req, res) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM purchase_ledger WHERE id = $1 FOR UPDATE', [id]);
      if (existing.rows.length === 0) {
        throw ledgerError(404, 'Ledger entry not found');
      }
      const entry = existing.rows[0];
      const type = entry.transaction_type;

      if (type === 'purchase') {
        throw ledgerError(400, "Purchase entries can't be deleted from the ledger — the purchase's items, stock and invoice would be left behind. Edit the advance instead.");
      }

      if (type === 'payment') {
        if (!isOwner(req)) {
          throw ledgerError(403, "Only the Owner can delete 'payment' entries");
        }
        await client.query('DELETE FROM purchase_payment_records WHERE ledger_id = $1', [id]);
      }

      await client.query('DELETE FROM purchase_ledger WHERE id = $1', [id]);

      if (type === 'payment') {
        if (entry.invoice_no) {
          await client.query(
            `DELETE FROM purchase_invoices WHERE invoice_no = $1 AND invoice_type = 'payment_receipt'`,
            [entry.invoice_no]
          );
        }
        await PurchaseInvoiceController.rebuildSellerBalances(client, entry.seller_id);
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Ledger entry deleted'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error('❌ Error deleting ledger entry:', error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
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
