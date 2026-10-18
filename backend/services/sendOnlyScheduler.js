const cron = require('node-cron');
const pool = require('../db/pool');
const { sendWhatsApp } = require('./whatsappService');
const { buildDailyDigest } = require('./stockAlerts');
const ReportsController = require('../controllers/ReportsController');

// Online server only, REPORT_SENDER_MODE=send_only (T2.1). Scheduled reports
// and the daily digests go out from here, so they arrive even when the
// factory PC is switched off at that minute (F12). Takes the place of
// services/cronJobs.js on this server; the factory app then runs none (T2.2).
//
// This file never writes the mirror tables (D2): every statement except the
// report_dispatch_log insert is a SELECT. It runs in-process, past the
// read-only wall (middleware/readOnlyMode.js only guards HTTP), so this is
// enforced by review: a grep for write statements in this file must find
// only that one insert. Report rows are not stored either: what was sent is
// in report_dispatch_log.
//
// Once per period: the dispatch row is inserted in the same transaction as
// the send and committed only if the send worked. A failed send leaves no
// row, so the next minute tries again; a second process in the same minute
// waits on that row and then skips it.

// Digests: 7:30, and again at 10:00 for Meta's 24-hour window (§10). Each is
// caught up until the next one is due, so a late start never sends both.
const DIGEST_SLOTS = [
  { key: '0730', label: '7:30 AM', from: '07:30', until: '10:00' },
  { key: '1000', label: '10:00 AM', from: '10:00', until: '24:00' },
];

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// What is due at `now` (server local time, Asia/Karachi on the VPS):
// [{ frequency, periodKey, build: async () => ({ message, payload }) }].
async function dueItems(now, db = pool) {
  const items = [];
  const { rows: schedules } = await db.query('SELECT * FROM report_schedules WHERE enabled = true');
  for (const schedule of schedules) {
    // Same >= catch-up as cronJobs.js: a tick missed at run_time still fires
    // later that day.
    if (hhmm(now) < schedule.run_time.slice(0, 5)) continue;
    if (schedule.frequency === 'weekly' && schedule.run_day_of_week !== now.getDay()) continue;
    if (schedule.frequency === 'monthly' && schedule.run_day_of_month !== now.getDate()) continue;
    const period = ReportsController.resolvePeriod(schedule.frequency, now.getMonth() + 1, now.getFullYear());
    if (!period) continue;
    items.push({
      frequency: schedule.frequency,
      periodKey: `${schedule.frequency}:${dateKey(now)}`,
      build: async () => {
        const data = await ReportsController.generateSnapshot(period.periodStart, period.periodEnd);
        const message = await ReportsController.buildReportMessage(period, data);
        return { message, payload: { label: period.label, periodStart: period.periodStart, periodEnd: period.periodEnd } };
      },
    });
  }
  for (const slot of DIGEST_SLOTS) {
    if (hhmm(now) < slot.from || hhmm(now) >= slot.until) continue;
    items.push({
      frequency: 'digest',
      periodKey: `digest:${slot.key}:${dateKey(now)}`,
      build: async () => ({ message: await buildDailyDigest(slot.label), payload: { label: `Daily alerts (${slot.label})` } }),
    });
  }
  return items;
}

// Sends one item unless it was already sent. Resolves 'sent', 'already' or
// 'failed' (no row written: the next minute retries).
async function dispatch(item, { db = pool, send = sendWhatsApp } = {}) {
  const { rowCount: done } = await db.query(
    'SELECT 1 FROM report_dispatch_log WHERE frequency = $1 AND period_key = $2',
    [item.frequency, item.periodKey]
  );
  if (done) return 'already';

  const { message, payload } = await item.build();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rowCount: claimed } = await client.query(
      `INSERT INTO report_dispatch_log (frequency, period_key, status, payload)
       VALUES ($1, $2, 'sent', $3) ON CONFLICT (frequency, period_key) DO NOTHING`,
      [item.frequency, item.periodKey, { ...payload, message }]
    );
    if (!claimed) {
      await client.query('ROLLBACK');
      return 'already';
    }
    const result = await send(message);
    if (!result.ok) {
      await client.query('ROLLBACK');
      return { failed: result.error || 'not sent' };
    }
    await client.query('COMMIT');
    return 'sent';
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Last failure per item, so a long n8n outage logs once, not every minute.
const lastFailure = new Map();

async function tick(now = new Date(), opts = {}) {
  for (const item of await dueItems(now, opts.db)) {
    try {
      const outcome = await dispatch(item, opts);
      if (outcome === 'sent') {
        console.log(`✅ Sent ${item.periodKey} to WhatsApp (send-only scheduler)`);
        lastFailure.delete(item.periodKey);
      } else if (outcome !== 'already' && lastFailure.get(item.periodKey) !== outcome.failed) {
        console.error(`❌ ${item.periodKey} not sent, will retry every minute: ${outcome.failed}`);
        lastFailure.set(item.periodKey, outcome.failed);
      }
    } catch (err) {
      console.error(`❌ ${item.periodKey}: ${err.message}`);
    }
  }
}

const startSendOnlyScheduler = () => {
  cron.schedule('* * * * *', () => tick().catch((err) => console.error('❌ Send-only scheduler:', err.message)));
  console.log('✅ Send-only report scheduler started (REPORT_SENDER_MODE=send_only)');
};

module.exports = { startSendOnlyScheduler, tick, dueItems, dispatch };
