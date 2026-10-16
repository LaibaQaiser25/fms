const express = require('express');
const router = express.Router();
const { createSetupCode } = require('../services/syncWriter');

// Offline Setup (Owner only — mounted behind requireOwner in server.js).

// A one-time code for registering the main factory PC (T1.1). Shown once;
// only its hash is kept. Using it on a new PC blocks the previous one.
router.post('/setup-code', async (req, res) => {
  const { code, expiresAt } = await createSetupCode();
  console.log(`🔑 Setup code created by ${req.user.username || req.user.id}, valid until ${expiresAt.toISOString()}`);
  res.json({ code, expiresAt });
});

module.exports = router;
