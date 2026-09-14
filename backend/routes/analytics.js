const express = require('express');
const router = express.Router();
const AnalyticsController = require('../controllers/AnalyticsController');

router.get('/summary', AnalyticsController.getSummary);
router.get('/orders-trend', AnalyticsController.getOrdersTrend);
router.get('/earnings-breakdown', AnalyticsController.getEarningsBreakdown);
router.get('/records', AnalyticsController.getRecords);

module.exports = router;
