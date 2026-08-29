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
  // Every day at 8:30 PM — sends the full daily report (sales, purchases,
  // expenses, net cash, pending customer debt, payable to sellers) instead
  // of the old low-stock/debt-only alert format.
  cron.schedule('30 20 * * *', async () => {
    console.log('🕣 Sending daily report...');

    try {
      const message = await ReportsController.buildDailyReportMessage();
      await sendWhatsApp(message);
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
        // >= rather than an exact-minute match: a schedule due at 00:01 that
        // gets missed that exact tick (a slow query, a brief DB hiccup, a
        // restart landing a few seconds late) would otherwise silently wait
        // a full day/week/month for the next exact match. The last_run_at
        // check below still guarantees at most one fire per day.
        const runHHMM = schedule.run_time.slice(0, 5);
        if (nowHHMM < runHHMM) continue;

        if (schedule.frequency === 'weekly' && schedule.run_day_of_week !== now.getDay()) continue;
        if (schedule.frequency === 'monthly' && schedule.run_day_of_month !== now.getDate()) continue;

        if (schedule.last_run_at && toDateStr(new Date(schedule.last_run_at)) === toDateStr(now)) continue;

        const period = ReportsController.resolvePeriod(schedule.frequency);
        if (!period) continue;

        const data = await ReportsController.generateSnapshot(period.periodStart, period.periodEnd);

        try {
          // reports_auto_period_uniq (migration 006) rejects a second auto
          // report for the same exact period — the last line of defence if
          // more than one backend process ends up alive at once (e.g. an
          // orphaned node process from a restart) and both race this same
          // schedule at the same minute.
          await pool.query(
            `INSERT INTO reports (period_type, period_start, period_end, label, generated_by, data)
             VALUES ($1, $2, $3, $4, 'auto', $5)`,
            [schedule.frequency, period.periodStart, period.periodEnd, period.label, JSON.stringify(data)]
          );
          console.log(`✅ Auto-generated ${schedule.frequency} report: ${period.label}`);
        } catch (insertError) {
          if (insertError.code === '23505') {
            console.log(`ℹ️ Skipped ${schedule.frequency} report for ${period.label} — another process already generated it`);
          } else {
            throw insertError;
          }
        }

        await pool.query(
          `UPDATE report_schedules SET last_run_at = NOW() WHERE frequency = $1`,
          [schedule.frequency]
        );
      }
    } catch (error) {
      console.error('❌ Report automation error:', error.message);
    }
  });

  console.log('✅ Cron jobs started');
};

module.exports = { startCronJobs };
