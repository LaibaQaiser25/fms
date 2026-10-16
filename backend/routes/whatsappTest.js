const express = require('express');
const router = express.Router();

// Factory PC only (server.js, FMS_FACTORY=1, behind requireOwner): "Send test
// WhatsApp" (T1.8). Goes the full way — backend -> local relay -> n8n -> Meta
// — but skips the relay's queue, so the Owner sees the real outcome at once.
router.post('/', async (req, res) => {
  // N8N_WEBHOOK_URL points at the relay's /alert (desktop/main.js); /test is next to it.
  const relayUrl = process.env.N8N_WEBHOOK_URL && new URL('/test', process.env.N8N_WEBHOOK_URL);
  if (!relayUrl) return res.status(500).json({ ok: false, result: 'no_relay', detail: 'N8N_WEBHOOK_URL is not set' });

  const when = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });
  const message = `✅ FMS test message from the factory PC (${when}). If you can read this, WhatsApp alerts work.`;
  try {
    const r = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-FMS-Secret': process.env.N8N_WEBHOOK_SECRET || '' },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(40_000),
    });
    const result = await r.json();
    console.log(`📱 Test WhatsApp by ${req.user.username || req.user.id}: ${result.result} ${result.detail || ''}`);
    res.json(result);
  } catch (err) {
    res.status(502).json({ ok: false, result: 'no_relay', detail: `the local WhatsApp relay did not answer (${err.message})` });
  }
});

module.exports = router;
