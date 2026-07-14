const express = require('express');
const router = express.Router();
const PurchaseController = require('../controllers/PurchaseController');

router.post('/', PurchaseController.createPurchase);
router.get('/', PurchaseController.getAllPurchases);
router.get('/:id', PurchaseController.getPurchase);
router.put('/:id', PurchaseController.updatePurchase);
router.delete('/:id', PurchaseController.deletePurchase);

module.exports = router;
