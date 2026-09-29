// Offline-safe WhatsApp alerts. The backend is unchanged: main.js points its
// N8N_WEBHOOK_URL at this local relay, which stores each alert in
// whatsapp_outbox straight away and forwards it to n8n (on the VPS) whenever
// the internet is up. Alerts held back for a while are marked as delayed;
// very old ones are dropped rather than sending stale "low stock" news.
const http = require('http');
const crypto = require('crypto');
const { Pool } = require('pg');
const { ALERT_PORT } = require('./ports');

const SEND_INTERVAL_MS = 30_000;
const DELAYED_AFTER_MS = 10 * 60_000;
const DROP_AFTER_MS = 48 * 3600_000;

class AlertRelay {
  // getTarget() -> { url, secret } | null, read on every send so config
  // refreshed from the server takes effect without a restart.
  constructor({ databaseUrl, relaySecret, getTarget, log }) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 2 });
    this.relaySecret = relaySecret;
    this.getTarget = getTarget;
    this.log = log;
    this.server = null;
    this.timer = null;
    this.sending = null;
  }

  async start() {
    // Local bookkeeping table: excluded from sync (syncCapture.EXCLUDED_TABLES).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS public.whatsapp_outbox (
        id         bigserial PRIMARY KEY,
        message    text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
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
    if (req.method !== 'POST' || req.url !== '/alert') return reply(404, { error: 'not found' });

    const given = Buffer.from(req.headers['x-fms-secret'] || '');
    const want = Buffer.from(this.relaySecret);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return reply(403, { error: 'forbidden' });

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { message } = JSON.parse(body);
        if (typeof message !== 'string' || !message) return reply(400, { error: 'message required' });
        await this.pool.query('INSERT INTO whatsapp_outbox (message) VALUES ($1)', [message]);
        reply(200, { queued: true });
        this.flush();
      } catch (err) {
        this.log(`alerts: could not queue: ${err.message}`);
        reply(500, { error: err.message });
      }
    });
  }

  flush() {
    if (this.sending) return;
    this.sending = this.sendQueued().finally(() => { this.sending = null; });
  }

  async sendQueued() {
    const target = this.getTarget();
    if (!target) return; // server hasn't told us where to send yet; keep queued

    const dropped = await this.pool.query(
      `DELETE FROM whatsapp_outbox WHERE created_at < now() - $1::interval`,
      [`${DROP_AFTER_MS / 1000} seconds`]
    );
    if (dropped.rowCount) this.log(`alerts: dropped ${dropped.rowCount} alert(s) older than 48 h`);

    const { rows } = await this.pool.query('SELECT id, message, created_at FROM whatsapp_outbox ORDER BY id LIMIT 20');
    for (const row of rows) {
      const age = Date.now() - new Date(row.created_at).getTime();
      const message = age > DELAYED_AFTER_MS
        ? `(Delayed: from ${new Date(row.created_at).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })}, sent when the factory PC came online)\n${row.message}`
        : row.message;
      try {
        const res = await fetch(target.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-FMS-Secret': target.secret },
          body: JSON.stringify({ message }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`n8n replied ${res.status}`);
      } catch (err) {
        // Offline or n8n down: stop here, keep order, try again next round.
        if (!this.lastFailed) this.log(`alerts: sending paused (${err.cause?.code || err.message}), will retry`);
        this.lastFailed = true;
        return;
      }
      this.lastFailed = false;
      await this.pool.query('DELETE FROM whatsapp_outbox WHERE id = $1', [row.id]);
      this.log('alerts: sent 1 WhatsApp alert');
    }
  }
}

module.exports = { AlertRelay };
