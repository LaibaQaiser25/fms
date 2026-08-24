const pool = require('../db/pool');

/**
 * Cash-basis cashbook: every movement of actual money, in one normalized view.
 *
 * IMPORTANT — sources are deliberate. `invoices` and `purchase_invoices` are
 * NOT read here and must not be added: recordPayment inserts a second
 * 'payment_receipt' invoice row alongside the original 'proforma' row, so
 * summing those tables double-counts every payment. The five sources below
 * each represent money that actually moved, exactly once:
 *
 *   sales.advance_paid              cash in  — taken at the point of sale
 *   payment_records                 cash in  — later customer payments
 *   purchases.advance_paid          cash out — paid at the point of purchase
 *   purchase_payment_records        cash out — later seller payments
 *   expenses.amount                 cash out — expenses
 *
 * Every branch is cast explicitly so UNION ALL type resolution can't drift, and
 * every source exposes `entry_date` as a DATE — expenses.date is a DATE while
 * the others are TIMESTAMPs, and comparing a timestamp against a bare date
 * silently drops the last day of any range.
 */
const CASH_ENTRIES_CTE = `
  WITH cash_entries AS (
    -- cash in: advance taken when the sale was created
    SELECT
      'sale'::text                  AS entry_type,
      'in'::text                    AS direction,
      s.created_at::date            AS entry_date,
      s.created_at                  AS entry_ts,
      s.sale_no::text               AS reference,
      s.customer_name::text         AS party,
      s.customer_id                 AS party_id,
      s.advance_paid                AS amount,
      s.payment_type::text          AS payment_type,
      'Advance on sale'::text       AS note,
      s.id                          AS source_id,
      NULL::integer                 AS category_id
    FROM sales s
    WHERE s.advance_paid > 0

    UNION ALL

    -- cash in: payments received against a customer's open invoices
    SELECT
      'sale'::text, 'in'::text,
      pr.created_at::date, pr.created_at,
      COALESCE(i.invoice_no, '')::text,
      pr.customer_name::text, pr.customer_id,
      pr.payment_amount, pr.payment_type::text,
      COALESCE(NULLIF(pr.notes, ''), 'Payment received')::text,
      pr.id, NULL::integer
    FROM payment_records pr
    LEFT JOIN invoices i ON i.id = pr.invoice_id

    UNION ALL

    -- cash out: advance paid when the purchase was created
    SELECT
      'purchase'::text, 'out'::text,
      p.created_at::date, p.created_at,
      p.purchase_no::text,
      p.seller_name::text, p.seller_id,
      p.advance_paid, p.payment_type::text,
      'Advance on purchase'::text,
      p.id, NULL::integer
    FROM purchases p
    WHERE p.advance_paid > 0

    UNION ALL

    -- cash out: payments made against a seller's open invoices
    SELECT
      'purchase'::text, 'out'::text,
      ppr.created_at::date, ppr.created_at,
      COALESCE(pi.invoice_no, '')::text,
      ppr.seller_name::text, ppr.seller_id,
      ppr.payment_amount, ppr.payment_type::text,
      COALESCE(NULLIF(ppr.notes, ''), 'Payment made')::text,
      ppr.id, NULL::integer
    FROM purchase_payment_records ppr
    LEFT JOIN purchase_invoices pi ON pi.id = ppr.invoice_id

    UNION ALL

    -- cash out: expenses
    SELECT
      'expense'::text, 'out'::text,
      e.date, e.date::timestamp,
      ('EXP-' || e.id)::text,
      COALESCE(ec.name, 'Uncategorised')::text, NULL::integer,
      e.amount, NULL::text,
      COALESCE(NULLIF(e.description, ''), 'Expense')::text,
      e.id, e.category_id
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
  )
`;

const VALID_TYPES = ['sale', 'purchase', 'expense'];
const VALID_DIRECTIONS = ['in', 'out'];

// Maps the public sort key to a column on the CTE — never interpolate raw input
const SORT_COLUMNS = {
  date: 'entry_ts',
  amount: 'amount',
  type: 'entry_type',
  party: 'party'
};

class CashbookController {
  /**
   * Turn the query string into a parameterized WHERE clause over cash_entries.
   * Shared by the list and the totals query so the two can never drift apart.
   * Returns null on invalid input so the caller can 400.
   */
  static buildFilters(query) {
    const { startDate, endDate, type, direction, categoryId, partyId, paymentType, search } = query;

    const clauses = [];
    const params = [];

    if (startDate) {
      params.push(startDate);
      clauses.push(`entry_date >= $${params.length}::date`);
    }

    // Inclusive: entry_date is a DATE on every branch, so the last day is kept
    if (endDate) {
      params.push(endDate);
      clauses.push(`entry_date <= $${params.length}::date`);
    }

    let types = [];
    if (type) {
      types = String(type).split(',').map(t => t.trim()).filter(Boolean);
      if (types.some(t => !VALID_TYPES.includes(t))) return null;
      params.push(types);
      clauses.push(`entry_type = ANY($${params.length}::text[])`);
    }

    if (direction) {
      if (!VALID_DIRECTIONS.includes(direction)) return null;
      params.push(direction);
      clauses.push(`direction = $${params.length}`);
    }

    // Only expense rows carry a category_id
    if (categoryId) {
      params.push(categoryId);
      clauses.push(`category_id = $${params.length}`);
    }

    // A party id is only meaningful together with a type — customer 3 and
    // seller 3 are different people
    if (partyId) {
      params.push(partyId);
      clauses.push(`party_id = $${params.length}`);
      if (types.length !== 1) {
        params.push(['sale', 'purchase']);
        clauses.push(`entry_type = ANY($${params.length}::text[])`);
      }
    }

    if (paymentType) {
      params.push(paymentType);
      clauses.push(`payment_type = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(party ILIKE $${params.length} OR reference ILIKE $${params.length} OR note ILIKE $${params.length})`);
    }

    return {
      whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params
    };
  }

