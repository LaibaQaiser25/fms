const express = require('express');
const router = express.Router();
const {
  getAllInvoices,
  getInvoice,
  createInvoice,
  deleteInvoice,
  getClientInvoices
} = require('../controllers/InvoiceController');

// Routes
router.get('/', getAllInvoices);
router.get('/:id', getInvoice);
router.post('/', createInvoice);
router.delete('/:id', deleteInvoice);
router.get('/client/:name', getClientInvoices);

module.exports = router;