const express = require('express');
const router = express.Router();
const SalesController = require('../controllers/SalesController');

// Consolidated dashboard endpoint (should be before dynamic routes)
router.get('/dashboard/data', SalesController.getDashboardData);

// Create a new sale
router.post('/', SalesController.createSale);

// Get all sales
router.get('/', SalesController.getAllSales);

// Get today's sales summary
router.get('/summary/today', SalesController.getTodaysSalesSummary);

// Get recent orders (last 10)
router.get('/recent/list', SalesController.getRecentOrders);

// Get single sale
router.get('/:id', SalesController.getSale);

// Update sale status
router.put('/:id/status', SalesController.updateSaleStatus);

module.exports = router;
