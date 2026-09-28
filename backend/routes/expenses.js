const express = require('express');
const router = express.Router();
const ExpenseController = require('../controllers/ExpenseController');

// Expense routes
router.get('/', ExpenseController.getExpenses);
router.get('/summary', ExpenseController.getExpenseSummary);
router.get('/categories', ExpenseController.getCategories);
router.post('/categories', ExpenseController.createCategory);
router.put('/categories/:id', ExpenseController.updateCategory);
router.delete('/categories/:id', ExpenseController.deleteCategory);
router.get('/:id', ExpenseController.getExpenseById);
router.post('/', ExpenseController.createExpense);
router.put('/:id', ExpenseController.updateExpense);
router.delete('/:id', ExpenseController.deleteExpense);

module.exports = router;
