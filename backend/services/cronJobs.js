const cron = require('node-cron');
const pool = require('../db/pool');
const { sendWhatsApp } = require('./whatsappService');
const ReportsController = require('../controllers/ReportsController');

const toDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const startCronJobs = () => {
  // Every day at 9 PM
  cron.schedule('0 21 * * *', async () => {
    console.log('🕘 Running nightly alerts...');

    try {
      // 1. Low stock summary
      const stockResult = await pool.query(
        `SELECT name, quantity, minimum_stock 
         FROM stock 
         WHERE quantity <= COALESCE(minimum_stock, 10)
         ORDER BY quantity ASC`
      );

      if (stockResult.rows.length > 0) {
        let msg = '⚠️ *Low Stock Alert*\n\n';
        stockResult.rows.forEach(item => {
          msg += `• ${item.name}: ${item.quantity} units left\n`;
        });
        await sendWhatsApp(msg);
      }

      // 2. Outstanding debts summary
      const debtResult = await pool.query(
        `SELECT customer_name, outstanding_debt, invoice_no
         FROM invoices
         WHERE status IN ('unpaid', 'partial')
         ORDER BY outstanding_debt DESC`
      );

      if (debtResult.rows.length > 0) {
        let msg = '💰 *Outstanding Payments Alert*\n\n';
        debtResult.rows.forEach(inv => {
          msg += `• ${inv.customer_name} — Rs.${inv.outstanding_debt} (${inv.invoice_no})\n`;
        });
        await sendWhatsApp(msg);
      }

    } catch (error) {
      console.error('❌ Cron job error:', error.message);
    }
  });

  // Every minute: fire any enabled report_schedules row whose run_time (and,
  // for weekly/monthly, run_day_of_week/run_day_of_month) matches right now,
  // and that hasn't already fired today.
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const { rows: schedules } = await pool.query(
        `SELECT * FROM report_schedules WHERE enabled = true`
      );

      for (const schedule of schedules) {
        const runHHMM = schedule.run_time.slice(0, 5);
        if (runHHMM !== nowHHMM) continue;

        if (schedule.frequency === 'weekly' && schedule.run_day_of_week !== now.getDay()) continue;
        if (schedule.frequency === 'monthly' && schedule.run_day_of_month !== now.getDate()) continue;

        if (schedule.last_run_at && toDateStr(new Date(schedule.last_run_at)) === toDateStr(now)) continue;

        const period = ReportsController.resolvePeriod(schedule.frequency);
        if (!period) continue;

        const data = await ReportsController.generateSnapshot(period.periodStart, period.periodEnd);

        await pool.query(
          `INSERT INTO reports (period_type, period_start, period_end, label, generated_by, data)
           VALUES ($1, $2, $3, $4, 'auto', $5)`,
          [schedule.frequency, period.periodStart, period.periodEnd, period.label, JSON.stringify(data)]
        );
        await pool.query(
          `UPDATE report_schedules SET last_run_at = NOW() WHERE frequency = $1`,
          [schedule.frequency]
        );

        console.log(`✅ Auto-generated ${schedule.frequency} report: ${period.label}`);
      }
    } catch (error) {
      console.error('❌ Report automation error:', error.message);
    }
  });

  console.log('✅ Cron jobs started');
};

module.exports = { startCronJobs };