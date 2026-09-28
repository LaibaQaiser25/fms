import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import expenseAPI from '../../api/expenseApi';
import { capitalizeFirstLetter } from '../../utils/text';

// The categories that used to be seeded into expense_categories. They're no
// longer created automatically (see migration 019) — only offered as
// suggestions while the user types a new category name.
const SUGGESTED_CATEGORIES = [
  'Daily Expenses',
  'Petrol',
  'WiFi',
  'Electricity',
  'Gas',
  'Maintenance',
  'Carriage',
  'Staff Transportation',
  'General Office Expense',
];

const today = () => new Date().toISOString().split('T')[0];

const inp = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500';

// z-[60], above the Add/Edit Expense modal's z-50, since it can be opened
// from inside that form (via "+ Add new category").
const ExpenseCategoryManager = ({ isOpen, onClose, categories, initialName = '', onCategoriesChanged }) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setAmount('');
      setDate(today());
      setEditingId(null);
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const existingNames = new Set(categories.map((c) => c.name.toLowerCase()));
  const suggestions = SUGGESTED_CATEGORIES.filter(
    (s) => !existingNames.has(s.toLowerCase()) && s.toLowerCase().includes(name.trim().toLowerCase())
  );
  const filteredCategories = name
    ? categories.filter((c) => c.name.toLowerCase().includes(name.trim().toLowerCase()))
    : categories;

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return alert('Category name is required');
    if (amount === '' || Number.isNaN(Number(amount)) || Number(amount) < 0) {
      return alert('Initial amount is required');
    }
    setSaving(true);
    try {
      await expenseAPI.createCategory({ name: trimmed, amount, date });
      setName('');
      setAmount('');
      setDate(today());
      onCategoriesChanged();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    const trimmed = editingValue.trim();
    if (!trimmed) return;
    try {
      await expenseAPI.updateCategory(editingId, trimmed);
      setEditingId(null);
      onCategoriesChanged();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await expenseAPI.deleteCategory(item.id);
      onCategoriesChanged();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <div className="fixed inset-0 bg-white/10 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Manage Expense Categories</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="mb-4 space-y-2">
          <label className="block text-xs font-bold text-gray-600">New category</label>
          <div className="relative">
            <input
              className={inp}
              placeholder="Search or add category *"
              value={name}
              onChange={(e) => { setName(capitalizeFirstLetter(e.target.value)); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 max-h-40 overflow-y-auto">
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Suggestions</div>
                {suggestions.map((s) => (
                  <div
                    key={s}
                    onMouseDown={() => { setName(s); setShowSuggestions(false); }}
                    className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 text-sm"
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inp}
              placeholder="Initial amount (PKR) *"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onWheel={(e) => e.target.blur()}
            />
            <input
              className={inp}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="w-full bg-gray-900 text-white px-4 py-2 rounded font-bold text-sm disabled:opacity-50"
          >
            {saving ? 'Adding...' : '+ Add Category'}
          </button>
          <p className="text-xs text-gray-400">The initial amount is recorded as this category's first expense.</p>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-y-auto flex-1">
          {filteredCategories.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">
              {categories.length === 0 ? 'No categories yet — add your first one above' : 'No matches'}
            </div>
          ) : (
            filteredCategories.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0">
                {editingId === item.id ? (
                  <>
                    <input
                      className={`${inp} mr-2`}
                      value={editingValue}
                      onChange={(e) => setEditingValue(capitalizeFirstLetter(e.target.value))}
                      autoFocus
                    />
                    <div className="flex gap-1 shrink-0">
                      <button onClick={handleSaveEdit} className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-xs font-bold text-gray-500 px-2 py-1 rounded">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm">{item.name}</span>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => { setEditingId(item.id); setEditingValue(item.name); }}
                        className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded"
                      >
                        Rename
                      </button>
                      <button onClick={() => handleDelete(item)} className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded">
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpenseCategoryManager;
