const pool = require('../db/pool');

// What the online server knows about the main factory PC (T1.5): when it was
// last heard from — a heartbeat (every minute) or an upload — and the counts
// from its last heartbeat. Used by the online status bar and Offline Setup.

const GREEN_UNDER_MS = 2 * 60 * 1000;
const RED_FROM_MS = 30 * 60 * 1000;

async function getFactoryStatus(db = pool) {
  const { rows: [r] } = await db.query(
    `SELECT w.writer_id, w.last_ingest_at, h.received_at AS heartbeat_at,
            h.outbox_count, h.oldest_outbox_age_sec, h.quarantine_count,
            h.whatsapp_state, h.whatsapp_oldest_age_sec, h.sync_state
       FROM sync_writer w
       LEFT JOIN sync_heartbeat h ON h.id = 1
      WHERE w.id = 1`
  );
  if (!r?.writer_id) return { registered: false, level: 'red', lastSeenAt: null };
  const times = [r.last_ingest_at, r.heartbeat_at].filter(Boolean).map((t) => new Date(t).getTime());
  const lastSeen = times.length ? Math.max(...times) : null;
  const age = lastSeen === null ? Infinity : Date.now() - lastSeen;
  return {
    registered: true,
    lastSeenAt: lastSeen === null ? null : new Date(lastSeen).toISOString(),
    lastUploadAt: r.last_ingest_at,
    level: age < GREEN_UNDER_MS ? 'green' : age < RED_FROM_MS ? 'amber' : 'red',
    heartbeat: r.heartbeat_at
      ? {
          receivedAt: r.heartbeat_at,
          syncState: r.sync_state,
          outboxCount: r.outbox_count,
          oldestOutboxAgeSec: r.oldest_outbox_age_sec,
          quarantineCount: r.quarantine_count,
          whatsappState: r.whatsapp_state,
          whatsappOldestAgeSec: r.whatsapp_oldest_age_sec,
        }
      : null,
  };
}

module.exports = { getFactoryStatus, GREEN_UNDER_MS };
