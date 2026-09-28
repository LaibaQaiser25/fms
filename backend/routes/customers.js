const express = require('express');
const router = express.Router();
const CustomersController = require('../controllers/CustomersController');

// Search/auto-suggest customers (MUST come before /:id route)
router.get('/search', CustomersController.searchCustomers);

// Search/auto-suggest previously used addresses (MUST come before /:id route)
router.get('/addresses', CustomersController.searchAddresses);

// Get single customer
router.get('/:id', CustomersController.getCustomer);

// Get all customers with pagination
router.get('/', CustomersController.getAllCustomers);

// Create a new customer
router.post('/', CustomersController.createCustomer);

// Update customer
router.put('/:id', CustomersController.updateCustomer);

// Delete customer
router.delete('/:id', CustomersController.deleteCustomer);

module.exports = router;
