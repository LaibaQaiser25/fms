const express = require('express');
const router = express.Router();
const GatePassController = require('../controllers/GatePassController');

// Search sales/purchases still eligible for a gate pass (MUST come before /:id route)
router.get('/eligible', GatePassController.searchEligible);

// List generated gate passes (search / kind filter / pagination)
router.get('/', GatePassController.getAllGatePasses);

// Gate pass for a given sale/purchase, if any (MUST come before /:id route)
router.get('/by-ref', GatePassController.getByRef);

// Generate a gate pass
router.post('/', GatePassController.createGatePass);

// Get single gate pass with items
router.get('/:id', GatePassController.getGatePass);

module.exports = router;
