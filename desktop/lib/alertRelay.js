// Offline-safe WhatsApp alerts. The backend is unchanged: main.js points its
// N8N_WEBHOOK_URL at this local relay, which stores each alert in
// whatsapp_outbox straight away and forwards it to n8n (on the VPS) whenever
// the internet is up. Alerts held back for a while are marked as delayed;
// very old ones are not sent (stale "low stock" news) but moved, intact, to
// whatsapp_dead (kept 30 days) — nothing unsent is ever just deleted.
//
// status() tells the factory status bar (T1.5) how sending is going:
//   ok            — sending, or nothing to send
//   no_target     — the server hasn't given a WhatsApp target (GET /sync/config)
//   n8n_rejecting — n8n answered with an error (e.g. Meta refused the number);
//                   its reply is kept in lastError
//   offline       — n8n can't be reached
const http = require('http');
const crypto = require('crypto');
const { Pool } = require('pg');
const { ALERT_PORT } = require('./ports');

const SEND_INTERVAL_MS = 30_000;
const DELAYED_AFTER_MS = 10 * 60_000;
const EXPIRE_AFTER_MS = 48 * 3600_000;
const DEAD_KEPT_DAYS = 30;
const NO_TARGET_LOG_MS = 5 * 60_000;
// Cloudflare's "can't reach the origin" codes: n8n is unreachable, not refusing.
const UNREACHABLE_STATUSES = [502, 503, 504, 530];

