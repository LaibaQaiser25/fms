import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import * as productsApi from '../api/productsApi';
import { capitalizeFirstLetter } from '../utils/text';

const UNIT_OPTIONS = ['Bag', 'Truck', 'Cft'];

const emptyForm = { type: '', name: '', category_id: '', size: '', unit: '', description: '' };

export default function ProductsManager() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [lockedMessage, setLockedMessage] = useState('');

  // Category combobox (search existing / offer to create when nothing matches)
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);

  // Filters — the second dropdown's meaning depends on Type: category (Stock) or
  // unit (Raw Material). Both filters reset whenever Type changes so a stale
  // selection from one mode can't silently apply in the other.
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [unitFilter, setUnitFilter] = useState('');

  const handleTypeFilterChange = (value) => {
    setTypeFilter(value);
    setCategoryFilter('');
    setUnitFilter('');
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await productsApi.getAllProducts(typeFilter || undefined);
      setProducts(Array.isArray(res.data) ? res.data : []);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await productsApi.getCategories();
      setCategories(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const visibleProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || String(p.category_id) === String(categoryFilter);
    const matchesUnit = !unitFilter || p.unit === unitFilter;
    return matchesSearch && matchesCategory && matchesUnit;
  });

  const isLocked = !form.type;

  // Native `disabled` inputs never dispatch click/mousedown at all, so a guard on an
  // ancestor can't catch "the user tried to touch it" — attach this directly to each
  // locked field's onMouseDown instead, before focus/typing happens.
  const guardLocked = (e) => {
    if (isLocked) {
      e.preventDefault();
      setLockedMessage('Select category first');
    }
  };

  const handleTypeChange = (value) => {
    setForm({ ...emptyForm, type: value, name: form.name, description: form.description });
    setCategorySearch('');
    setLockedMessage('');
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
    setShowForm(false);
    setLockedMessage('');
    setCategorySearch('');
    setShowCategorySuggestions(false);
  };

  const categorySuggestions = categorySearch
    ? categories.filter((c) => c.name.toLowerCase().includes(categorySearch.toLowerCase()))
    : categories;

  const handleCategorySearchChange = (value) => {
    setCategorySearch(capitalizeFirstLetter(value));
    setForm((f) => ({ ...f, category_id: '' }));
    setShowCategorySuggestions(true);
  };

  const selectCategorySuggestion = (c) => {
    setForm((f) => ({ ...f, category_id: c.id }));
    setCategorySearch(c.name);
    setShowCategorySuggestions(false);
  };

  const handleAddCategory = async () => {
    const name = categorySearch.trim();
    if (!name) return;
    try {
      const res = await productsApi.createCategory(name);
      const created = res.data;
      setCategories((prev) => {
        const exists = prev.some((c) => c.id === created.id);
        return exists ? prev : [...prev, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      setForm((f) => ({ ...f, category_id: created.id }));
      setCategorySearch(created.name);
      setShowCategorySuggestions(false);
    } catch (err) {
      alert('Error adding category: ' + err.message);
    }
  };

  const handleSubmit = async () => {
    if (!form.type) return alert('Select category first');
    if (!form.name) return alert('Name is required');
    if (form.type === 'stock' && !form.category_id) return alert('Category is required');
    if (form.type === 'raw_material' && !form.unit) return alert('Unit is required');

    try {
      if (editing) {
        await productsApi.updateProduct(editing.id, form);
      } else {
        await productsApi.createProduct(form);
      }
      resetForm();
      fetchProducts();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleEdit = (item) => {
    setEditing(item);
    setForm({
      type: item.type,
      name: item.name,
      category_id: item.category_id || '',
      size: item.size || '',
      unit: item.unit || '',
      description: item.description || ''
    });
    setCategorySearch(item.category_name || '');
    setShowForm(true);
    setLockedMessage('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    await productsApi.deleteProduct(id);
    fetchProducts();
  };

  const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500 disabled:bg-gray-100 disabled:text-gray-400";

  return (
    <div className="max-w-5xl mx-auto p-6">

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-extrabold">Products</h2>
          <p className="text-gray-400 text-sm">{products.length} products in catalog</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-gray-900 text-white px-4 py-2 rounded font-bold text-sm"
        >
          + Add Product
        </button>
      </div>

      {/* Add/Edit Product Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">{editing ? 'Edit Product' : 'Add New Product'}</h3>
              <button onClick={resetForm} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Mandatory gate: Stock vs Raw Material */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 mb-1">Category *</label>
              <select
                className={inp}
                value={form.type}
                onChange={(e) => handleTypeChange(e.target.value)}
              >
                <option value="">-- Select Category --</option>
                <option value="stock">Stock</option>
                <option value="raw_material">Raw Material</option>
              </select>
              {lockedMessage && (
                <p className="text-red-500 text-xs mt-1 font-medium">{lockedMessage}</p>
              )}
            </div>

            {/* Locked placeholder — Name/Description stay visible but greyed out until
                a Category is picked above. Deliberately NOT using the `disabled`
                attribute — disabled elements never dispatch mousedown/click at all, so
                there'd be no way to catch "the user touched it" and show the warning.
                readOnly blocks typing while still letting the guard fire. */}
            {isLocked && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  className={`${inp} bg-gray-100 text-gray-400 cursor-not-allowed`}
                  placeholder="Name *"
                  value={form.name}
                  readOnly
                  onMouseDown={guardLocked}
                  onChange={() => {}}
                />
                <input
                  className={`${inp} bg-gray-100 text-gray-400 cursor-not-allowed`}
                  placeholder="Description"
                  value={form.description}
                  readOnly
                  onMouseDown={guardLocked}
                  onChange={() => {}}
                />
              </div>
            )}

            {form.type === 'stock' && (
              <div className="grid grid-cols-2 gap-3">
                {/* 1. Category */}
                <div className="relative">
                  <input
                    className={inp}
                    placeholder="Search or add category *"
                    value={categorySearch}
                    onChange={(e) => handleCategorySearchChange(e.target.value)}
                    onFocus={() => setShowCategorySuggestions(true)}
                    onBlur={() => setTimeout(() => setShowCategorySuggestions(false), 150)}
                  />
                  {showCategorySuggestions && (
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

                {/* 2. Name */}
                <input
                  className={inp}
                  placeholder="Name *"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: capitalizeFirstLetter(e.target.value) })}
                />

                {/* 3. Size */}
                <input
                  className={inp}
                  placeholder="Size (e.g. 10ft, 2m)"
                  value={form.size}
                  onChange={(e) => setForm({ ...form, size: capitalizeFirstLetter(e.target.value) })}
                />

                {/* 4. Description */}
                <input
                  className={inp}
                  placeholder="Description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: capitalizeFirstLetter(e.target.value) })}
                />
              </div>
            )}

            {form.type === 'raw_material' && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  className={inp}
                  placeholder="Name *"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: capitalizeFirstLetter(e.target.value) })}
                />
                <select
                  className={inp}
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                >
                  <option value="">-- Select Unit --</option>
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <input
                  className={`${inp} col-span-2`}
                  placeholder="Description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: capitalizeFirstLetter(e.target.value) })}
                />
              </div>
            )}

            <button onClick={handleSubmit}
              className="mt-4 bg-gray-900 text-white px-5 py-2 rounded font-bold text-sm">
              {editing ? 'Update Product' : 'Save Product'}
            </button>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          className={`${inp} max-w-xs`}
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={`${inp} max-w-[160px]`}
          value={typeFilter}
          onChange={(e) => handleTypeFilterChange(e.target.value)}
        >
          <option value="">All Types</option>
          <option value="stock">Stock</option>
          <option value="raw_material">Raw Material</option>
        </select>
        {/* This dropdown's meaning follows the Type filter: units for Raw Material,
            categories for Stock (and by default, when no Type is picked yet) */}
        {typeFilter === 'raw_material' ? (
          <select
            className={`${inp} max-w-[180px]`}
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
          >
            <option value="">All Units</option>
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        ) : (
          <select
            className={`${inp} max-w-[180px]`}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : visibleProducts.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg">
          No products yet. Add your first product!
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Name', 'Type', 'Category / Unit', 'Size', 'Description', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-bold text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map(item => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.type === 'stock' ? 'Stock' : 'Raw Material'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.type === 'stock' ? (item.category_name || '—') : (item.unit || '—')}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{item.size || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{item.description || '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleEdit(item)}
                      className="bg-gray-100 text-gray-700 px-3 py-1 rounded text-xs mr-2 font-medium">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(item.id)}
                      className="bg-red-50 text-red-600 px-3 py-1 rounded text-xs font-medium">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
