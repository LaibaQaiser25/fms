const pool = require('../db/pool');

// GET /sync/health (T2.4): what the n8n watchdog (n8n/fms-sync-watchdog.json)
// checks every 10 minutes. The alert rules live here, not in n8n, so they are
// covered by desktop/test and n8n only has to send what this returns.
//
// A missing or old heartbeat means the main factory PC is switched off. That
// is normal (nights, holidays), so it never raises an alert by itself: every
// rule below needs a RECENT heartbeat.

// The PC sends one every minute; a few missed ones are still "on".
const HEARTBEAT_RECENT_SEC = 5 * 60;

const RULES = [
  {
    key: 'outbox_backlog',
    when: (h) => h.oldest_outbox_age_sec > 30 * 60,
    say: (h) => `${h.outbox_count} change(s) have been waiting to upload for ${minutes(h.oldest_outbox_age_sec)}`,
  },
  {
    key: 'quarantine',
    when: (h) => h.quarantine_count > 0,
    say: (h) => `${h.quarantine_count} change(s) were refused by the online server — open Sync issues on the factory PC`,
  },
  {
    key: 'whatsapp_state',
    when: (h) => h.whatsapp_state != null && h.whatsapp_state !== 'ok',
    say: (h) => `WhatsApp alerts are not going out from the factory (${h.whatsapp_state})`,
  },
  {
    key: 'whatsapp_backlog',
    when: (h) => h.whatsapp_oldest_age_sec > 60 * 60,
    say: (h) => `The oldest unsent WhatsApp alert is ${minutes(h.whatsapp_oldest_age_sec)} old`,
  },
  {
    // Rarely reaches this server: a replaced PC's heartbeat is refused
    // (requireSyncWriter). Kept for a PC whose own key check fails later.
    key: 'not_writer',
    when: (h) => h.sync_state === 'blocked_not_writer',
    say: () => 'The factory PC says it is no longer the registered main PC — nothing is uploading',
  },
];

function minutes(sec) {
  const m = Math.round(sec / 60);
  return m < 120 ? `${m} min` : `${Math.round(m / 60)} h`;
}

// Pure, for the tests: the alerts for one heartbeat row (or none).
function alertsFor(heartbeat, nowMs = Date.now()) {
  if (!heartbeat) return { heartbeatRecent: false, alerts: [] };
  const ageSec = (nowMs - new Date(heartbeat.received_at).getTime()) / 1000;
  if (ageSec > HEARTBEAT_RECENT_SEC) return { heartbeatRecent: false, alerts: [] };
  return {
    heartbeatRecent: true,
    alerts: RULES.filter((r) => r.when(heartbeat)).map((r) => ({ key: r.key, message: r.say(heartbeat) })),
  };
}

async function getSyncHealth(db = pool) {
  const { rows: [r] } = await db.query(
    `SELECT w.writer_id, w.last_ingest_at,
            (SELECT count(*)::int FROM sync_rejected WHERE resolved_at IS NULL) AS rejected_open,
            to_jsonb(h) AS heartbeat
       FROM sync_writer w
       LEFT JOIN sync_heartbeat h ON h.id = 1
      WHERE w.id = 1`
  );
  const heartbeat = r?.heartbeat || null;
  const { heartbeatRecent, alerts } = alertsFor(heartbeat);
  return {
    last_ingest_at: r?.last_ingest_at || null,
    writer_registered: Boolean(r?.writer_id),
    rejectedOpenCount: r?.rejected_open || 0,
    heartbeat,
    heartbeat_recent: heartbeatRecent,
    alerts,
  };
}

module.exports = { getSyncHealth, alertsFor, HEARTBEAT_RECENT_SEC };
