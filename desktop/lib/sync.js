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
  constructor({ databaseUrl, serverUrl, token, log, onStatus }) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 2 });
    this.ingestUrl = `${serverUrl.replace(/\/$/, '')}/sync/ingest`;
    this.token = token;
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

        await this.push(rows);
        await this.pool.query('DELETE FROM sync_outbox WHERE id = ANY ($1::bigint[])', [rows.map((r) => r.id)]);
        await this.pool.query('UPDATE sync_state SET last_synced_at = now() WHERE id = 1');
        this.log(`sync: pushed ${rows.length} change(s)`);
        if (rows.length < BATCH_SIZE) break;
      }
      this.lastError = null;
      await this.report('ok');
      return IDLE_INTERVAL_MS;
    } catch (err) {
      const offline = err.offline === true;
      if (!offline || !this.lastError?.offline) {
        this.log(`sync: ${offline ? 'server unreachable' : 'failed'}: ${err.message}`);
      }
      this.lastError = { message: err.message, offline };
      await this.report(offline ? 'offline' : 'error').catch(() => {});
      return RETRY_INTERVAL_MS;
    }
  }

  async push(changes) {
    let res;
    try {
      res = await fetch(this.ingestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sync-Token': this.token },
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
      let detail = '';
      try { detail = (await res.json()).error || ''; } catch { /* not JSON */ }
      // 502/503/504/530 = Cloudflare can't reach the VPS: treat like offline.
      const e = new Error(`server replied ${res.status}${detail ? `: ${detail}` : ''}`);
      e.offline = [502, 503, 504, 530].includes(res.status);
      throw e;
    }
  }

  async report(state) {
    const { rows } = await this.pool.query(
      `SELECT (SELECT count(*)::int FROM sync_outbox) AS pending,
              (SELECT last_synced_at FROM sync_state WHERE id = 1) AS last_synced_at`
    );
    this.onStatus({
      state,
      pending: rows[0].pending,
      lastSyncedAt: rows[0].last_synced_at,
      error: this.lastError?.message || null,
    });
  }
}

module.exports = { SyncWorker };
