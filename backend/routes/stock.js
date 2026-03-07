const express = require('express');
const router = express.Router();
const {
  getAllStock,
  searchStock,
  getStockById,
  addStock,
  updateStock,
  deleteStock
} = require('../controllers/StockController');

// Routes
router.get('/', getAllStock);          // GET all stock
router.get('/search', searchStock);    // GET search stock
router.get('/:id', getStockById);      // GET single stock item
router.post('/', addStock);            // POST add new stock
router.put('/:id', updateStock);       // PUT update stock
router.delete('/:id', deleteStock);    // DELETE stock item

module.exports = router;