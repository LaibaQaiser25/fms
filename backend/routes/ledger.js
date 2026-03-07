const express = require('express');
const router = express.Router();
const {
  getAllCustomers,
  addCredit,
  getCustomerLedger,
  deleteCustomer
} = require('../controllers/LedgerController');

// Routes
router.get('/', getAllCustomers);          // GET all customers grouped
router.post('/credit', addCredit);         // POST credit + receipt
router.get('/customer/:name', getCustomerLedger); // GET ledger entries by customer
router.delete('/customer/:name', deleteCustomer); // DELETE customer ledger + invoices

module.exports = router;