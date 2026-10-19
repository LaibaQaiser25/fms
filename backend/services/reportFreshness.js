const pool = require('../db/pool');

// How current the online copy is, for messages the online server sends
// (T2.3, D9). Its data comes only from the factory, so a report built here is
// only as fresh as the factory's last upload.
//
// "Data as of" is the last upload, or the last heartbeat that said nothing
// was waiting — a factory with no new changes is still up to date even
// though it uploaded nothing.

const STALE_AFTER_MS = 2 * 3600 * 1000;
// Heartbeats come every minute: within this, the copy counts as complete.
const COMPLETE_WITHIN_MS = 10 * 60 * 1000;

async function getDataAsOf(db = pool) {
  const { rows: [r] } = await db.query(
    `SELECT w.last_ingest_at,
            CASE WHEN h.outbox_count = 0 THEN h.received_at END AS caught_up_at
       FROM sync_writer w LEFT JOIN sync_heartbeat h ON h.id = 1
      WHERE w.id = 1`
  );
  const times = [r?.last_ingest_at, r?.caught_up_at].filter(Boolean).map((t) => new Date(t).getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

const formatTime = (d) => d.toLocaleString('en-PK', {
  day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
});

function formatDuration(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 120) return `${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} days`;
}

// Wraps a message: a stale-data warning first if the factory hasn't
// uploaded for more than 2 h, "period incomplete" if the copy stops before
// the end of the report's period (periodEnd 'YYYY-MM-DD', reports only), and
// always "data as of" last.
function withFreshness(message, { dataAsOf, now = new Date(), periodEnd = null }) {
  let prefix = '';
  let suffix = '';
  if (!dataAsOf) {
    prefix = '⚠️ *No upload from the factory yet* — these figures may be out of date.\n\n';
  } else if (now - dataAsOf > STALE_AFTER_MS) {
    prefix = `⚠️ *Old data:* the factory has not uploaded for ${formatDuration(now - dataAsOf)}.\n\n`;
  }
  if (periodEnd && dataAsOf) {
    const [y, m, d] = periodEnd.split('-').map(Number);
    const cutoff = Math.min(new Date(y, m - 1, d + 1).getTime(), now.getTime());
    if (dataAsOf.getTime() < cutoff - COMPLETE_WITHIN_MS) {
      suffix += `\n\n⚠️ *Period incomplete:* anything entered at the factory after ${formatTime(dataAsOf)} is not included.`;
    }
  }
  suffix += `\n\n_Data as of ${dataAsOf ? formatTime(dataAsOf) : 'no upload yet'}_`;
  return prefix + message + suffix;
}

module.exports = { getDataAsOf, withFreshness, STALE_AFTER_MS };
