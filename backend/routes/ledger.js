const express = require('express');
const router = express.Router();
const CustomerLedgerController = require('../controllers/CustomerLedgerController');

// Get ledger summary (specific routes first)
router.get('/summary/all', CustomerLedgerController.getLedgerSummary);

// Get outstanding debts (specific routes first)
router.get('/debts/outstanding', CustomerLedgerController.getOutstandingDebts);

// Get customer ledger history (parameterized route)
router.get('/customer/:customer_id', CustomerLedgerController.getCustomerLedgerHistory);

// Get full ledger
router.get('/', CustomerLedgerController.getFullLedger);

// Add manual ledger entry
router.post('/', CustomerLedgerController.addLedgerEntry);

module.exports = router;