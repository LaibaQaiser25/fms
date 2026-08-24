const express = require('express');
const router = express.Router();
const RawMaterialsController = require('../controllers/RawMaterialsController');

// Search/auto-suggest raw materials (MUST come before /:id route)
router.get('/search', RawMaterialsController.searchRawMaterials);

// Low-stock alerts (MUST come before /:id route)
router.get('/alerts/low-stock', RawMaterialsController.getLowStockRawMaterials);

// Get single raw material
router.get('/:id', RawMaterialsController.getRawMaterial);

// Get all raw materials with pagination
router.get('/', RawMaterialsController.getAllRawMaterials);

// Create a new raw material
router.post('/', RawMaterialsController.createRawMaterial);

// Update raw material
router.put('/:id', RawMaterialsController.updateRawMaterial);

// Delete raw material
router.delete('/:id', RawMaterialsController.deleteRawMaterial);

module.exports = router;
