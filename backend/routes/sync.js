const express = require('express');
const router = express.Router();
const SyncController = require('../controllers/SyncController');
const requireSyncToken = require('../middleware/requireSyncToken');

router.use(requireSyncToken);
// Own body parser with a bigger limit than the global 100kb one: a batch is
// up to 500 full rows. Mounted before the global parser in server.js.
router.use(express.json({ limit: '20mb' }));

// Factory desktop app -> this server (see desktop/lib/sync.js)
router.post('/ingest', SyncController.ingest);

// Settings for the factory app (WhatsApp webhook), fetched at startup + hourly
router.get('/config', SyncController.getConfig);

// This server -> factory desktop app, once, on its first run (desktop/lib/snapshot.js)
router.get('/snapshot', SyncController.snapshot);

module.exports = router;
