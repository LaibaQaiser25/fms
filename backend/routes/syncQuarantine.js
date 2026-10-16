const express = require('express');
const router = express.Router();
const { listOpen, retry } = require('../services/syncQuarantine');

// Factory PC only (mounted in server.js when FMS_FACTORY=1, behind
// requireOwner): changes the online server refused, and retrying them.

router.get('/', async (req, res) => {
  res.json({ data: await listOpen() });
});

router.post('/:id/retry', async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
  const result = await retry(req.params.id);
  if (!result) return res.status(404).json({ error: 'Already retried, or no such entry' });
  console.log(`🔁 Sync: quarantined change ${req.params.id} re-queued as ${result.op} by ${req.user.username || req.user.id}`);
  res.json(result);
});

module.exports = router;
