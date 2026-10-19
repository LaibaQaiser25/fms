const { sameHash } = require('../services/syncWriter');

// Guards GET /sync/health (routes/sync.js): the n8n watchdog (T2.4) is not
// the factory PC, so it has no upload key; it sends SYNC_TOKEN as
// X-Sync-Token instead.
const requireSyncToken = (req, res, next) => {
  if (!sameHash(req.get('X-Sync-Token') || '', process.env.SYNC_TOKEN)) {
    return res.status(403).json({ error: 'X-Sync-Token missing or wrong' });
  }
  next();
};

module.exports = requireSyncToken;