  /**
   * Totals across the whole filtered set — never just the current page.
   * Also returns the row count, so the list endpoint needs no separate COUNT.
   */
  static async fetchTotals(whereSql, params) {
    const result = await pool.query(
      `${CASH_ENTRIES_CTE}
       SELECT
         COALESCE(SUM(amount) FILTER (WHERE entry_type = 'sale'), 0)     AS sales_in,
         COALESCE(SUM(amount) FILTER (WHERE entry_type = 'purchase'), 0) AS purchases_out,
         COALESCE(SUM(amount) FILTER (WHERE entry_type = 'expense'), 0)  AS expenses_out,
         COUNT(*) FILTER (WHERE entry_type = 'sale')     AS sales_count,
         COUNT(*) FILTER (WHERE entry_type = 'purchase') AS purchases_count,
         COUNT(*) FILTER (WHERE entry_type = 'expense')  AS expenses_count,
         COUNT(*)                                        AS total_count
       FROM cash_entries
       ${whereSql}`,
      params
    );

    const row = result.rows[0];
    const salesIn = Number(row.sales_in);
    const purchasesOut = Number(row.purchases_out);
    const expensesOut = Number(row.expenses_out);

    return {
      totals: {
        salesIn,
        purchasesOut,
        expensesOut,
        net: salesIn - purchasesOut - expensesOut,
        counts: {
          sales: Number(row.sales_count),
          purchases: Number(row.purchases_count),
          expenses: Number(row.expenses_count)
        }
      },
      totalCount: Number(row.total_count)
    };
  }

  /**
   * Cashbook entries + totals
   * GET /api/cashbook?startDate=&endDate=&type=sale,expense&direction=&categoryId=
   *                  &partyId=&paymentType=&search=&sortBy=date&order=DESC&page=1&limit=25
   */
  static async getCashbook(req, res) {
    try {
      const filters = CashbookController.buildFilters(req.query);
      if (!filters) {
        return res.status(400).json({ error: 'Invalid type or direction filter' });
      }

      const { sortBy = 'date', order = 'DESC' } = req.query;
      const sortColumn = SORT_COLUMNS[sortBy] || SORT_COLUMNS.date;
      const sortOrder = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
      const offset = (page - 1) * limit;

      const listParams = [...filters.params, limit, offset];

      const [listResult, summary] = await Promise.all([
        pool.query(
          `${CASH_ENTRIES_CTE}
           -- entry_date goes out as text on purpose: res.json() serializes a
           -- DATE through toISOString(), which rolls it back a day in any
           -- timezone ahead of UTC — the same off-by-one the date filters avoid
           SELECT entry_type, direction,
                  to_char(entry_date, 'YYYY-MM-DD') AS entry_date,
                  entry_ts, reference, party,
                  party_id, amount, payment_type, note, source_id, category_id
           FROM cash_entries
           ${filters.whereSql}
           ORDER BY ${sortColumn} ${sortOrder}, entry_ts DESC, source_id DESC
           LIMIT $${filters.params.length + 1} OFFSET $${filters.params.length + 2}`,
          listParams
        ),
        CashbookController.fetchTotals(filters.whereSql, filters.params)
      ]);

      res.json({
        success: true,
        data: listResult.rows,
        totals: summary.totals,
        pagination: {
          total: summary.totalCount,
          page,
          limit,
          pages: Math.ceil(summary.totalCount / limit)
        }
      });

    } catch (error) {
      console.error('❌ Error fetching cashbook:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Totals only, same filters — for summary cards that load independently
   * GET /api/cashbook/summary
   */
  static async getCashbookSummary(req, res) {
    try {
      const filters = CashbookController.buildFilters(req.query);
      if (!filters) {
        return res.status(400).json({ error: 'Invalid type or direction filter' });
      }

      const summary = await CashbookController.fetchTotals(filters.whereSql, filters.params);

      res.json({
        success: true,
        data: {
          ...summary.totals,
          entryCount: summary.totalCount
        }
      });

    } catch (error) {
      console.error('❌ Error fetching cashbook summary:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Distinct payment types present in the cashbook, for the filter dropdown
   * GET /api/cashbook/payment-types
   */
  static async getPaymentTypes(req, res) {
    try {
      const result = await pool.query(
        `${CASH_ENTRIES_CTE}
         SELECT DISTINCT payment_type
         FROM cash_entries
         WHERE payment_type IS NOT NULL AND payment_type <> ''
         ORDER BY payment_type`
      );

      res.json({
        success: true,
        data: result.rows.map(r => r.payment_type)
      });

    } catch (error) {
      console.error('❌ Error fetching cashbook payment types:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = CashbookController;
