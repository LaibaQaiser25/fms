const pool = require('../db/pool');
const InvoiceController = require('./InvoiceController');

// Rows written by createSale/recordPayment — editing them cascades into
// invoices, sales and payment_records, so it's restricted to the Owner.
const LINKED_TYPES = ['sale', 'payment'];

const isOwner = (req) => req.user?.role?.toLowerCase() === 'owner';

const ledgerError = (status, message) => Object.assign(new Error(message), { status });

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
   * Update a ledger entry
   * PUT /api/ledger/:id
   * Body: { debit, credit, note }
   *
   * Manual entries: debit/credit/note are written as-is.
   * 'sale' entries (Owner only): only the advance (credit) and note — the total
   *   (debit) comes from the sale's items/stock, so it isn't editable here. The
   *   sale and its invoice get the new advance.
   * 'payment' entries (Owner only): only the amount (credit) and note — the
   *   receipt invoice and payment_records row get the new amount.
   * Either linked type then rebuilds the customer's invoice/sale balances.
   */
  static async updateLedgerEntry(req, res) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { debit = 0, credit = 0, note } = req.body;

      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM customer_ledger WHERE id = $1 FOR UPDATE', [id]);
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

      if (type === 'sale') {
        newDebit = Number(entry.debit) || 0;
        if (newCredit > newDebit + 0.01) {
          throw ledgerError(400, `Advance cannot exceed the sale total of ${newDebit.toFixed(2)}`);
        }
        if (entry.invoice_id) {
          const invoiceResult = await client.query(
            'UPDATE invoices SET advance_paid = $1 WHERE id = $2 RETURNING sale_id',
            [newCredit, entry.invoice_id]
          );
          const saleId = invoiceResult.rows[0]?.sale_id;
          if (saleId) {
            await client.query(
              'UPDATE sales SET advance_paid = $1, updated_at = NOW() WHERE id = $2',
              [newCredit, saleId]
            );
          }
        }
      } else if (type === 'payment') {
        newDebit = 0;
        if (newCredit <= 0) {
          throw ledgerError(400, 'Payment amount must be positive — delete the entry instead');
        }
        if (entry.invoice_id) {
          await client.query(
            `UPDATE invoices SET total_amount = $1 WHERE id = $2 AND invoice_type = 'payment_receipt'`,
            [newCredit, entry.invoice_id]
          );
        }
        await client.query(
          'UPDATE payment_records SET payment_amount = $1 WHERE ledger_id = $2',
          [newCredit, id]
        );
      }

      const result = await client.query(
        `UPDATE customer_ledger
         SET debit = $1, credit = $2, debt = $3, note = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [newDebit, newCredit, newDebit - newCredit, note, id]
      );

      if (isLinked) {
        const unallocated = await InvoiceController.rebuildCustomerBalances(client, entry.customer_id);
        // Only block edits that push payments past what's owed — lowering a
        // payment or advance on an already-overpaid customer is still allowed.
        if (unallocated > 0.01 && newCredit > Number(entry.credit)) {
          throw ledgerError(400, `This would make payments exceed what the customer owes by ${unallocated.toFixed(2)}`);
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
   * DELETE /api/ledger/:id
   *
   * Manual entries are simply removed. 'payment' entries (Owner only) also
   * remove their receipt invoice and payment_records row, then rebuild the
   * customer's balances. 'sale' entries can't be deleted here — the sale's
   * items, stock movement and invoice would be left behind.
   */
  static async deleteLedgerEntry(req, res) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      await client.query('BEGIN');

      const existing = await client.query('SELECT * FROM customer_ledger WHERE id = $1 FOR UPDATE', [id]);
      if (existing.rows.length === 0) {
        throw ledgerError(404, 'Ledger entry not found');
      }
      const entry = existing.rows[0];
      const type = entry.transaction_type;

      if (type === 'sale') {
        throw ledgerError(400, "Sale entries can't be deleted from the ledger — the sale's items, stock and invoice would be left behind. Edit the advance instead.");
      }

      if (type === 'payment') {
        if (!isOwner(req)) {
          throw ledgerError(403, "Only the Owner can delete 'payment' entries");
        }
        await client.query('DELETE FROM payment_records WHERE ledger_id = $1', [id]);
      }

      await client.query('DELETE FROM customer_ledger WHERE id = $1', [id]);

      if (type === 'payment') {
        if (entry.invoice_id) {
          await client.query(
            `DELETE FROM invoices WHERE id = $1 AND invoice_type = 'payment_receipt'`,
            [entry.invoice_id]
          );
        }
        await InvoiceController.rebuildCustomerBalances(client, entry.customer_id);
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
