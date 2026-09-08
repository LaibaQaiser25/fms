const pool = require('../db/pool');

class CustomerLedgerController {
  /**
   * Get full ledger for all customers
   * GET /api/ledger?page=1&limit=10
   */
  static async getFullLedger(req, res) {
    try {
      const { page = 1, limit = 10, search = '', sortBy = 'id', sortOrder = 'desc' } = req.query;
      const offset = (page - 1) * limit;

      const sortColumns = {
        name: 'c.name',
        debit: 'total_debit',
        credit: 'total_credit',
        debt: 'debt',
        id: 'c.id'
      };
      const sortColumn = sortColumns[sortBy] || sortColumns.id;
      const order = String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      const params = [];
      let searchClause = '';
      if (search) {
        params.push(`%${search}%`);
        searchClause = `WHERE (c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`;
      }
      params.push(limit, offset);

      // Get unique customers with their ledger summary
      const result = await pool.query(
        `SELECT
          c.id,
          c.name as customer_name,
          c.phone,
          c.address,
          COALESCE(SUM(CASE WHEN cl.debit > 0 THEN cl.debit ELSE 0 END), 0) as total_debit,
          COALESCE(SUM(CASE WHEN cl.credit > 0 THEN cl.credit ELSE 0 END), 0) as total_credit,
          COALESCE(SUM(CASE WHEN cl.debit > 0 THEN cl.debit ELSE 0 END) - SUM(CASE WHEN cl.credit > 0 THEN cl.credit ELSE 0 END), 0) as debt
         FROM customer_ledger cl
         JOIN customers c ON c.id = cl.customer_id
         ${searchClause}
         GROUP BY c.id, c.name, c.phone, c.address
         ORDER BY ${sortColumn} ${order}
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const countParams = search ? [`%${search}%`] : [];
      const countResult = await pool.query(
        `SELECT COUNT(DISTINCT cl.customer_id)
         FROM customer_ledger cl
         JOIN customers c ON c.id = cl.customer_id
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
      console.error('❌ Error fetching ledger:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get customer ledger history
   * GET /api/ledger/customer/:customer_id
   */
  static async getCustomerLedgerHistory(req, res) {
    try {
      const { customer_id } = req.params;

      const customerResult = await pool.query(
        'SELECT * FROM customers WHERE id = $1',
        [customer_id]
      );

      if (customerResult.rows.length === 0) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const ledgerResult = await pool.query(
        `SELECT
          id, invoice_no, debit, credit, debt, transaction_type, note, created_at
         FROM customer_ledger
         WHERE customer_id = $1
         ORDER BY created_at ASC, id ASC`,
        [customer_id]
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
         FROM customer_ledger 
         WHERE customer_id = $1`,
        [customer_id]
      );

      res.json({
        success: true,
        data: {
          customer: customerResult.rows[0],
          history: ledgerWithBalance,
          summary: summaryResult.rows[0]
        }
      });

    } catch (error) {
      console.error('❌ Error fetching customer ledger:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get ledger summary (all customers)
   * GET /api/ledger/summary/all
   */
  /**
   * GET /api/ledger/summary/all?asOfDate=  — asOfDate caps the snapshot at that
   * day (used by Reports for "debt as of X"); omitted, it's the all-time total.
   */
  static async getLedgerSummary(req, res) {
    try {
      const { asOfDate } = req.query;
      const result = await pool.query(
        `SELECT
          COUNT(DISTINCT customer_id) as total_customers,
          COALESCE(SUM(CASE WHEN debit > 0 THEN debit ELSE 0 END), 0) as total_debit,
          COALESCE(SUM(CASE WHEN credit > 0 THEN credit ELSE 0 END), 0) as total_credit,
          COALESCE(SUM(CASE WHEN debit > 0 THEN debit ELSE 0 END) - SUM(CASE WHEN credit > 0 THEN credit ELSE 0 END), 0) as total_outstanding
         FROM customer_ledger
         WHERE $1::date IS NULL OR created_at::date <= $1`,
        [asOfDate || null]
      );

      res.json({
        success: true,
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error fetching ledger summary:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Add manual ledger entry
   * POST /api/ledger
   * Body: { customer_id, customer_name, debit, credit, transaction_type, note }
   */
  static async addLedgerEntry(req, res) {
    try {
      const { customer_id, customer_name, debit = 0, credit = 0, transaction_type, note } = req.body;

      if (!customer_id) {
        return res.status(400).json({ error: 'Missing customer_id' });
      }

      // 'sale' and 'payment' rows are written by createSale/recordPayment, which
      // also update invoices.outstanding_debt/status and sales.balance in the
      // same transaction. A manual entry of those types would insert a ledger
      // row without touching those balances, desyncing them from the ledger.
      if (['sale', 'payment'].includes(transaction_type)) {
        return res.status(400).json({
          error: `transaction_type '${transaction_type}' must go through the sale/payment endpoints, not a manual ledger entry`
        });
      }

      const debt = debit - credit;

      const result = await pool.query(
        `INSERT INTO customer_ledger (customer_id, customer_name, debit, credit, debt, transaction_type, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [customer_id, customer_name, debit, credit, debt, transaction_type, note]
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
   * Update a manual ledger entry
   * PUT /api/ledger/:id
   * Body: { debit, credit, note }
   */
  static async updateLedgerEntry(req, res) {
    try {
      const { id } = req.params;
      const { debit = 0, credit = 0, note } = req.body;

      const existing = await pool.query('SELECT * FROM customer_ledger WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Ledger entry not found' });
      }

      // 'sale' and 'payment' rows are kept in sync with invoices/sales balances
      // elsewhere — editing them here would desync those. Only manual entries
      // (see addLedgerEntry) can be edited through this endpoint.
      if (['sale', 'payment'].includes(existing.rows[0].transaction_type)) {
        return res.status(400).json({
          error: `'${existing.rows[0].transaction_type}' entries must be edited through the sale/payment endpoints, not a manual ledger edit`
        });
      }

      const debt = debit - credit;

      const result = await pool.query(
        `UPDATE customer_ledger
         SET debit = $1, credit = $2, debt = $3, note = $4
         WHERE id = $5
         RETURNING *`,
        [debit, credit, debt, note, id]
      );

      res.json({
        success: true,
        message: 'Ledger entry updated',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error updating ledger entry:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Delete a manual ledger entry
   * DELETE /api/ledger/:id
   */
  static async deleteLedgerEntry(req, res) {
    try {
      const { id } = req.params;

      const existing = await pool.query('SELECT * FROM customer_ledger WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Ledger entry not found' });
      }

      if (['sale', 'payment'].includes(existing.rows[0].transaction_type)) {
        return res.status(400).json({
          error: `'${existing.rows[0].transaction_type}' entries must be removed through the sale/payment flow, not a manual ledger delete`
        });
      }

      await pool.query('DELETE FROM customer_ledger WHERE id = $1', [id]);

      res.json({
        success: true,
        message: 'Ledger entry deleted'
      });

    } catch (error) {
      console.error('❌ Error deleting ledger entry:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get outstanding debts (high to low)
   * GET /api/ledger/debts/outstanding
   */
  static async getOutstandingDebts(req, res) {
    try {
      const result = await pool.query(
        `SELECT DISTINCT ON (c.id)
          c.id,
          c.name as customer_name,
          c.phone,
          COALESCE(SUM(CASE WHEN cl.debit > 0 THEN cl.debit ELSE 0 END), 0) as total_amount,
          COALESCE(SUM(CASE WHEN cl.credit > 0 THEN cl.credit ELSE 0 END), 0) as total_paid,
          COALESCE(SUM(CASE WHEN cl.debit > 0 THEN cl.debit ELSE 0 END) - SUM(CASE WHEN cl.credit > 0 THEN cl.credit ELSE 0 END), 0) as outstanding_debt
         FROM customers c
         LEFT JOIN customer_ledger cl ON c.id = cl.customer_id
         GROUP BY c.id, c.name, c.phone
         HAVING COALESCE(SUM(CASE WHEN cl.debit > 0 THEN cl.debit ELSE 0 END) - SUM(CASE WHEN cl.credit > 0 THEN cl.credit ELSE 0 END), 0) > 0
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

module.exports = CustomerLedgerController;
