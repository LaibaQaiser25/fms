const express = require('express');
const router = express.Router();
const PurchaseLedgerController = require('../controllers/PurchaseLedgerController');

// Get ledger summary (specific routes first)
router.get('/summary/all', PurchaseLedgerController.getLedgerSummary);

// Get outstanding debts (specific routes first)
router.get('/debts/outstanding', PurchaseLedgerController.getOutstandingDebts);

// Get seller ledger history (parameterized route)
router.get('/seller/:seller_id', PurchaseLedgerController.getSellerLedgerHistory);

// Get full ledger
router.get('/', PurchaseLedgerController.getFullPurchaseLedger);

// Add manual ledger entry
router.post('/', PurchaseLedgerController.addLedgerEntry);

module.exports = router;
