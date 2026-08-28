const pool = require('../db/pool');
const CashbookController = require('./CashbookController');

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// Local-date formatting on purpose — toISOString() shifts to UTC and can land
// on the wrong calendar day depending on server timezone (same pitfall noted
// in Cashbook.jsx's date parsing).
const toDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// res.json() serializes a DATE column through toISOString(), which rolls it
// back a day in any timezone ahead of UTC (same pitfall CashbookController
// works around) — send period_start/period_end out as plain 'YYYY-MM-DD' text.
const REPORT_COLUMNS = `id, period_type,
  to_char(period_start, 'YYYY-MM-DD') AS period_start,
  to_char(period_end, 'YYYY-MM-DD') AS period_end,
  label, generated_by, data, created_at, updated_at`;

const formatDisplay = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Resolves a { periodType, month, year } request into concrete boundaries.
 * month/year only matter for 'monthly'/'yearly' — 'daily' is always today,
 * 'weekly' is always the current week (Monday-start), matching what the
 * Create Report UI actually offers.
 */
function resolvePeriod(periodType, month, year) {
  const today = new Date();

  if (periodType === 'daily') {
    const d = toDateStr(today);
    return { periodStart: d, periodEnd: d, label: `Daily — ${formatDisplay(d)}` };
  }

  if (periodType === 'weekly') {
    const dayOffset = (today.getDay() + 6) % 7; // days since Monday
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const start = toDateStr(monday);
    const end = toDateStr(sunday);
    return { periodStart: start, periodEnd: end, label: `Week of ${formatDisplay(start)}` };
  }

  if (periodType === 'monthly') {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10); // 1-12
    if (!y || !m || m < 1 || m > 12) return null;
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0); // day 0 of next month = last day of this month
    return { periodStart: toDateStr(start), periodEnd: toDateStr(end), label: `${MONTH_NAMES[m - 1]} ${y}` };
  }

  if (periodType === 'yearly') {
    const y = parseInt(year, 10);
    if (!y) return null;
    return { periodStart: `${y}-01-01`, periodEnd: `${y}-12-31`, label: `${y}` };
  }

  return null;
}

