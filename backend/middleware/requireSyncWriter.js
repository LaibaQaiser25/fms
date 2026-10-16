const pool = require('../db/pool');
const { uploadKeyHashFrom, sameHash, NOT_WRITER } = require('../services/syncWriter');

// Guards /sync/ingest, /config and /snapshot (routes/sync.js): only the one
// registered main factory PC, by its own upload key (X-Upload-Key, issued by
// POST /sync/register). Any other caller — no key, a wrong key, or the PC
// that was replaced — gets 403 WriterNotRegistered before anything runs.
// Ingest checks the key again inside its own transaction (SyncController).
const requireSyncWriter = async (req, res, next) => {
  const hash = uploadKeyHashFrom(req);
  const { rows: [writer] } = await pool.query(
    'SELECT upload_key_hash, registered_at FROM sync_writer WHERE id = 1'
  );
  if (!hash || !writer || !sameHash(hash, writer.upload_key_hash)) {
    return res.status(403).json(NOT_WRITER);
  }
  req.syncWriter = { registeredAt: writer.registered_at };
  next();
};

module.exports = requireSyncWriter;
