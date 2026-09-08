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

// Update / delete a manual ledger entry
router.put('/:id', PurchaseLedgerController.updateLedgerEntry);
router.delete('/:id', PurchaseLedgerController.deleteLedgerEntry);

module.exports = router;
