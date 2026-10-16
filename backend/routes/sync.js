const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const SyncController = require('../controllers/SyncController');
const requireSyncWriter = require('../middleware/requireSyncWriter');

// The factory PC itself runs this same backend without SYNC_TOKEN, so there
// the whole /sync route 404s. Since the one-PC lock (T1.1) SYNC_TOKEN only
// switches sync on; callers authenticate with a setup code (/register) or
// the registered PC's upload key (everything else).
router.use((req, res, next) => {
  if (!process.env.SYNC_TOKEN) {
    return res.status(404).json({ error: 'Sync is not enabled on this server' });
  }
  next();
});

// Same limits as /auth/login: a setup code is short, so guessing must be slow.
const registerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in 15 minutes' },
});

// Factory desktop app, first run: trade a one-time setup code for an upload key
router.post('/register', registerRateLimiter, express.json(), SyncController.register);

router.use(requireSyncWriter);
// Own body parser with a bigger limit than the global 100kb one: a batch is
// up to 500 full rows. Mounted before the global parser in server.js, and
// after the writer check so only the registered PC can send that much.
router.use(express.json({ limit: '20mb' }));

// Factory desktop app -> this server (see desktop/lib/sync.js)
router.post('/ingest', SyncController.ingest);

// Settings for the factory app (WhatsApp webhook), fetched at startup + hourly
router.get('/config', SyncController.getConfig);

// This server -> factory desktop app, once, on its first run (desktop/lib/snapshot.js)
router.get('/snapshot', SyncController.snapshot);

module.exports = router;
