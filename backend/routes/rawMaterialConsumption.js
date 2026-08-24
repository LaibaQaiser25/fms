const express = require('express');
const router = express.Router();
const RawMaterialConsumptionController = require('../controllers/RawMaterialConsumptionController');

// Today's consumption entries (MUST come before the / list route)
router.get('/today', RawMaterialConsumptionController.getTodaysConsumption);

// Consumption history, optional raw_material_id filter
router.get('/', RawMaterialConsumptionController.getConsumptionHistory);

// Log a new consumption entry
router.post('/', RawMaterialConsumptionController.logConsumption);

module.exports = router;
