const pool = require('../db/pool');
const ReportsController = require('./ReportsController');

// Local-date formatting on purpose — toISOString() shifts to UTC and can land
// on the wrong calendar day depending on server timezone (same pitfall noted
// in ReportsController/CashbookController).
const toDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const VALID_PERIODS = ['today', 'week', 'month', 'all'];

/**
 * Resolves a period key into { current, previous } date ranges (inclusive,
 * 'YYYY-MM-DD'). previous is the immediately-preceding equivalent range,
 * used for the vs-last-period trend badges — null for 'all' (there is no
 * "previous" to all time). Week is Monday-start, matching
 * ReportsController.resolvePeriod's own convention, so "this week" means the
 * same thing on Analytics as it does on Reports.
 */
function getPeriodRanges(period) {
  const today = new Date();

  if (period === 'today') {
    const prev = new Date(today);
    prev.setDate(prev.getDate() - 1);
    return {
      current: { start: toDateStr(today), end: toDateStr(today) },
      previous: { start: toDateStr(prev), end: toDateStr(prev) }
    };
  }

  if (period === 'week') {
    const dayOffset = (today.getDay() + 6) % 7; // days since Monday
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const prevMonday = new Date(monday);
    prevMonday.setDate(monday.getDate() - 7);
    const prevSunday = new Date(monday);
    prevSunday.setDate(monday.getDate() - 1);
    return {
      current: { start: toDateStr(monday), end: toDateStr(sunday) },
      previous: { start: toDateStr(prevMonday), end: toDateStr(prevSunday) }
    };
  }

  if (period === 'month') {
    const y = today.getFullYear();
    const m = today.getMonth(); // 0-based
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    const prevStart = new Date(y, m - 1, 1);
    const prevEnd = new Date(y, m, 0);
    return {
      current: { start: toDateStr(start), end: toDateStr(end) },
      previous: { start: toDateStr(prevStart), end: toDateStr(prevEnd) }
    };
  }

  // 'all' — no lower bound worth naming, no previous period to compare against
  return {
    current: { start: '2000-01-01', end: toDateStr(today) },
    previous: null
  };
}

