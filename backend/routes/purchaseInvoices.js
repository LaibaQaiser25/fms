const express = require('express');
const router = express.Router();
const PurchaseInvoiceController = require('../controllers/PurchaseInvoiceController');

// Get all purchase invoices
router.get('/', PurchaseInvoiceController.getAllPurchaseInvoices);

// Get pending payments
router.get('/pending/list', PurchaseInvoiceController.getPendingPayments);

// Record a payment to a seller
router.post('/payment', PurchaseInvoiceController.recordPayment);

// Get invoices for a seller
router.get('/seller/:seller_id', PurchaseInvoiceController.getSellerInvoices);

// Get invoice by number
router.get('/number/:invoice_no', PurchaseInvoiceController.getPurchaseInvoiceByNumber);

// Get single invoice
router.get('/:id', PurchaseInvoiceController.getPurchaseInvoice);

module.exports = router;
