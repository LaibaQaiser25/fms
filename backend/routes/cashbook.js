const express = require('express');
const router = express.Router();
const CashbookController = require('../controllers/CashbookController');

// Totals only, same filters as the list (specific routes first)
router.get('/summary', CashbookController.getCashbookSummary);

// Distinct payment types, for the filter dropdown
router.get('/payment-types', CashbookController.getPaymentTypes);

// Per-customer / per-seller breakdown of the Receivable and Payable cards
router.get('/balances/:side', CashbookController.getBalanceDetails);

// Cashbook entries + totals
router.get('/',CashbookController.getCashbook);

module.exports = router;