class AlertRelay {
  // getTarget() -> { url, secret } | null, read on every send so config
  // refreshed from the server takes effect without a restart.
  // expireAfterMs: only lowered for testing the expiry (T1.6 check 4).
  // getNoTargetReason() -> why there is no target (the server's reason, T1.7).
  constructor({ databaseUrl, relaySecret, getTarget, getNoTargetReason = () => null, log, expireAfterMs = EXPIRE_AFTER_MS }) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 2 });
    this.relaySecret = relaySecret;
    this.getTarget = getTarget;
    this.getNoTargetReason = getNoTargetReason;
    this.log = log;
    this.expireAfterMs = expireAfterMs;
    this.server = null;
    this.timer = null;
    this.sending = null;
    this.state = 'ok';
    this.lastError = null;       // n8n's reply (first 500 chars) or the network error
    this.noTargetLoggedAt = 0;
  }

  setState(state, error = null) {
    if (state !== this.state) {
      const detail = error ? `: ${error}` : '';
      this.log(`${state === 'ok' ? '' : 'ERROR '}alerts: WhatsApp sending ${this.state} -> ${state}${detail}`);
    }
    this.state = state;
    this.lastError = error;
  }

  // For the status bar and the heartbeat (T1.5).
  async status() {
    const { rows: [r] } = await this.pool.query(
      `SELECT count(*)::int AS queued,
              COALESCE(EXTRACT(EPOCH FROM now() - min(created_at)), 0)::int AS oldest_age_sec,
              (SELECT count(*)::int FROM whatsapp_dead) AS dead
         FROM whatsapp_outbox`
    );
    return {
      relayState: this.state,
      relayError: this.lastError,
      whatsappQueued: r.queued,
      oldestWhatsappAge: r.oldest_age_sec,
      whatsappDead: r.dead,
    };
  }

  async start() {
    // Local bookkeeping table: excluded from sync (syncCapture.EXCLUDED_TABLES).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS public.whatsapp_outbox (
        id         bigserial PRIMARY KEY,
        message    text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    // Alerts that expired unsent, kept DEAD_KEPT_DAYS for the record.
    // Also local only (syncCapture.EXCLUDED_TABLES).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS public.whatsapp_dead (
        id         bigint PRIMARY KEY,      -- its whatsapp_outbox id
        message    text NOT NULL,
        created_at timestamptz NOT NULL,
        expired_at timestamptz NOT NULL DEFAULT now(),
        last_error text                     -- why it never went, if known
      )`);

    this.server = http.createServer((req, res) => this.receive(req, res));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(ALERT_PORT, '127.0.0.1', resolve);
    });
    this.timer = setInterval(() => this.flush(), SEND_INTERVAL_MS);
    this.flush();
  }

  async stop() {
    clearInterval(this.timer);
    if (this.server) await new Promise((resolve) => this.server.close(resolve));
    if (this.sending) await this.sending.catch(() => {});
    await this.pool.end();
  }

  receive(req, res) {
    const reply = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'POST' || !['/alert', '/test'].includes(req.url)) return reply(404, { error: 'not found' });

    const given = Buffer.from(req.headers['x-fms-secret'] || '');
    const want = Buffer.from(this.relaySecret);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return reply(403, { error: 'forbidden' });

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { message } = JSON.parse(body);
        if (typeof message !== 'string' || !message) return reply(400, { error: 'message required' });
        if (req.url === '/test') return reply(200, await this.sendTest(message));
        await this.pool.query('INSERT INTO whatsapp_outbox (message) VALUES ($1)', [message]);
        reply(200, { queued: true });
        this.flush();
      } catch (err) {
        this.log(`alerts: could not queue: ${err.message}`);
        reply(500, { error: err.message });
      }
    });
  }

  // "Send test WhatsApp" (T1.8): one message straight to n8n, never queued,
  // and the real outcome — the server's reason when there's no target,
  // n8n's reply (Meta's error) when it refuses.
  async sendTest(message) {
    const target = this.getTarget();
    if (!target) {
      const reason = this.getNoTargetReason() || 'no WhatsApp target from the server';
      this.setState('no_target', reason);
      return { ok: false, result: 'no_target', detail: reason };
    }
    let res;
    try {
      res = await fetch(target.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-FMS-Secret': target.secret },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const cause = err.cause?.code || err.cause?.errors?.[0]?.code || err.cause?.message;
      this.setState('offline', cause || err.message);
      return { ok: false, result: 'offline', detail: `could not reach n8n (${cause || err.message})` };
    }
    const text = (await res.text().catch(() => '')).slice(0, 500);
    this.log(`alerts: test message -> n8n replied ${res.status}${text ? `: ${text}` : ''}`);
    // A test is a real send, so it updates the state the status bar shows.
    if (!res.ok) {
      const offline = UNREACHABLE_STATUSES.includes(res.status);
      this.setState(offline ? 'offline' : 'n8n_rejecting', `n8n replied ${res.status}${text ? `: ${text}` : ''}`);
      return { ok: false, result: offline ? 'offline' : 'rejected', status: res.status, detail: text || `n8n replied ${res.status}` };
    }
    this.setState('ok');
    return { ok: true, result: 'sent', status: res.status, detail: text };
  }

  flush() {
    if (this.sending) return;
    this.sending = this.sendQueued().finally(() => { this.sending = null; });
  }

  // Too old to be worth sending: moved, in one statement, to whatsapp_dead —
  // the delete and the insert commit together or not at all.
  async expireOld() {
    const moved = await this.pool.query(
      `WITH expired AS (
         DELETE FROM whatsapp_outbox WHERE created_at < now() - $1::interval
         RETURNING id, message, created_at
       )
       INSERT INTO whatsapp_dead (id, message, created_at, last_error)
       SELECT id, message, created_at, $2 FROM expired
       ON CONFLICT (id) DO NOTHING`,
      [`${Math.round(this.expireAfterMs / 1000)} seconds`, this.lastError || (this.state === 'ok' ? null : this.state)]
    );
    if (moved.rowCount) {
      this.log(`ERROR alerts: ${moved.rowCount} WhatsApp alert(s) were never sent in time and moved to whatsapp_dead (state ${this.state})`);
    }
    await this.pool.query(`DELETE FROM whatsapp_dead WHERE expired_at < now() - interval '${DEAD_KEPT_DAYS} days'`);
  }

  async sendQueued() {
    await this.expireOld();

    const target = this.getTarget();
    if (!target) {
      // The server hasn't given a target yet: keep everything queued, and
      // say so loudly but not every 30 s.
      this.setState('no_target', this.getNoTargetReason() || 'no WhatsApp target from the server');
      if (Date.now() - this.noTargetLoggedAt >= NO_TARGET_LOG_MS) {
        const { rows: [{ n }] } = await this.pool.query('SELECT count(*)::int AS n FROM whatsapp_outbox');
        this.log(`ERROR alerts: no WhatsApp target configured on the server; ${n} alert(s) queued, not sent`);
        this.noTargetLoggedAt = Date.now();
      }
      return;
    }
    this.noTargetLoggedAt = 0;

    const { rows } = await this.pool.query('SELECT id, message, created_at FROM whatsapp_outbox ORDER BY id LIMIT 20');
    for (const row of rows) {
      const age = Date.now() - new Date(row.created_at).getTime();
      const message = age > DELAYED_AFTER_MS
        ? `(Delayed: from ${new Date(row.created_at).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })}, sent when the factory PC came online)\n${row.message}`
        : row.message;
      let res;
      try {
        res = await fetch(target.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-FMS-Secret': target.secret },
          body: JSON.stringify({ message }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (err) {
        // No internet / DNS / timeout: stop here, keep order, retry next round.
        const cause = err.cause?.code || err.cause?.errors?.[0]?.code || err.cause?.message;
        this.setState('offline', cause || err.message);
        return;
      }
      if (!res.ok) {
        // Keep it queued either way. A refusal (e.g. Meta rejecting the
        // number) shows its reply in the status instead of only in a log.
        const body = (await res.text().catch(() => '')).slice(0, 500);
        const detail = `n8n replied ${res.status}${body ? `: ${body}` : ''}`;
        this.setState(UNREACHABLE_STATUSES.includes(res.status) ? 'offline' : 'n8n_rejecting', detail);
        return;
      }
      // Delivered to n8n: the only path that removes a queued alert without
      // moving it to whatsapp_dead.
      await this.pool.query('DELETE FROM whatsapp_outbox WHERE id = $1', [row.id]);
      this.setState('ok');
      this.log('alerts: sent 1 WhatsApp alert');
    }
    if (rows.length === 0) this.setState('ok');
  }
}

module.exports = { AlertRelay };
