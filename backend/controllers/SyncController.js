const crypto = require('crypto');
const pool = require('../db/pool');
const { NOT_WRITER, hashSetupCode, hashUploadKey, uploadKeyHashFrom } = require('../services/syncWriter');
const { getSetup } = require('../services/offlineSetup');

// Receives changes from the factory desktop app (desktop/lib/sync.js). The
// factory is the single writer; this server just mirrors its rows.
//
// Each change is { table_name, op: 'I'|'U'|'D', row_data } in the order the
// factory made them. I/U = upsert the full row by primary key, D = delete by
// primary key — so re-sending a batch (lost reply) is harmless.

class SchemaMismatch extends Error {}
class NotWriter extends Error {}

// Tables ingest refuses to write: the factory never sends these, and must not
// be able to. Every VPS-only table is here too (SYNC-HARDENING-PLAN.md §4).
const PROTECTED_TABLES = new Set(['pgmigrations', 'sync_writer', 'setup_code', 'offline_setup', 'sync_rejected', 'sync_heartbeat']);
// Server bookkeeping that is never copied to a factory by the snapshot.
const VPS_ONLY_TABLES = new Set(['sync_writer', 'setup_code', 'offline_setup', 'sync_rejected', 'sync_heartbeat']);

// The snapshot hands out every business table (password hashes included), so
// only the PC that registered within the last hour may take it.
const SNAPSHOT_WINDOW_MS = 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadTables(client) {
  const { rows } = await client.query(
    `SELECT c.relname AS table_name,
            (SELECT array_agg(a.attname::text) FROM pg_attribute a
              WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns,
            (SELECT array_agg(a.attname::text ORDER BY array_position(i.indkey, a.attnum))
               FROM pg_index i JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
              WHERE i.indrelid = c.oid AND i.indisprimary) AS pk
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`
  );
  const tables = new Map();
  for (const r of rows) {
    if (PROTECTED_TABLES.has(r.table_name) || !r.pk) continue;
    tables.set(r.table_name, { columns: new Set(r.columns), pk: r.pk });
  }
  return tables;
}

// Every check that doesn't need the data: unknown table/column/op, missing
// primary key. Any failure means this server is behind on migrations (or the
// batch is malformed), so the whole batch is refused before anything runs.
function validateChange(change, tables) {
  const { table_name: tableName, op, row_data: row } = change || {};
  const table = tables.get(tableName);
  if (!table) throw new SchemaMismatch(`unknown table "${tableName}" — deploy the latest backend to the server`);
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new SchemaMismatch(`bad row for ${tableName}`);
  if (!['I', 'U', 'D'].includes(op)) throw new SchemaMismatch(`unknown op "${op}"`);

  const unknown = Object.keys(row).filter((c) => !table.columns.has(c));
  if (unknown.length) {
    throw new SchemaMismatch(`column(s) ${unknown.join(', ')} missing on ${tableName} — deploy the latest backend to the server`);
  }
  const missingPk = table.pk.filter((c) => !(c in row));
  if (missingPk.length) throw new SchemaMismatch(`primary key ${missingPk.join(', ')} missing for ${tableName}`);
}

// Just the primary key columns of a row, e.g. { id: 7 }.
const pkOf = (row, table) => Object.fromEntries(table.pk.map((c) => [c, row[c]]));

// I/U = upsert the full row by primary key, D = delete by primary key.
async function applyChange(client, { tableName, op, row }, table) {
  const q = (name) => client.escapeIdentifier(name);
  // jsonb_populate_record casts every value to the column's real type.
  const t = `public.${q(tableName)}`;
  const src = `jsonb_populate_record(NULL::${t}, $1::jsonb)`;
  const pkList = table.pk.map(q).join(', ');

  if (op === 'D') {
    await client.query(`DELETE FROM ${t} WHERE (${pkList}) = (SELECT ${pkList} FROM ${src})`, [row]);
    return;
  }
  const cols = Object.keys(row);
  const colList = cols.map(q).join(', ');
  const updates = cols.filter((c) => !table.pk.includes(c)).map((c) => `${q(c)} = EXCLUDED.${q(c)}`);
  await client.query(
    `INSERT INTO ${t} (${colList}) SELECT ${colList} FROM ${src}
     ON CONFLICT (${pkList}) DO ${updates.length ? `UPDATE SET ${updates.join(', ')}` : 'NOTHING'}`,
    [row]
  );
}

// Errors that are about this one row's data (class 22: a value that doesn't
// fit; class 23: integrity), as opposed to the server being broken.
const isRowError = (err) => typeof err.code === 'string' && /^(22|23)/.test(err.code);

