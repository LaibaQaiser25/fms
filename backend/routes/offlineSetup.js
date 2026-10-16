const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { createSetupCode } = require('../services/syncWriter');
const { getFactoryStatus, GREEN_UNDER_MS } = require('../services/factoryStatus');
const {
  SetupInputError, MAX_LOGO_BYTES, getSetup, setSetupName, setLogo, clearLogo,
} = require('../services/offlineSetup');

// Offline Setup (T1.2): register the main factory PC and set the name and
// logo it shows. Owner only (mounted behind authMiddleware + requireOwner in
// server.js), and the one place READ_ONLY_MODE lets writes through
// (middleware/readOnlyMode.js).

// The address extra factory PCs open in a browser (T3.3).
const EXTRA_PC_ADDRESS = process.env.FACTORY_LAN_ADDRESS || 'http://fms-host:48620';

// Only on the online server: the factory PC's own backend has no SYNC_TOKEN,
// and setting up PCs from there makes no sense.
router.use((req, res, next) => {
  if (!process.env.SYNC_TOKEN) {
    return res.status(404).json({ error: 'Offline Setup is only available on the online dashboard' });
  }
  next();
});

// Everything the page shows: the form when mainPc is null, else the overview.
router.get('/', async (req, res) => {
  const [{ rows: [writer] }, setup, factory] = await Promise.all([
    pool.query('SELECT writer_id, registered_at FROM sync_writer WHERE id = 1'),
    getSetup(),
    getFactoryStatus(),
  ]);
  res.json({
    mainPc: writer?.writer_id
      ? {
          writerId: writer.writer_id,
          registeredAt: writer.registered_at,
          lastUploadAt: factory.lastUploadAt,
          lastSeenAt: factory.lastSeenAt,
          // Heard from (heartbeat every minute, or an upload) in the last 2 minutes
          online: !!factory.lastSeenAt && Date.now() - new Date(factory.lastSeenAt).getTime() < GREEN_UNDER_MS,
        }
      : null,
    setupName: setup.name,
    logo: setup.logo,
    updatedAt: setup.updatedAt,
    extraPcAddress: EXTRA_PC_ADDRESS,
  });
});

router.put('/settings', async (req, res) => {
  await setSetupName(req.body?.setupName);
  console.log(`🏷️ Offline Setup: setup name changed by ${req.user.username || req.user.id}`);
  res.json(await getSetup());
});

// The image itself is the body (Content-Type ignored: the type is checked
// from the file's contents). One byte over the limit is refused here with
// a clear message (error handler below).
router.put(
  '/logo',
  express.raw({ type: () => true, limit: MAX_LOGO_BYTES }),
  async (req, res) => {
    await setLogo(req.body);
    console.log(`🖼️ Offline Setup: logo replaced by ${req.user.username || req.user.id}`);
    res.json(await getSetup());
  }
);

router.delete('/logo', async (req, res) => {
  await clearLogo();
  res.json(await getSetup());
});

// A one-time code for registering the main factory PC (T1.1). Shown once;
// only its hash is kept. Using it on a new PC blocks the previous one.
router.post('/setup-code', async (req, res) => {
  const { code, expiresAt } = await createSetupCode();
  console.log(`🔑 Setup code created by ${req.user.username || req.user.id}, valid until ${expiresAt.toISOString()}`);
  res.json({ code, expiresAt });
});

router.use((err, req, res, next) => {
  if (err instanceof SetupInputError) return res.status(400).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'The logo must be 1 MB or smaller.' });
  next(err);
});

module.exports = router;