const pctChange = (curr, prev) => {
  if (!prev) return curr === 0 ? 0 : 100;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

const RECORD_TYPES = ['sale', 'purchase', 'expense', 'payment_in', 'payment_out'];

// Shared by getRecords' list and count queries so the two can never drift apart.
const ALL_RECORDS_CTE = `
  WITH all_records AS (
    SELECT s.id, 'sale'::text AS type, s.created_at AS occurred_at,
           s.sale_no::text AS reference, s.customer_name::text AS party,
           s.total_amount AS amount, s.status::text AS status, s.payment_type::text AS payment_type
    FROM sales s

    UNION ALL

    SELECT p.id, 'purchase'::text, p.created_at,
           p.purchase_no::text, p.seller_name::text,
           p.total_amount, p.status::text, p.payment_type::text
    FROM purchases p

    UNION ALL

    SELECT e.id, 'expense'::text, e.date::timestamp,
           ('EXP-' || e.id)::text, COALESCE(ec.name, 'Uncategorised')::text,
           e.amount, 'recorded'::text, NULL::text
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.category_id

    UNION ALL

    SELECT pr.id, 'payment_in'::text, pr.created_at,
           COALESCE(i.invoice_no, '')::text, pr.customer_name::text,
           pr.payment_amount, 'received'::text, pr.payment_type::text
    FROM payment_records pr
    LEFT JOIN invoices i ON i.id = pr.invoice_id

    UNION ALL

    SELECT ppr.id, 'payment_out'::text, ppr.created_at,
           COALESCE(pi.invoice_no, '')::text, ppr.seller_name::text,
           ppr.payment_amount, 'paid'::text, ppr.payment_type::text
    FROM purchase_payment_records ppr
    LEFT JOIN purchase_invoices pi ON pi.id = ppr.invoice_id
  )
`;

class AnalyticsController {
  /**
   * GET /api/analytics/summary?period=today|week|month|all
   * Every figure here is a full SQL aggregate over the real tables — never a
   * client-paginated page of rows re-summed in JS, which is what silently
   * undercounted revenue/customers/debt once any table passed ~100 rows.
   * Reuses ReportsController.generateSnapshot (the same source Reports and
   * the WhatsApp report already use) so Analytics can never disagree with
   * those pages about what "sales this month" or "customer debt" means.
   */
  static async getSummary(req, res) {
    try {
      const { period = 'month' } = req.query;
      if (!VALID_PERIODS.includes(period)) {
        return res.status(400).json({ error: `period must be one of ${VALID_PERIODS.join(', ')}` });
      }

      const { current, previous } = getPeriodRanges(period);

      const [currentSnap, prevSnap, stockRes, customersRes, sellersRes] = await Promise.all([
        ReportsController.generateSnapshot(current.start, current.end),
        previous ? ReportsController.generateSnapshot(previous.start, previous.end) : Promise.resolve(null),
        pool.query(
          `SELECT
            COALESCE(SUM(quantity * unit_price), 0) AS total_value,
            COALESCE(SUM(quantity), 0) AS total_items,
            COUNT(*) FILTER (WHERE quantity <= COALESCE(minimum_stock, 10)) AS low_stock_count
           FROM stock`
        ),
        pool.query('SELECT COUNT(*) AS total FROM customers'),
        pool.query('SELECT COUNT(*) AS total FROM sellers')
      ]);

      // Net profit follows the same definition Cashbook already uses for its
      // "net" figure (sales − purchases − expenses) — the old Analytics page
      // computed "Revenue − Expenses" and silently ignored purchases, which
      // overstated profit for a business whose main cost is buying stock/raw
      // materials.
      const profit = currentSnap.sales.total - currentSnap.purchases.total - currentSnap.expenses.total;
      const avgSaleValue = currentSnap.sales.count > 0 ? currentSnap.sales.total / currentSnap.sales.count : 0;

      let trends = null;
      if (prevSnap) {
        const prevProfit = prevSnap.sales.total - prevSnap.purchases.total - prevSnap.expenses.total;
        const prevAvgSale = prevSnap.sales.count > 0 ? prevSnap.sales.total / prevSnap.sales.count : 0;
        trends = {
          sales: pctChange(currentSnap.sales.total, prevSnap.sales.total),
          purchases: pctChange(currentSnap.purchases.total, prevSnap.purchases.total),
          expenses: pctChange(currentSnap.expenses.total, prevSnap.expenses.total),
          profit: pctChange(profit, prevProfit),
          avgSaleValue: pctChange(avgSaleValue, prevAvgSale),
          // customerDebt/payable are cumulative-as-of-periodEnd (see
          // ReportsController.generateSnapshot), so this compares "debt as of
          // now" to "debt as of the end of the previous period" — how much
          // the outstanding balance moved over the period, not period-scoped activity.
          debt: pctChange(currentSnap.customerDebt, prevSnap.customerDebt),
          payable: pctChange(currentSnap.payable, prevSnap.payable)
        };
      }

      res.json({
        success: true,
        data: {
          period,
          range: current,
          sales: currentSnap.sales,
          purchases: currentSnap.purchases,
          expenses: currentSnap.expenses,
          profit,
          avgSaleValue,
          customerDebt: currentSnap.customerDebt,
          payable: currentSnap.payable,
          netCashInHand: currentSnap.netCashInHand,
          stock: {
            totalValue: parseFloat(stockRes.rows[0].total_value),
            totalItems: parseInt(stockRes.rows[0].total_items, 10),
            lowStockCount: parseInt(stockRes.rows[0].low_stock_count, 10)
          },
          totalCustomers: parseInt(customersRes.rows[0].total, 10),
          totalSellers: parseInt(sellersRes.rows[0].total, 10),
          trends
        }
      });
    } catch (error) {
      console.error('❌ Error fetching analytics summary:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/analytics/orders-trend?granularity=monthly|weekly
   * Sales vs Purchases totals bucketed by calendar month (last 6) or ISO
   * week (last 8, Monday-start — same convention as the period filter
   * above). generate_series supplies every bucket up front so a month/week
   * with zero activity still renders as a real zero point instead of a gap.
   */
  static async getOrdersTrend(req, res) {
    try {
      const granularity = req.query.granularity === 'weekly' ? 'weekly' : 'monthly';
      const unit = granularity === 'weekly' ? 'week' : 'month';
      const span = granularity === 'weekly' ? 7 : 5;
      const labelFmt = granularity === 'weekly' ? 'DD Mon' : 'Mon YYYY';

      const result = await pool.query(
        `WITH buckets AS (
           SELECT generate_series(
             date_trunc('${unit}', CURRENT_DATE) - interval '${span} ${unit}s',
             date_trunc('${unit}', CURRENT_DATE),
             interval '1 ${unit}'
           ) AS bucket
         ),
         sales_by_bucket AS (
           SELECT date_trunc('${unit}', created_at) AS bucket, COALESCE(SUM(total_amount), 0) AS total
           FROM sales GROUP BY 1
         ),
         purchases_by_bucket AS (
           SELECT date_trunc('${unit}', created_at) AS bucket, COALESCE(SUM(total_amount), 0) AS total
           FROM purchases GROUP BY 1
         )
         SELECT
           to_char(b.bucket, '${labelFmt}') AS label,
           to_char(b.bucket, 'YYYY-MM-DD') AS period_start,
           COALESCE(s.total, 0) AS sales,
           COALESCE(p.total, 0) AS purchases
         FROM buckets b
         LEFT JOIN sales_by_bucket s ON s.bucket = b.bucket
         LEFT JOIN purchases_by_bucket p ON p.bucket = b.bucket
         ORDER BY b.bucket`
      );

      res.json({
        success: true,
        data: {
          granularity,
          points: result.rows.map(r => ({
            label: r.label,
            periodStart: r.period_start,
            sales: parseFloat(r.sales),
            purchases: parseFloat(r.purchases)
          }))
        }
      });
    } catch (error) {
      console.error('❌ Error fetching orders trend:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/analytics/earnings-breakdown?period=today|week|month|all
   * Sales revenue split by actual payment_type values (Cash / Bank Transfer /
   * Cheque / Other — the same fixed list every sale form offers, see
   * paymentOptions.js on the frontend), not an invented category.
   */
  static async getEarningsBreakdown(req, res) {
    try {
      const { period = 'month' } = req.query;
      if (!VALID_PERIODS.includes(period)) {
        return res.status(400).json({ error: `period must be one of ${VALID_PERIODS.join(', ')}` });
      }
      const { current } = getPeriodRanges(period);

      const result = await pool.query(
        `SELECT
           COALESCE(NULLIF(TRIM(payment_type), ''), 'Other') AS payment_type,
           COUNT(*) AS count,
           COALESCE(SUM(total_amount), 0) AS total
         FROM sales
         WHERE created_at::date BETWEEN $1 AND $2
         GROUP BY 1
         ORDER BY total DESC`,
        [current.start, current.end]
      );

      const totalEarnings = result.rows.reduce((sum, r) => sum + parseFloat(r.total), 0);
      const breakdown = result.rows.map(r => ({
        paymentType: r.payment_type,
        count: parseInt(r.count, 10),
        total: parseFloat(r.total),
        percent: totalEarnings > 0 ? (parseFloat(r.total) / totalEarnings) * 100 : 0
      }));

      res.json({ success: true, data: { period, totalEarnings, breakdown } });
    } catch (error) {
      console.error('❌ Error fetching earnings breakdown:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/analytics/records?page=&limit=&type=sale,purchase&search=&startDate=&endDate=
   * The "everything" ledger: every sale, purchase, expense, and payment
   * (both directions) in one paginated, filterable, searchable feed — so the
   * numbers on every stat card and chart above can be checked against the
   * actual rows that produced them.
   */
  static async getRecords(req, res) {
    try {
      const { search, startDate, endDate } = req.query;
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
      const offset = (page - 1) * limit;

      const clauses = [];
      const params = [];

      if (req.query.type) {
        const types = String(req.query.type).split(',').map(t => t.trim()).filter(Boolean);
        if (types.some(t => !RECORD_TYPES.includes(t))) {
          return res.status(400).json({ error: `type must be a comma-separated list of ${RECORD_TYPES.join(', ')}` });
        }
        params.push(types);
        clauses.push(`type = ANY($${params.length}::text[])`);
      }
      if (startDate) {
        params.push(startDate);
        clauses.push(`occurred_at::date >= $${params.length}::date`);
      }
      if (endDate) {
        params.push(endDate);
        clauses.push(`occurred_at::date <= $${params.length}::date`);
      }
      if (search) {
        params.push(`%${search}%`);
        clauses.push(`(party ILIKE $${params.length} OR reference ILIKE $${params.length})`);
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const listParams = [...params, limit, offset];

      const [listResult, countResult] = await Promise.all([
        pool.query(
          `${ALL_RECORDS_CTE}
           -- occurred_at goes out as pre-formatted local text, not a raw
           -- timestamp — res.json() would otherwise serialize the Date
           -- through toISOString(), which shifts it to UTC and can roll
           -- expenses (stored at local midnight) back a calendar day in any
           -- timezone ahead of UTC. Same pitfall Cashbook/Reports guard
           -- against for their DATE columns, applied here to a mixed
           -- timestamp column too.
           SELECT id, type, to_char(all_records.occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS occurred_at,
                  reference, party, amount, status, payment_type
           FROM all_records
           ${whereSql}
           ORDER BY all_records.occurred_at DESC, id DESC
           LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
          listParams
        ),
        pool.query(`${ALL_RECORDS_CTE} SELECT COUNT(*) FROM all_records ${whereSql}`, params)
      ]);

      const total = parseInt(countResult.rows[0].count, 10);
      res.json({
        success: true,
        data: listResult.rows.map(r => ({
          key: `${r.type}:${r.id}`,
          id: r.id,
          type: r.type,
          occurredAt: r.occurred_at,
          reference: r.reference,
          party: r.party,
          amount: parseFloat(r.amount),
          status: r.status,
          paymentType: r.payment_type
        })),
        pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 }
      });
    } catch (error) {
      console.error('❌ Error fetching analytics records:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = AnalyticsController;
