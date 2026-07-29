const express = require('express');
const router = express.Router();
const SellersController = require('../controllers/SellersController');

// Search/auto-suggest sellers (MUST come before /:id route)
router.get('/search', SellersController.searchSellers);

// Get single seller
router.get('/:id', SellersController.getSeller);

// Get all sellers with pagination
router.get('/', SellersController.getAllSellers);

// Create a new seller
router.post('/', SellersController.createSeller);

// Update seller
router.put('/:id', SellersController.updateSeller);

// Delete seller
router.delete('/:id', SellersController.deleteSeller);

module.exports = router;
