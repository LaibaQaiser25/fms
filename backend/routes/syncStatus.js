const express = require('express');
const router = express.Router();
const { getFactoryStatus } = require('../services/factoryStatus');

// Online server, any role (T1.5): when the main factory PC was last heard
// from, for "Factory last updated X min ago" on every page.
router.get('/', async (req, res) => {
  res.json(await getFactoryStatus());
});

module.exports = router;
