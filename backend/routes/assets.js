const express = require('express');
const router = express.Router();
const AssetController = require('../controllers/AssetController');

// Asset routes
router.get('/', AssetController.getAssets);
router.get('/summary', AssetController.getAssetSummary);
router.get('/categories', AssetController.getCategories);
router.get('/:id', AssetController.getAssetById);
router.post('/', AssetController.createAsset);
router.put('/:id', AssetController.updateAsset);
router.delete('/:id', AssetController.deleteAsset);

module.exports = router;
