import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select, Alert } from '../shared/UIComponents';
import { expenseAPI } from '../../services/apiService';

const ExpenseForm = ({ isOpen, onClose, onSubmit, expense, categories }) => {
  const [formData, setFormData] = useState({
    categoryId: '',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expense) {
      setFormData({
        categoryId: expense.category_id,
        description: expense.description,
        amount: expense.amount,
        date: expense.date,
        notes: expense.notes || '',
      });
    } else {
      setFormData({
        categoryId: '',
        description: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    }
  }, [expense, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (expense) {
        await expenseAPI.update(expense.id, formData);
      } else {
        await expenseAPI.create(formData);
      }
      onSubmit();
      setFormData({
        categoryId: '',
        description: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title={expense ? 'Edit Expense' : 'Add Expense'} onClose={onClose} size="md">
      {error && <Alert type="error" message={error} />}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Category"
          name="categoryId"
          value={formData.categoryId}
          options={categories}
          onChange={handleChange}
          required
        />

        <Input
          label="Description"
          type="text"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Enter expense description"
          required
        />

        <Input
          label="Amount"
          type="number"
          name="amount"
          value={formData.amount}
          onChange={handleChange}
          placeholder="Enter amount"
          step="0.01"
          required
        />

        <Input
          label="Date"
          type="date"
          name="date"
          value={formData.date}
          onChange={handleChange}
          required
        />

        <Input
          label="Notes"
          type="text"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          placeholder="Additional notes"
        />

        <div className="flex gap-3 justify-end pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ExpenseForm;