class ReportsController {
  /**
   * Runs the same five aggregations manually (sales/purchases/expenses/net
   * cash/debt/payable) and returns the frozen snapshot shape stored in
   * reports.data. Shared by the manual-create endpoint and the automation cron.
   */
  static async generateSnapshot(periodStart, periodEnd) {
    const [salesRes, purchasesRes, expensesRes, cashRes, debtRes, payableRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
         FROM sales WHERE created_at::date BETWEEN $1 AND $2`,
        [periodStart, periodEnd]
      ),
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
         FROM purchases WHERE created_at::date BETWEEN $1 AND $2`,
        [periodStart, periodEnd]
      ),
      pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
         FROM expenses WHERE date BETWEEN $1 AND $2`,
        [periodStart, periodEnd]
      ),
      // Cumulative cash-in-hand as of periodEnd: every recorded cash movement
      // up to that day, no startDate — there's no opening-balance concept.
      pool.query(
        `${CashbookController.CASH_ENTRIES_CTE}
         SELECT
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'sale'), 0) -
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'purchase'), 0) -
           COALESCE(SUM(amount) FILTER (WHERE entry_type = 'expense'), 0) as net
         FROM cash_entries WHERE entry_date <= $1`,
        [periodEnd]
      ),
      pool.query(
        `SELECT COALESCE(SUM(debit) - SUM(credit), 0) as outstanding
         FROM customer_ledger WHERE created_at::date <= $1`,
        [periodEnd]
      ),
      pool.query(
        `SELECT COALESCE(SUM(debit) - SUM(credit), 0) as outstanding
         FROM purchase_ledger WHERE created_at::date <= $1`,
        [periodEnd]
      )
    ]);

    return {
      sales: { total: parseFloat(salesRes.rows[0].total), count: parseInt(salesRes.rows[0].count, 10) },
      purchases: { total: parseFloat(purchasesRes.rows[0].total), count: parseInt(purchasesRes.rows[0].count, 10) },
      expenses: { total: parseFloat(expensesRes.rows[0].total), count: parseInt(expensesRes.rows[0].count, 10) },
      netCashInHand: parseFloat(cashRes.rows[0].net),
      customerDebt: parseFloat(debtRes.rows[0].outstanding),
      payable: parseFloat(payableRes.rows[0].outstanding)
    };
  }

  /**
   * POST /api/reports
   * Body: { periodType: 'daily'|'weekly'|'monthly'|'yearly', month?, year? }
   */
  static async createReport(req, res) {
    try {
      const { periodType, month, year } = req.body;
      const period = resolvePeriod(periodType, month, year);
      if (!period) {
        return res.status(400).json({ error: 'Invalid periodType, or missing month/year for monthly/yearly reports' });
      }

      const data = await ReportsController.generateSnapshot(period.periodStart, period.periodEnd);

      const result = await pool.query(
        `INSERT INTO reports (period_type, period_start, period_end, label, generated_by, data)
         VALUES ($1, $2, $3, $4, 'manual', $5)
         RETURNING ${REPORT_COLUMNS}`,
        [periodType, period.periodStart, period.periodEnd, period.label, JSON.stringify(data)]
      );

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error('❌ Error creating report:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/reports?search=&periodType=&dateFrom=&dateTo=&sortBy=&order=&page=&limit=
   * search matches only the label and the date range (kept intentionally simple).
   */
  static async listReports(req, res) {
    try {
      const { search, periodType, dateFrom, dateTo, sortBy = 'created_at', order = 'DESC', page = 1, limit = 25 } = req.query;

      let query = `SELECT ${REPORT_COLUMNS} FROM reports WHERE 1=1`;
      let countQuery = `SELECT COUNT(*) FROM reports WHERE 1=1`;
      const params = [];
      let i = 1;

      if (periodType) {
        query += ` AND period_type = $${i}`;
        countQuery += ` AND period_type = $${i}`;
        params.push(periodType);
        i++;
      }
      if (dateFrom) {
        query += ` AND period_end >= $${i}`;
        countQuery += ` AND period_end >= $${i}`;
        params.push(dateFrom);
        i++;
      }
      if (dateTo) {
        query += ` AND period_start <= $${i}`;
        countQuery += ` AND period_start <= $${i}`;
        params.push(dateTo);
        i++;
      }
      if (search) {
        query += ` AND (label ILIKE $${i} OR period_start::text ILIKE $${i} OR period_end::text ILIKE $${i})`;
        countQuery += ` AND (label ILIKE $${i} OR period_start::text ILIKE $${i} OR period_end::text ILIKE $${i})`;
        params.push(`%${search}%`);
        i++;
      }

      const validSort = ['created_at', 'period_start', 'period_end', 'label'];
      const sortColumn = validSort.includes(sortBy) ? sortBy : 'created_at';
      const sortOrder = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      query += ` ORDER BY ${sortColumn} ${sortOrder}`;

      const countParams = params.slice();
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      query += ` LIMIT $${i} OFFSET $${i + 1}`;
      params.push(limit, offset);

      const [listResult, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, countParams)
      ]);

      const total = parseInt(countResult.rows[0].count, 10);
      res.json({
        success: true,
        data: listResult.rows,
        pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), pages: Math.ceil(total / limit) }
      });
    } catch (error) {
      console.error('❌ Error listing reports:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /** GET /api/reports/:id */
  static async getReport(req, res) {
    try {
      const result = await pool.query(`SELECT ${REPORT_COLUMNS} FROM reports WHERE id = $1`, [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error('❌ Error fetching report:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * PUT /api/reports/:id — manual correction of a stored snapshot.
   * Body: { label?, data?: { sales, purchases, expenses, netCashInHand, customerDebt, payable } }
   */
  static async updateReport(req, res) {
    try {
      const { label, data } = req.body;
      const existing = await pool.query('SELECT * FROM reports WHERE id = $1', [req.params.id]);
      if (existing.rows.length === 0) return res.status(404).json({ error: 'Report not found' });

      const nextLabel = label ?? existing.rows[0].label;
      const nextData = data ? { ...existing.rows[0].data, ...data } : existing.rows[0].data;

      const result = await pool.query(
        `UPDATE reports SET label = $1, data = $2, updated_at = NOW() WHERE id = $3 RETURNING ${REPORT_COLUMNS}`,
        [nextLabel, JSON.stringify(nextData), req.params.id]
      );

      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error('❌ Error updating report:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /** DELETE /api/reports/:id */
  static async deleteReport(req, res) {
    try {
      const result = await pool.query('DELETE FROM reports WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
      res.json({ success: true, message: 'Report deleted' });
    } catch (error) {
      console.error('❌ Error deleting report:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /** GET /api/reports/schedules */
  static async getSchedules(req, res) {
    try {
      const result = await pool.query('SELECT * FROM report_schedules ORDER BY frequency');
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('❌ Error fetching report schedules:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * PUT /api/reports/schedules/:frequency
   * Body: { enabled, runTime, runDayOfWeek?, runDayOfMonth? }
   */
  static async updateSchedule(req, res) {
    try {
      const { frequency } = req.params;
      if (!['daily', 'weekly', 'monthly'].includes(frequency)) {
        return res.status(400).json({ error: 'Invalid frequency' });
      }
      const { enabled, runTime, runDayOfWeek, runDayOfMonth } = req.body;

      const result = await pool.query(
        `UPDATE report_schedules
         SET enabled = COALESCE($1, enabled),
             run_time = COALESCE($2, run_time),
             run_day_of_week = COALESCE($3, run_day_of_week),
             run_day_of_month = COALESCE($4, run_day_of_month)
         WHERE frequency = $5
         RETURNING *`,
        [enabled, runTime, runDayOfWeek ?? null, runDayOfMonth ?? null, frequency]
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'Schedule not found' });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error('❌ Error updating report schedule:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

// Exposed so the report_schedules cron (services/cronJobs.js) can compute the
// same period boundaries the manual "Create Report" endpoint uses, instead of
// re-deriving week/month/year math in a second place.
ReportsController.resolvePeriod = resolvePeriod;

module.exports = ReportsController;
