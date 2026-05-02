import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Select, Alert, Table, Pagination, FilterBar } from '../shared/UIComponents';
import expenseAPI from '../../api/expenseApi';
import ExpenseForm from './ExpenseForm';

const ExpenseList = () => {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const [filters, setFilters] = useState({
    search: '',
    categoryId: '',
    startDate: '',
    endDate: '',
    sortBy: 'date',
    order: 'DESC',
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [filters, currentPage]);

  const fetchCategories = async () => {
    try {
      const response = await expenseAPI.getCategories();
      setCategories(response.data.data);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const response = await expenseAPI.getAll({
        ...filters,
        page: currentPage,
        limit: 10,
      });
      setExpenses(response.data.data);
      setTotalPages(response.data.pagination.pages);
    } catch (err) {
      setError('Failed to fetch expenses');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
    setCurrentPage(1);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    try {
      await expenseAPI.delete(id);
      setSuccess('Expense deleted successfully');
      fetchExpenses();
    } catch (err) {
      setError('Failed to delete expense');
    }
  };

  const handleEditClick = (expense) => {
    setEditingExpense(expense);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingExpense(null);
  };

  const handleFormSubmit = () => {
    setSuccess(editingExpense ? 'Expense updated successfully' : 'Expense created successfully');
    handleFormClose();
    fetchExpenses();
  };

  const columns = [
    { key: 'category_name', label: 'Category' },
    { key: 'description', label: 'Description' },
    { key: 'amount', label: 'Amount', render: (val) => `PKR ${parseFloat(val).toFixed(2)}` },
    { key: 'date', label: 'Date', render: (val) => new Date(val).toLocaleDateString() },
  ];

  const filterOptions = [
    { type: 'text', key: 'search', label: 'Search', value: filters.search },
    { type: 'select', key: 'categoryId', label: 'Category', value: filters.categoryId, options: categories },
    { type: 'date', key: 'startDate', label: 'From Date', value: filters.startDate },
    { type: 'date', key: 'endDate', label: 'To Date', value: filters.endDate },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Expenses</h1>
        <Button variant="primary" onClick={() => setShowForm(true)}>
          Add Expense
        </Button>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

      <FilterBar filters={filterOptions} onFilterChange={handleFilterChange} />

      <Card>
        <Table
          columns={columns}
          data={expenses}
          loading={loading}
          onEdit={handleEditClick}
          onDelete={handleDelete}
        />
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </Card>

      <ExpenseForm
        isOpen={showForm}
        onClose={handleFormClose}
        onSubmit={handleFormSubmit}
        expense={editingExpense}
        categories={categories}
      />
    </div>
  );
};

export default ExpenseList;
