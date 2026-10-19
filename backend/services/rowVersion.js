// "Changed by someone else" for edit forms (SYNC-HARDENING-PLAN.md T3.5).
// With several factory terminals on one server, two people can open the same
// record; without this the second save silently undoes the first.
//
// The version is Postgres's xmin (the transaction that last wrote the row),
// sent with every record the edit forms load (`version`) and sent back on
// save. It changes on EVERY update of the row, including ones that don't set
// updated_at (a sale's stock decrement, a purchase's increment), and needs no
// new column, so no migration and no change to what sync carries. Locking a
// row (FOR UPDATE) does not change it.
//
// Saves without a version (an older page still open) are applied as before.

const VERSION = 'xmin::text AS version';

class ConflictError extends Error {
  constructor(current) {
    super('Someone else changed this since you opened it. Your change was not saved: reload to see theirs, then make yours again.');
    this.status = 409;
    this.current = current;
  }
}

class NotFoundError extends Error {
  constructor(what) {
    super(`${what} not found`);
    this.status = 404;
  }
}

// Inside a transaction: locks the row and returns it (with its version), or
// throws NotFoundError / ConflictError. table is a fixed identifier from the
// caller, never user input.
async function lockForEdit(client, table, id, version, what = 'Record') {
  const { rows } = await client.query(`SELECT *, ${VERSION} FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
  if (rows.length === 0) throw new NotFoundError(what);
  if (version !== undefined && version !== null && String(version) !== rows[0].version) {
    throw new ConflictError(rows[0]);
  }
  return rows[0];
}

// Runs fn(client) in a transaction; a ConflictError / NotFoundError becomes
// its 409 / 404 reply. Resolves fn's result, or undefined once it replied.
async function editInTransaction(pool, res, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof ConflictError) {
      res.status(409).json({ error: err.message, code: 'Conflict', current: err.current });
      return undefined;
    }
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
      return undefined;
    }
    throw err;
  } finally {
    client.release();
  }
}

// "Find it by name, else create it" inside a transaction: two terminals doing
// it at once for the same new name would both find nothing and create two
// rows. This serializes them on the key until the transaction ends, so the
// second one finds the first one's row. No unique index, so existing
// duplicates don't break anything.
async function lockKey(client, key) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}

module.exports = { VERSION, lockForEdit, editInTransaction, lockKey, ConflictError, NotFoundError };