class SyncController {
  // Settings the factory app needs but shouldn't have to be typed in there:
  // where to send WhatsApp alerts (n8n's PUBLIC webhook — the backend's own
  // N8N_WEBHOOK_URL is a Docker-internal hostname) and its shared secret.
  // Fetched by desktop/main.js at startup and hourly — which is also how a
  // new setup name or logo from Offline Setup reaches the main PC.
  static async getConfig(req, res) {
    const url = process.env.N8N_PUBLIC_WEBHOOK_URL;
    const { name, logo } = await getSetup();
    res.json({
      whatsapp: url ? { url, secret: process.env.N8N_WEBHOOK_SECRET || '' } : null,
      // Why there is no target, so the factory can say it instead of guessing.
      ...(url ? {} : { reason: 'N8N_PUBLIC_WEBHOOK_URL unset' }),
      setup: { name, logo },
    });
  }
  // Factory app, first run: trade a one-time setup code (made in Offline
  // Setup, services/syncWriter.js) for this PC's own upload key. The new PC
  // replaces any previous one, whose key stops working from this moment.
  // The key is in this response only; just its hash is kept.
  static async register(req, res) {
    const { code, writer_id: writerId } = req.body || {};
    if (typeof code !== 'string' || !code.trim() || typeof writerId !== 'string' || !UUID_RE.test(writerId)) {
      return res.status(400).json({ error: 'Body must be { code, writer_id } with writer_id a uuid' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Marks the code used in the same statement that checks it, so two
      // PCs racing with one code can't both get through.
      const { rowCount } = await client.query(
        `UPDATE setup_code SET used_at = now()
          WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()`,
        [hashSetupCode(code)]
      );
      if (rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(401).json({
          code: 'BadSetupCode',
          error: 'That setup code is wrong, already used, or expired. Create a new one in Offline Setup.',
        });
      }
      const uploadKey = crypto.randomBytes(32).toString('hex');
      const { rows: [prev] } = await client.query(
        `SELECT writer_id FROM sync_writer WHERE id = 1 FOR UPDATE`
      );
      await client.query(
        `UPDATE sync_writer
            SET writer_id = $1, upload_key_hash = $2, registered_at = now(), last_ingest_at = NULL
          WHERE id = 1`,
        [writerId, hashUploadKey(uploadKey)]
      );
      // The last heartbeat described the previous PC.
      await client.query('DELETE FROM sync_heartbeat');
      await client.query('COMMIT');
      console.log(`🔑 Sync: main PC ${writerId} registered${prev?.writer_id ? `, replacing ${prev.writer_id}` : ''}`);
      const { name, logo } = await getSetup();
      res.json({ writerId, uploadKey, setup: { name, logo } });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('❌ Sync register failed:', err.message);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  // Every minute from the registered main PC (desktop/main.js): it is alive,
  // and how far behind it is. Counts only; never business data.
  static async heartbeat(req, res) {
    const b = req.body || {};
    const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
    const text = (v) => (typeof v === 'string' ? v.slice(0, 40) : null);
    await pool.query(
      `INSERT INTO sync_heartbeat (id, received_at, outbox_count, oldest_outbox_age_sec, quarantine_count,
                                   whatsapp_state, whatsapp_oldest_age_sec, sync_state)
       VALUES (1, now(), $1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         received_at = now(), outbox_count = $1, oldest_outbox_age_sec = $2, quarantine_count = $3,
         whatsapp_state = $4, whatsapp_oldest_age_sec = $5, sync_state = $6`,
      [int(b.outbox_count), int(b.oldest_outbox_age_sec), int(b.quarantine_count),
       text(b.whatsapp_state), int(b.whatsapp_oldest_age_sec), text(b.sync_state)]
    );
    res.json({ ok: true });
  }

  // One-time copy of every business table, for the factory app's first run
  // (desktop/lib/snapshot.js). Refused unless READ_ONLY_MODE is on: otherwise
  // someone could save here after the copy is taken, and that row would never
  // reach the factory (and later be overwritten by factory data). Also refused
  // unless the caller (already checked: the registered PC, requireSyncWriter)
  // registered within the last hour — a later download is not a first run.
  static async snapshot(req, res) {
    if (process.env.READ_ONLY_MODE !== 'true') {
      return res.status(409).json({
        error: 'Turn on READ_ONLY_MODE=true on the server (and restart it) before copying data to the factory',
      });
    }
    const registeredAt = req.syncWriter?.registeredAt;
    if (!registeredAt || Date.now() - new Date(registeredAt).getTime() > SNAPSHOT_WINDOW_MS) {
      return res.status(403).json({
        code: 'SnapshotWindowClosed',
        error: 'Copying the data is allowed only within an hour of registering this PC. Create a new setup code in Offline Setup and enter it again.',
      });
    }
    const client = await pool.connect();
    try {
      // One consistent point in time across all tables.
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const tables = await loadTables(client);
      const out = {};
      for (const name of [...tables.keys()].filter((n) => !VPS_ONLY_TABLES.has(n)).sort()) {
        const { rows } = await client.query(`SELECT to_jsonb(t) AS r FROM public.${client.escapeIdentifier(name)} t`);
        out[name] = rows.map((row) => row.r);
      }
      await client.query('COMMIT');
      res.json({ takenAt: new Date().toISOString(), tables: out });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('❌ Sync snapshot failed:', err.message);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }

  static async ingest(req, res) {
    const changes = req.body?.changes;
    if (!Array.isArray(changes)) {
      return res.status(400).json({ error: 'Body must be { changes: [...] }' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Replica mode: skip FK checks, cascades and user triggers, like any
      // replication tool. The factory already enforced all of that when the
      // change happened; applying it again here would only cause spurious
      // ordering failures (and double cascades).
      await client.query('SET LOCAL session_replication_role = replica');

      // Only the registered main PC, checked again here under the row lock:
      // a new PC registering while this batch runs waits for it to finish,
      // and any batch after that is refused. Nothing is applied before this.
      const { rowCount: isWriter } = await client.query(
        'UPDATE sync_writer SET last_ingest_at = now() WHERE id = 1 AND upload_key_hash = $1',
        [uploadKeyHashFrom(req)]
      );
      if (!isWriter) throw new NotWriter();

      const tables = await loadTables(client);
      const q = (name) => client.escapeIdentifier(name);
      // All schema checks first: one failure refuses the whole batch (409),
      // nothing applied.
      for (const change of changes) validateChange(change, tables);

      // Then each change on its own. A row this server can't take (typically
      // 23505, a unique constraint) is set aside in sync_rejected and the rest
      // of the batch still applies, instead of one bad row stalling all sync
      // (F15). The factory gets the list back and quarantines those rows.
      //
      // Under session_replication_role = replica, unique (23505), check
      // (23514) and not-null (23502) constraints still fire, but foreign keys
      // do NOT: a rejected parent can leave an applied child pointing at
      // nothing. Acceptable for a view-only mirror; a retry repairs it.
      const accepted = [];
      const rejected = [];
      const touched = new Set();
      const { rows: openRows } = await client.query(
        'SELECT DISTINCT table_name FROM sync_rejected WHERE resolved_at IS NULL'
      );
      const tablesWithOpen = new Set(openRows.map((r) => r.table_name));

      for (const change of changes) {
        const { table_name: tableName, op, row_data: row, id: outboxId = null } = change;
        const table = tables.get(tableName);
        const pk = pkOf(row, table);
        await client.query('SAVEPOINT chg');
        try {
          await applyChange(client, { tableName, op, row }, table);
          await client.query('RELEASE SAVEPOINT chg');
        } catch (err) {
          await client.query('ROLLBACK TO SAVEPOINT chg');
          if (!isRowError(err)) throw err; // whole batch rolls back; the factory retries it
          rejected.push({
            id: outboxId, table_name: tableName, op,
            code: err.code, constraint: err.constraint || null, detail: err.detail || err.message || null,
          });
          await client.query(
            `INSERT INTO sync_rejected (outbox_id, table_name, op, pk, row_data, code, constraint_name, detail)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [outboxId, tableName, op, JSON.stringify(pk), row, err.code, err.constraint || null, err.detail || err.message || null]
          );
          tablesWithOpen.add(tableName);
          console.warn(`⚠️ Sync: set aside ${op} ${tableName} ${JSON.stringify(pk)} (outbox ${outboxId}): ${err.code} ${err.constraint || err.message}`);
          continue;
        }
        accepted.push(outboxId);
        touched.add(tableName);
        // A later change to a rejected row (e.g. the factory's retry) went
        // through, so that rejection is settled.
        if (tablesWithOpen.has(tableName)) {
          await client.query(
            `UPDATE sync_rejected SET resolved_at = now()
              WHERE resolved_at IS NULL AND table_name = $1 AND pk = $2::jsonb`,
            [tableName, JSON.stringify(pk)]
          );
        }
      }

      // Rows arrive with explicit ids, which don't advance this side's serial
      // sequences. Keep them at the max so nothing here ever reuses an id.
      // Look the sequence up first: a key with no sequence can be text
      // (report_schedules.frequency), and GREATEST(text, 1) fails when the
      // statement is parsed, even if no row would reach it.
      for (const tableName of touched) {
        const { pk } = tables.get(tableName);
        if (pk.length !== 1) continue;
        const t = `public.${q(tableName)}`;
        const { rows: [{ seq }] } = await client.query('SELECT pg_get_serial_sequence($1, $2) AS seq', [t, pk[0]]);
        if (!seq) continue;
        await client.query(`SELECT setval($1, GREATEST((SELECT max(${q(pk[0])}) FROM ${t}), 1))`, [seq]);
      }

      await client.query('COMMIT');
      res.json({ applied: accepted.length, accepted, rejected });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err instanceof NotWriter) {
        return res.status(403).json(NOT_WRITER);
      }
      if (err instanceof SchemaMismatch) {
        console.error('❌ Sync rejected:', err.message);
        return res.status(409).json({ error: err.message });
      }
      console.error('❌ Sync ingest failed:', err.message);
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  }
}

module.exports = SyncController;
