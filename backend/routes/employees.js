const express = require('express');
const router = express.Router();
const EmployeeController = require('../controllers/EmployeeController');

// Employee routes
router.get('/', EmployeeController.getEmployees);
router.get('/summary', EmployeeController.getEmployeeSummary);
router.get('/types', EmployeeController.getEmployeeTypes);
router.get('/:id', EmployeeController.getEmployeeById);
router.post('/', EmployeeController.createEmployee);
router.put('/:id', EmployeeController.updateEmployee);
router.delete('/:id', EmployeeController.deleteEmployee);

module.exports = router;
