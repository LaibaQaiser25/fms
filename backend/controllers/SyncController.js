const pool = require('../db/pool');

// Receives changes from the factory desktop app (desktop/lib/sync.js). The
// factory is the single writer; this server just mirrors its rows.
//
// Each change is { table_name, op: 'I'|'U'|'D', row_data } in the order the
// factory made them. I/U = upsert the full row by primary key, D = delete by
// primary key — so re-sending a batch (lost reply) is harmless.

class SchemaMismatch extends Error {}

// Business tables only; the factory never sends these, and must not be able to.
const PROTECTED_TABLES = new Set(['pgmigrations']);

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

class SyncController {
  // One-time copy of every business table, for the factory app's first run
  // (desktop/lib/snapshot.js). Refused unless READ_ONLY_MODE is on: otherwise
  // someone could save here after the copy is taken, and that row would never
  // reach the factory (and later be overwritten by factory data).
  static async snapshot(req, res) {
    if (process.env.READ_ONLY_MODE !== 'true') {
      return res.status(409).json({
        error: 'Turn on READ_ONLY_MODE=true on the server (and restart it) before copying data to the factory',
      });
    }
    const client = await pool.connect();
    try {
      // One consistent point in time across all tables.
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const tables = await loadTables(client);
      const out = {};
      for (const name of [...tables.keys()].sort()) {
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

      const tables = await loadTables(client);
      const q = (name) => client.escapeIdentifier(name);
      const touched = new Set();

      for (const change of changes) {
        const { table_name: tableName, op, row_data: row } = change || {};
        const table = tables.get(tableName);
        if (!table) throw new SchemaMismatch(`unknown table "${tableName}" — deploy the latest backend to the server`);
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new SchemaMismatch(`bad row for ${tableName}`);

        const cols = Object.keys(row);
        const unknown = cols.filter((c) => !table.columns.has(c));
        if (unknown.length) {
          throw new SchemaMismatch(`column(s) ${unknown.join(', ')} missing on ${tableName} — deploy the latest backend to the server`);
        }
        const missingPk = table.pk.filter((c) => !(c in row));
        if (missingPk.length) throw new SchemaMismatch(`primary key ${missingPk.join(', ')} missing for ${tableName}`);

        // jsonb_populate_record casts every value to the column's real type.
        const t = `public.${q(tableName)}`;
        const src = `jsonb_populate_record(NULL::${t}, $1::jsonb)`;
        const pkList = table.pk.map(q).join(', ');

        if (op === 'D') {
          await client.query(`DELETE FROM ${t} WHERE (${pkList}) = (SELECT ${pkList} FROM ${src})`, [row]);
        } else if (op === 'I' || op === 'U') {
          const colList = cols.map(q).join(', ');
          const updates = cols.filter((c) => !table.pk.includes(c)).map((c) => `${q(c)} = EXCLUDED.${q(c)}`);
          await client.query(
            `INSERT INTO ${t} (${colList}) SELECT ${colList} FROM ${src}
             ON CONFLICT (${pkList}) DO ${updates.length ? `UPDATE SET ${updates.join(', ')}` : 'NOTHING'}`,
            [row]
          );
        } else {
          throw new SchemaMismatch(`unknown op "${op}"`);
        }
        touched.add(tableName);
      }

      // Rows arrive with explicit ids, which don't advance this side's serial
      // sequences. Keep them at the max so nothing here ever reuses an id.
      for (const tableName of touched) {
        const { pk } = tables.get(tableName);
        if (pk.length !== 1) continue;
        const t = `public.${q(tableName)}`;
        await client.query(
          `SELECT setval(seq, GREATEST((SELECT max(${q(pk[0])}) FROM ${t}), 1))
             FROM pg_get_serial_sequence($1, $2) AS seq WHERE seq IS NOT NULL`,
          [t, pk[0]]
        );
      }

      await client.query('COMMIT');
      res.json({ applied: changes.length });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
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
