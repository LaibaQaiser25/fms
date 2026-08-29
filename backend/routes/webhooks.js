const express = require('express');
const router = express.Router();
const ReportsController = require('../controllers/ReportsController');

/**
 * POST /webhooks/whatsapp-report — called by the n8n "incoming WhatsApp
 * message" workflow when the owner texts the Twilio number asking for a
 * report. Sits outside the /api JWT wall (n8n has no user login) and is
 * instead gated by a shared secret header, so it must stay narrowly scoped
 * to returning report text — never write data through this path.
 */
router.post('/whatsapp-report', async (req, res) => {
  if (!process.env.N8N_INBOUND_SECRET || req.headers['x-webhook-secret'] !== process.env.N8N_INBOUND_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const message = await ReportsController.buildDailyReportMessage();
    res.json({ message });
  } catch (error) {
    console.error('❌ Error building report for inbound WhatsApp request:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
