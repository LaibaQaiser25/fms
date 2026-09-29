const crypto = require('crypto');

// Guards /sync/* (server.js), which the factory desktop app calls — not a
// browser, so no JWT. The token lets the caller overwrite any row in any
// table, so it's compared in constant time and the whole route 404s when
// SYNC_TOKEN isn't configured.
const requireSyncToken = (req, res, next) => {
  const expected = process.env.SYNC_TOKEN;
  if (!expected) {
    return res.status(404).json({ error: 'Sync is not enabled on this server' });
  }
  const given = Buffer.from(req.get('X-Sync-Token') || '');
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return res.status(401).json({ error: 'Invalid sync token' });
  }
  next();
};

module.exports = requireSyncToken;
