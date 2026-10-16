const crypto = require('crypto');
const pool = require('../db/pool');

// One-PC lock (SYNC-HARDENING-PLAN.md D6, T1.1). The VPS accepts uploads only
// from the one registered main factory PC, identified by its own upload key.
// The Owner creates a one-time setup code (Offline Setup page, or
// scripts/createSetupCode.js); the factory app trades it for an upload key at
// POST /sync/register. Registering replaces the previous PC, whose key then
// stops working. Neither the code nor the key is ever stored in plain text.

const SETUP_CODE_TTL_MINUTES = 60;
// No 0/O, 1/I/L: the code is read off a screen and typed in by hand.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// 403 body for any /sync call that isn't from the registered main PC. The
// factory app stops uploading on this code (desktop/lib/sync.js).
const NOT_WRITER = {
  code: 'WriterNotRegistered',
  error: 'This PC is not the registered main PC. Register it with a new setup code from Offline Setup.',
};

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Codes are compared ignoring case, spaces and dashes ("k7qm 2xpa" works).
const normalizeCode = (code) => String(code || '').toUpperCase().replace(/[\s-]/g, '');
const hashSetupCode = (code) => sha256(`setup-code:${normalizeCode(code)}`);
const hashUploadKey = (key) => sha256(`upload-key:${key}`);

function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// e.g. K7QM-2XPA, from a cryptographically secure generator.
function generateSetupCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// Stores only the hash. Any older unused code stops working, so at most one
// code is valid at a time. Returns the plain code: show it once, then forget it.
async function createSetupCode(db = pool) {
  const code = generateSetupCode();
  await db.query('UPDATE setup_code SET expires_at = now() WHERE used_at IS NULL AND expires_at > now()');
  const { rows: [row] } = await db.query(
    `INSERT INTO setup_code (code_hash, expires_at)
     VALUES ($1, now() + make_interval(mins => $2)) RETURNING expires_at`,
    [hashSetupCode(code), SETUP_CODE_TTL_MINUTES]
  );
  return { code, expiresAt: row.expires_at };
}

// The upload key a request carries (X-Upload-Key), hashed; null if none.
function uploadKeyHashFrom(req) {
  const key = req.get('X-Upload-Key');
  return key ? hashUploadKey(key) : null;
}

module.exports = {
  NOT_WRITER,
  createSetupCode,
  hashSetupCode,
  hashUploadKey,
  sameHash,
  uploadKeyHashFrom,
};
