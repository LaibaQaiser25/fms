const express = require('express');
const router = express.Router();
const {
  getAllProducts,
  searchProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  createCategory
} = require('../controllers/ProductsController');

// Categories (declared before /:id so 'categories' isn't swallowed as an id param)
router.get('/categories', getCategories);
router.post('/categories', createCategory);

// Products
router.get('/', getAllProducts);
router.get('/search', searchProducts);
router.get('/:id', getProductById);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);

module.exports = router;
