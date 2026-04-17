const express = require('express');
const router = express.Router();
const ProductionController = require('../controllers/ProductionController');

// Get production statistics
router.get('/stats/overview', ProductionController.getStats);

// Get today's production schedule
router.get('/today/schedule', ProductionController.getTodaySchedule);

// Add to production queue
router.post('/', ProductionController.addToQueue);

// Get production queue (with optional filters)
router.get('/', ProductionController.getQueue);

// Get single production item
router.get('/:id', ProductionController.getProductionItem);

// Update production status
router.put('/:id/status', ProductionController.updateStatus);

module.exports = router;
