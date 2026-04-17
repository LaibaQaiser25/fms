const express = require('express');
const router = express.Router();
const InvoiceController = require('../controllers/InvoiceController');

// Get all invoices
router.get('/', InvoiceController.getAllInvoices);

// Get pending payments
router.get('/pending/list', InvoiceController.getPendingPayments);

// Record a payment
router.post('/payment', InvoiceController.recordPayment);

// Get invoices for a customer
router.get('/customer/:customer_id', InvoiceController.getCustomerInvoices);

// Get invoice by number
router.get('/number/:invoice_no', InvoiceController.getInvoiceByNumber);

// Get single invoice
router.get('/:id', InvoiceController.getInvoice);

module.exports = router;