const pool = require('../db/pool');

class CustomerLedgerController {
  /**
   * Get full ledger for all customers
   * GET /api/ledger?page=1&limit=10
   */
  static async getFullLedger(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      // Get unique customers with their ledger summary
      const result = await pool.query(
        `SELECT DISTINCT ON (c.id)
          c.id,
          c.name as customer_name,
          c.phone,
          c.address,
          COALESCE(SUM(CASE WHEN cl.debit > 0 THEN cl.debit ELSE 0 END), 0) as total_debit,
          COALESCE(SUM(CASE WHEN cl.credit > 0 THEN cl.credit ELSE 0 END), 0) as total_credit,
          COALESCE(SUM(CASE WHEN cl.debit > 0 THEN cl.debit ELSE 0 END) - SUM(CASE WHEN cl.credit > 0 THEN cl.credit ELSE 0 END), 0) as debt
         FROM customers c
         LEFT JOIN customer_ledger cl ON c.id = cl.customer_id
         GROUP BY c.id, c.name, c.phone, c.address
         ORDER BY c.id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await pool.query('SELECT COUNT(DISTINCT customer_id) FROM customer_ledger');
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
         ORDER BY created_at DESC`,
        [customer_id]
      );

      // Calculate running balance
      let runningBalance = 0;
      const ledgerWithBalance = ledgerResult.rows.map(entry => {
        runningBalance += (entry.debit || 0) - (entry.credit || 0);
        return {
          ...entry,
          running_balance: runningBalance
        };
      });

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
  static async getLedgerSummary(req, res) {
    try {
      const result = await pool.query(
        `SELECT 
          COUNT(DISTINCT customer_id) as total_customers,
          COALESCE(SUM(CASE WHEN debit > 0 THEN debit ELSE 0 END), 0) as total_debit,
          COALESCE(SUM(CASE WHEN credit > 0 THEN credit ELSE 0 END), 0) as total_credit,
          COALESCE(SUM(CASE WHEN debit > 0 THEN debit ELSE 0 END) - SUM(CASE WHEN credit > 0 THEN credit ELSE 0 END), 0) as total_outstanding
         FROM customer_ledger`
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
