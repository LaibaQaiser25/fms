import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Alert } from '../shared/UIComponents';
import expenseAPI from '../../api/expenseApi';
import { capitalizeFirstLetter } from '../../utils/text';

const ExpenseForm = ({ isOpen, onClose, onSubmit, expense, categories, onAddCategory }) => {
  const [formData, setFormData] = useState({
    categoryId: '',
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Category combobox (search existing / offer to create when nothing matches)
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);

  useEffect(() => {
    if (expense) {
      setFormData({
        categoryId: expense.category_id,
        description: expense.description,
        amount: expense.amount,
        date: expense.date,
        notes: expense.notes || '',
      });
      setCategorySearch(expense.category_name || '');
    } else {
      setFormData({
        categoryId: '',
        description: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      setCategorySearch('');
    }
    setShowCategorySuggestions(false);
  }, [expense, isOpen]);

  const categorySuggestions = categorySearch
    ? categories.filter((c) => c.name.toLowerCase().includes(categorySearch.toLowerCase()))
    : categories;

  const handleCategorySearchChange = (value) => {
    setCategorySearch(capitalizeFirstLetter(value));
    setFormData((f) => ({ ...f, categoryId: '' }));
    setShowCategorySuggestions(true);
  };

  const selectCategorySuggestion = (c) => {
    setFormData((f) => ({ ...f, categoryId: c.id }));
    setCategorySearch(c.name);
    setShowCategorySuggestions(false);
  };

  // Hands off to the category manager (pre-filled with what was typed) rather
  // than creating inline — a new category also records its initial expense.
  const handleAddCategory = () => {
    const name = categorySearch.trim();
    if (!name) return;
    setShowCategorySuggestions(false);
    onAddCategory(name);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextValue = (name === 'description' || name === 'notes') ? capitalizeFirstLetter(value) : value;
    setFormData({ ...formData, [name]: nextValue });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.categoryId) {
      setError('Select a category from the list');
      return;
    }
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
      setCategorySearch('');
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
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Category</label>
          <div className="relative">
            <input
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-text-accent)]"
              placeholder="Search or add category"
              value={categorySearch}
              onChange={(e) => handleCategorySearchChange(e.target.value)}
              onFocus={() => setShowCategorySuggestions(true)}
              onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 150)}
            />
            {showCategorySuggestions && (categorySuggestions.length > 0 || categorySearch.trim()) && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 max-h-40 overflow-y-auto">
                {categorySuggestions.length > 0 ? (
                  categorySuggestions.map((c) => (
                    <div
                      key={c.id}
                      onMouseDown={() => selectCategorySuggestion(c)}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 text-sm"
                    >
                      {c.name}
                    </div>
                  ))
                ) : (
                  <div
                    onMouseDown={handleAddCategory}
                    className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm font-medium text-gray-700"
                  >
                    + Add new category "{categorySearch}"
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

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
