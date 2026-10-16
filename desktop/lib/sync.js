// Pushes sync_outbox (see syncCapture.js) to the VPS's POST /sync/ingest, in
// outbox order, whenever it can reach the server. One-way: the factory is the
// only writer, so there is nothing to pull back and nothing to merge.
//
// Delivery is at-least-once: if the VPS applied a batch but the reply got
// lost, the same batch is re-sent. That's safe because the VPS applies every
// change as an upsert-by-primary-key or delete-by-primary-key.
const { Pool } = require('pg');

const BATCH_SIZE = 500;
const IDLE_INTERVAL_MS = 15_000;   // nothing waiting / last attempt fine
const RETRY_INTERVAL_MS = 30_000;  // offline or server error
const REQUEST_TIMEOUT_MS = 60_000;

class SyncWorker {
  constructor({ databaseUrl, serverUrl, uploadKey, log, onStatus }) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 2 });
    this.ingestUrl = `${serverUrl.replace(/\/$/, '')}/sync/ingest`;
    this.uploadKey = uploadKey;
    this.log = log;
    this.onStatus = onStatus;
    this.timer = null;
    this.running = null;
    this.stopped = false;
    this.lastError = null;
  }

  start() {
    this.schedule(0);
  }

  // Run a round now (e.g. the user clicked "Sync now"); no-op if one is running.
  kick() {
    if (this.running || this.stopped) return;
    clearTimeout(this.timer);
    this.schedule(0);
  }

  schedule(ms) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.round()
        .then((next) => this.schedule(next))
        .finally(() => { this.running = null; });
    }, ms);
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.running) await this.running.catch(() => {});
    await this.pool.end();
  }

  // Returns how long to wait before the next round.
  async round() {
    try {
      for (;;) {
        // Only rows from transactions older than every in-progress one:
        // those are all committed (rolled-back rows are invisible anyway),
        // so no gap can appear behind what's been sent.
        const { rows } = await this.pool.query(
          `SELECT id, table_name, op, row_data
             FROM sync_outbox
            WHERE txid < pg_snapshot_xmin(pg_current_snapshot())
            ORDER BY id
            LIMIT $1`,
          [BATCH_SIZE]
        );
        if (rows.length === 0) break;

        const reply = await this.push(rows);
        const done = await this.settle(rows, reply);
        // Nothing settled (a reply that names none of the ids): stop rather
        // than send the same batch again in a tight loop.
        if (done === 0 || rows.length < BATCH_SIZE) break;
      }
      this.lastError = null;
      await this.report('ok');
      return IDLE_INTERVAL_MS;
    } catch (err) {
      // Another PC was registered as the main PC (or this one never was):
      // nothing this PC sends will be accepted again, so stop trying. Its
      // changes stay in sync_outbox.
      if (err.notWriter) {
        this.stopped = true;
        this.lastError = { message: err.message, offline: false };
        this.log(`sync: stopped — ${err.message}`);
        await this.report('blocked_not_writer').catch(() => {});
        return null;
      }
      const offline = err.offline === true;
      if (!offline || !this.lastError?.offline) {
        this.log(`sync: ${offline ? 'server unreachable' : 'failed'}: ${err.message}`);
      }
      this.lastError = { message: err.message, offline };
      await this.report(offline ? 'offline' : 'error').catch(() => {});
      return RETRY_INTERVAL_MS;
    }
  }

  // After a 2xx: in one local transaction, quarantine the changes the VPS set
  // aside (sync_quarantine), drop accepted + rejected from the outbox, and
  // note the time. Returns how many outbox rows were settled.
  async settle(rows, reply) {
    const sentIds = rows.map((r) => String(r.id));
    // A reply without the lists (a server from before T1.3) accepted everything.
    const accepted = Array.isArray(reply?.accepted) ? reply.accepted.map(String) : sentIds;
    const rejected = Array.isArray(reply?.rejected) ? reply.rejected : [];
    const byId = new Map(rows.map((r) => [String(r.id), r]));

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of rejected) {
        const change = byId.get(String(r.id));
        if (!change) continue;
        await client.query(
          `INSERT INTO sync_quarantine (outbox_id, table_name, op, row_data, code, constraint_name, detail)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [change.id, change.table_name, change.op, change.row_data, r.code || null, r.constraint || null, r.detail || null]
        );
        this.log(`sync: the server refused ${change.op} ${change.table_name} (outbox ${change.id}): ${r.code} ${r.constraint || ''} ${r.detail || ''} — set aside, see Sync issues`);
      }
      const settled = [...new Set([...accepted, ...rejected.map((r) => String(r.id))])].filter((id) => byId.has(id));
      await client.query('DELETE FROM sync_outbox WHERE id = ANY ($1::bigint[])', [settled]);
      await client.query('UPDATE sync_state SET last_synced_at = now() WHERE id = 1');
      await client.query('COMMIT');
      this.log(`sync: pushed ${settled.length} change(s)${rejected.length ? `, ${rejected.length} set aside` : ''}`);
      return settled.length;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async push(changes) {
    let res;
    try {
      res = await fetch(this.ingestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Upload-Key': this.uploadKey },
        body: JSON.stringify({ changes }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // DNS failure, no route, timeout: normal "no internet" — not a bug.
      const e = new Error(err.cause?.code || err.message);
      e.offline = true;
      throw e;
    }
    if (!res.ok) {
      let body = {};
      try { body = await res.json(); } catch { /* not JSON */ }
      const detail = body.error || '';
      // 502/503/504/530 = Cloudflare can't reach the VPS: treat like offline.
      const e = new Error(`server replied ${res.status}${detail ? `: ${detail}` : ''}`);
      e.offline = [502, 503, 504, 530].includes(res.status);
      e.notWriter = res.status === 403 && body.code === 'WriterNotRegistered';
      throw e;
    }
    try { return await res.json(); } catch { return null; }
  }

  async report(state) {
    const { rows } = await this.pool.query(
      `SELECT (SELECT count(*)::int FROM sync_outbox) AS pending,
              (SELECT count(*)::int FROM sync_quarantine WHERE resolved_at IS NULL) AS quarantined,
              (SELECT last_synced_at FROM sync_state WHERE id = 1) AS last_synced_at`
    );
    this.onStatus({
      state,
      pending: rows[0].pending,
      quarantined: rows[0].quarantined,
      lastSyncedAt: rows[0].last_synced_at,
      error: this.lastError?.message || null,
    });
  }
}

module.exports = { SyncWorker };
