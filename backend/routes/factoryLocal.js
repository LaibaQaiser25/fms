const fs = require('fs');
const express = require('express');
const router = express.Router();

// Factory PC only (mounted in server.js when desktop/main.js sets the files).
// Both are public, like /auth/login: states and counts, a name and a logo —
// no business data.

const readJson = (file) => new Promise((resolve) => {
  fs.readFile(file, 'utf8', (err, text) => {
    if (err) return resolve(null);
    try { resolve(JSON.parse(text)); } catch { resolve(null); }
  });
});

// Upload + WhatsApp status for the status bar on every terminal (T1.5),
// from status.json, which desktop/lib/status.js rewrites every 15 s.
router.get('/status', async (req, res) => {
  const status = process.env.FMS_STATUS_FILE && await readJson(process.env.FMS_STATUS_FILE);
  if (!status) return res.status(503).json({ state: 'starting', level: 'amber', problems: ['Starting…'] });
  // Lets the bar notice a status that stopped updating (main process stuck).
  status.ageSec = Math.round((Date.now() - new Date(status.generatedAt).getTime()) / 1000);
  res.json(status);
});

// Setup name and logo from Offline Setup (T1.2), for the login screen.
router.get('/branding', async (req, res) => {
  const b = (process.env.FMS_BRANDING_FILE && await readJson(process.env.FMS_BRANDING_FILE)) || {};
  res.json({ name: b.name || null, logo: b.logo || null });
});

module.exports = router;
