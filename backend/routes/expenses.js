const express = require('express');
const router = express.Router();
const ExpenseController = require('../controllers/ExpenseController');

// Expense routes
router.get('/', ExpenseController.getExpenses);
router.get('/summary', ExpenseController.getExpenseSummary);
router.get('/categories', ExpenseController.getCategories);
router.get('/:id', ExpenseController.getExpenseById);
router.post('/', ExpenseController.createExpense);
router.put('/:id', ExpenseController.updateExpense);
router.delete('/:id', ExpenseController.deleteExpense);

module.exports = router;
