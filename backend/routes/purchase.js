// const express = require('express');
// const PurchaseController = require('../controllers/PurchaseController');
// const router = express.Router();

// router.post('/', PurchaseController.createPurchase);
// router.get('/purchase-invoices', PurchaseController.getPurchaseInvoices);
// router.get('/purchase-invoices/:id', PurchaseController.getPurchaseInvoiceById);
// router.post('/purchase-payments', PurchaseController.recordPurchasePayment);
// router.get('/purchase-payments/:seller_id', PurchaseController.getPurchasePayments);
// router.get('/purchase-ledger/:seller_id', PurchaseController.getPurchaseLedger);
// router.get('/', PurchaseController.getAllPurchases);
// router.get('/:id', PurchaseController.getPurchase);
// router.put('/:id', PurchaseController.updatePurchase);
// router.delete('/:id', PurchaseController.deletePurchase);

// module.exports = router;


const express = require('express');
const router = express.Router();
const PurchaseController = require('../controllers/PurchaseController');

// Consolidated dashboard endpoint (should be before dynamic routes)
router.get('/dashboard/data', PurchaseController.getDashboardData);

// Create a new purchase
router.post('/', PurchaseController.createPurchase);

// Get all purchases
router.get('/', PurchaseController.getAllPurchases);

// Get today's purchases summary
router.get('/summary/today', PurchaseController.getTodaysPurchasesSummary);

// Get purchase totals for a date range (Reports)
router.get('/summary/range', PurchaseController.getPurchasesSummary);

// Get recent purchases (last 10)
router.get('/recent/list', PurchaseController.getRecentPurchases);

// Get single purchase
router.get('/:id', PurchaseController.getPurchase);

// Update purchase status
router.put('/:id/status', PurchaseController.updatePurchaseStatus);

module.exports = router;
