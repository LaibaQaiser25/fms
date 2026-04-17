const express = require('express');
const router = express.Router();
const CustomerLedgerController = require('../controllers/CustomerLedgerController');

// Get full ledger
router.get('/', CustomerLedgerController.getFullLedger);

// Get ledger summary
router.get('/summary/all', CustomerLedgerController.getLedgerSummary);

// Get outstanding debts
router.get('/debts/outstanding', CustomerLedgerController.getOutstandingDebts);

// Add manual ledger entry
router.post('/', CustomerLedgerController.addLedgerEntry);

// Get customer ledger history
router.get('/customer/:customer_id', CustomerLedgerController.getCustomerLedgerHistory);

module.exports = router;