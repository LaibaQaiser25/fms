// One picture of how the factory PC's uploads and WhatsApp alerts are doing
// (SYNC-HARDENING-PLAN.md T1.5). Built where the live sync and relay state
// are (the Electron main process today); StatusReporter writes it to
// status.json (served by the backend at GET /status, backend/routes/
// factoryLocal.js, for the status bar on every terminal) and sends the counts
// to the VPS every minute (POST /sync/heartbeat).

const fs = require('fs');
const { Pool } = require('pg');

const BACKLOG_AMBER_SEC = 5 * 60;

// sync: { state, error } from SyncWorker's last report, or
//   { state: 'not_registered' } when this PC has no upload key.
// relay: an AlertRelay (status() -> relayState etc.), or null.
async function collectStatus({ pool, sync, relay, tablesWithoutPk = [] }) {
  const { rows: [db] } = await pool.query(
    `SELECT (SELECT count(*)::int FROM sync_outbox) AS outbox_count,
            (SELECT COALESCE(EXTRACT(EPOCH FROM now() - min(created_at)), 0)::int FROM sync_outbox) AS oldest_outbox_age,
            (SELECT count(*)::int FROM sync_quarantine WHERE resolved_at IS NULL) AS quarantine_count,
            (SELECT last_synced_at FROM sync_state WHERE id = 1) AS last_synced_at`
  );
  const wa = relay ? await relay.status() : null;

  const status = {
    state: sync?.state || 'starting',
    error: sync?.error || null,
    lastSyncedAt: db.last_synced_at,
    outboxCount: db.outbox_count,
    oldestOutboxAge: db.oldest_outbox_age,
    quarantineCount: db.quarantine_count,
    relayState: wa?.relayState || null,
    relayError: wa?.relayError || null,
    whatsappQueued: wa?.whatsappQueued ?? null,
    oldestWhatsappAge: wa?.oldestWhatsappAge ?? null,
    tablesWithoutPk,
    generatedAt: new Date().toISOString(),
  };
  return { ...status, ...levelOf(status) };
}

// green / amber / red, plus the reasons in plain words (most serious first).
function levelOf(s) {
  const red = [];
  const amber = [];
  if (s.state === 'blocked_not_writer') red.push('This PC is no longer the registered main PC — nothing is uploaded');
  if (s.state === 'not_registered') red.push('This PC is not set up to upload to the online server');
  if (s.state === 'error') red.push(`Upload problem: ${s.error || 'see the log'}`);
  if (s.quarantineCount > 0) {
    red.push(`${s.quarantineCount} change${s.quarantineCount === 1 ? ' was' : 's were'} refused by the online server — see Sync issues`);
  }
  if (s.tablesWithoutPk.length) red.push(`Not uploaded at all (no primary key): ${s.tablesWithoutPk.join(', ')}`);
  if (s.outboxCount > 0 && s.oldestOutboxAge > BACKLOG_AMBER_SEC) {
    amber.push(s.state === 'offline' ? 'No internet — changes are waiting' : 'Changes have been waiting more than 5 minutes');
  }
  // Alerts piling up behind a WhatsApp problem: worth seeing, not an upload fault.
  if (s.relayState && s.relayState !== 'ok' && s.whatsappQueued > 0) {
    const why = { no_target: 'no WhatsApp number set up on the server', n8n_rejecting: 'refused by WhatsApp', offline: 'no internet' }[s.relayState];
    amber.push(`${s.whatsappQueued} WhatsApp alert${s.whatsappQueued === 1 ? '' : 's'} not sent (${why || s.relayState})`);
  }
  return { level: red.length ? 'red' : amber.length ? 'amber' : 'green', problems: [...red, ...amber] };
}

// Keeps status.json current and sends the heartbeat. Plain Node (no
// Electron), so a later headless host (T3.1) can run it too.
//   getSync() -> SyncWorker's last report, or { state: 'not_registered' }
//   upload: { serverUrl, uploadKey } or null (not registered: no heartbeat)
//   onNotWriter(message): the heartbeat was refused because another PC is now
//     the registered main PC — so even an idle PC finds out within a minute
class StatusReporter {
  constructor({ databaseUrl, statusFile, getSync, relay, tablesWithoutPk, upload, log,
    onNotWriter = () => {}, intervalMs = 15_000, heartbeatMs = 60_000 }) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 1 });
    Object.assign(this, { statusFile, getSync, relay, tablesWithoutPk, upload, log, onNotWriter, intervalMs, heartbeatMs });
    this.last = null;
    this.timers = [];
    this.heartbeatFailing = false;
    this.stopped = false;
  }

  start() {
    this.refresh();
    this.timers.push(setInterval(() => this.refresh(), this.intervalMs));
    if (this.upload) this.timers.push(setInterval(() => this.sendHeartbeat(), this.heartbeatMs));
  }

  async stop() {
    this.stopped = true;
    this.timers.forEach(clearInterval);
    await this.pool.end().catch(() => {});
  }

  // Rebuilds status.json (atomically: write, then rename over the old one).
  async refresh() {
    if (this.stopped) return;
    try {
      this.last = await collectStatus({
        pool: this.pool, sync: this.getSync(), relay: this.relay, tablesWithoutPk: this.tablesWithoutPk,
      });
      const tmp = `${this.statusFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.last));
      fs.renameSync(tmp, this.statusFile);
    } catch (err) {
      this.log(`status: could not refresh (${err.message})`);
    }
  }

  // Tells the VPS this PC is alive and how far behind it is, so the online
  // dashboard can say "Factory last updated X min ago" even when nothing
  // changes here. Skipped once this PC has been replaced.
  async sendHeartbeat() {
    const s = this.last;
    if (!s || this.stopped || s.state === 'blocked_not_writer') return;
    try {
      const res = await fetch(`${this.upload.serverUrl.replace(/\/$/, '')}/sync/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Upload-Key': this.upload.uploadKey },
        body: JSON.stringify({
          sync_state: s.state,
          outbox_count: s.outboxCount,
          oldest_outbox_age_sec: s.oldestOutboxAge,
          quarantine_count: s.quarantineCount,
          whatsapp_state: s.relayState,
          whatsapp_oldest_age_sec: s.oldestWhatsappAge,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        let body = {};
        try { body = await res.json(); } catch { /* not JSON */ }
        if (res.status === 403 && body.code === 'WriterNotRegistered') {
          await this.onNotWriter(body.error || 'this PC is no longer the registered main PC');
          await this.refresh();
          return;
        }
        throw new Error(`server replied ${res.status}`);
      }
      if (this.heartbeatFailing) this.log('heartbeat: sending again');
      this.heartbeatFailing = false;
    } catch (err) {
      if (!this.heartbeatFailing) this.log(`heartbeat: not sent (${err.cause?.code || err.message}), will keep trying`);
      this.heartbeatFailing = true;
    }
  }
}

module.exports = { collectStatus, levelOf, StatusReporter, BACKLOG_AMBER_SEC };
