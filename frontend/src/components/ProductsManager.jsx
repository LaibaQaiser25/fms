import { useEffect, useRef, useState } from 'react';
import { X, ArrowLeft, Package, Layers } from 'lucide-react';
import * as XLSX from 'xlsx';
import * as productsApi from '../api/productsApi';
import { capitalizeFirstLetter } from '../utils/text';
import { ACCENT_GRADIENT_STYLE } from '../theme';

const emptyForm = { type: '', name: '', category_id: '', size: '', unit: '', description: '', quantity: '' };

const emptyExcelRow = { type: '', name: '', category_name: '', size: '', unit: '', description: '', quantity: '' };

const TEMPLATE_HEADERS = ['Type', 'Name', 'Category / Unit', 'Size', 'Quantity', 'Description'];

const normalizeType = (raw) => {
  const v = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (v === 'stock') return 'stock';
  if (v === 'raw_material' || v === 'raw' || v === 'rawmaterial') return 'raw_material';
  return '';
};

const normalizeUnit = (raw, units) => {
  const v = String(raw || '').trim().toLowerCase();
  return units.find((u) => u.name.toLowerCase() === v)?.name || '';
};

export default function ProductsManager() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [lockedMessage, setLockedMessage] = useState('');

  const [showChooseMethod, setShowChooseMethod] = useState(false);
  const [showExcelGrid, setShowExcelGrid] = useState(false);
  const [excelRows, setExcelRows] = useState([{ ...emptyExcelRow }]);
  const [excelSaving, setExcelSaving] = useState(false);
  const excelFileInputRef = useRef(null);

  // Category combobox (search existing / offer to create when nothing matches)
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);

  // Category/Unit manager modal (accessible via the "+ Add Category" button)
  const [showCatManager, setShowCatManager] = useState(false);
  const [catManagerType, setCatManagerType] = useState('');
  const [catManagerSearch, setCatManagerSearch] = useState('');
  const [catManagerEditingId, setCatManagerEditingId] = useState(null);
  const [catManagerEditingValue, setCatManagerEditingValue] = useState('');

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
    fetchUnits();
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

  const fetchUnits = async () => {
    try {
      const res = await productsApi.getUnits();
      setUnits(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching units:', err);
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
      setLockedMessage('Select type first');
    }
  };

  const handleTypeChange = (value) => {
    setForm({ ...emptyForm, type: value, name: form.name, description: form.description, quantity: form.quantity });
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
    setForm((f) => ({ ...f, category_id: c.id, name: c.name }));
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
      setForm((f) => ({ ...f, category_id: created.id, name: created.name }));
      setCategorySearch(created.name);
      setShowCategorySuggestions(false);
    } catch (err) {
      alert('Error adding category: ' + err.message);
    }
  };

  const openCatManager = () => {
    setCatManagerType('');
    setCatManagerSearch('');
    setCatManagerEditingId(null);
    setShowCatManager(true);
  };

  const closeCatManager = () => {
    setShowCatManager(false);
    setCatManagerType('');
    setCatManagerSearch('');
    setCatManagerEditingId(null);
  };

  const catManagerList = catManagerType === 'stock' ? categories : catManagerType === 'raw_material' ? units : [];
  const catManagerFilteredList = catManagerSearch
    ? catManagerList.filter((c) => c.name.toLowerCase().includes(catManagerSearch.toLowerCase()))
    : catManagerList;

  const handleCatManagerAdd = async () => {
    const name = catManagerSearch.trim();
    if (!name) return;
    try {
      if (catManagerType === 'stock') {
        const res = await productsApi.createCategory(name);
        setCategories((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const res = await productsApi.createUnit(name);
        setUnits((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setCatManagerSearch('');
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCatManagerStartEdit = (item) => {
    setCatManagerEditingId(item.id);
    setCatManagerEditingValue(item.name);
  };

  const handleCatManagerSaveEdit = async () => {
    const name = catManagerEditingValue.trim();
    if (!name) return;
    try {
      if (catManagerType === 'stock') {
        const res = await productsApi.updateCategory(catManagerEditingId, name);
        setCategories((prev) => prev.map((c) => (c.id === res.data.id ? res.data : c)).sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const res = await productsApi.updateUnit(catManagerEditingId, name);
        setUnits((prev) => prev.map((u) => (u.id === res.data.id ? res.data : u)).sort((a, b) => a.name.localeCompare(b.name)));
      }
      setCatManagerEditingId(null);
      fetchProducts();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCatManagerDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      if (catManagerType === 'stock') {
        await productsApi.deleteCategory(item.id);
        setCategories((prev) => prev.filter((c) => c.id !== item.id));
      } else {
        await productsApi.deleteUnit(item.id);
        setUnits((prev) => prev.filter((u) => u.id !== item.id));
      }
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSubmit = async () => {
    if (!form.type) return alert('Select category first');
    if (!form.name) return alert('Name is required');
    if (form.type === 'stock' && !form.category_id) return alert('Category is required');
    if (form.type === 'raw_material' && !form.unit) return alert('Unit is required');
    if (form.quantity === '' || Number.isNaN(Number(form.quantity)) || Number(form.quantity) < 0) {
      return alert('Quantity is required');
    }

    try {
      if (editing) {
        await productsApi.updateProduct(editing.id, form);
      } else {
        await productsApi.createProduct(form);
      }
      resetForm();
      fetchProducts();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
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
      description: item.description || '',
      quantity: item.quantity ?? ''
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

  const openExcelGrid = () => {
    setExcelRows([{ ...emptyExcelRow }]);
    setShowExcelGrid(true);
  };

  const updateExcelRow = (index, field, value) => {
    setExcelRows((rows) => rows.map((row, i) => {
      if (i !== index) return row;
      if (field === 'type') {
        // Type change resets the fields that only apply to the other type.
        return { ...emptyExcelRow, type: value, name: row.name, description: row.description, quantity: row.quantity };
      }
      return { ...row, [field]: value };
    }));
  };

  const addExcelRow = () => setExcelRows((rows) => [...rows, { ...emptyExcelRow }]);

  const removeExcelRow = (index) => {
    setExcelRows((rows) => rows.length === 1 ? rows : rows.filter((_, i) => i !== index));
  };

  const closeExcelGrid = () => {
    setShowExcelGrid(false);
    setExcelRows([{ ...emptyExcelRow }]);
  };

  const handleDownloadTemplate = () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEADERS,
      ['stock', 'Cement Block', 'Blocks', '4x8', '100', 'High quality block'],
      ['raw_material', 'Cement', 'Bag', '', '50', 'Ordinary Portland Cement']
    ]);
    const instructions = XLSX.utils.aoa_to_sheet([
      ['Type must be exactly: stock  or  raw_material'],
      [`Category / Unit: for Type=stock enter a category name; for Type=raw_material enter one of: ${units.map((u) => u.name).join(', ') || 'Bag, Truck, Cft'}`],
      ['Size only applies to Type=stock (optional)'],
      ['Quantity is required for every row'],
      ['Delete the two example rows on the Products sheet before importing your real data']
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Products');
    XLSX.utils.book_append_sheet(wb, instructions, 'Instructions');
    XLSX.writeFile(wb, 'product_import_template.xlsx');
  };

  const handleImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheet = wb.Sheets['Products'] || wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const imported = raw
        .map((r) => {
          const type = normalizeType(r.Type ?? r.type);
          const name = String(r.Name ?? r.name ?? '').trim();
          const categoryOrUnit = String(r['Category / Unit'] ?? r.Category ?? r.Unit ?? r.category ?? r.unit ?? '').trim();
          const size = String(r.Size ?? r.size ?? '').trim();
          const quantity = String(r.Quantity ?? r.quantity ?? '').trim();
          const description = String(r.Description ?? r.description ?? '').trim();
          return {
            type,
            name,
            category_name: type === 'stock' ? categoryOrUnit : '',
            unit: type === 'raw_material' ? normalizeUnit(categoryOrUnit, units) : '',
            size: type === 'stock' ? size : '',
            quantity,
            description
          };
        })
        .filter((r) => r.name);

      if (imported.length === 0) {
        alert('No rows found in that file. Make sure it has Type, Name, and Category / Unit columns filled in.');
        return;
      }

      setExcelRows((rows) => {
        const nonEmpty = rows.filter((r) => r.name || r.type || r.category_name || r.description);
        return [...nonEmpty, ...imported];
      });
    } catch (err) {
      alert('Could not read that file: ' + err.message);
    }
  };

  const handleExcelSubmit = async () => {
    for (let i = 0; i < excelRows.length; i++) {
      const row = excelRows[i];
      const rowNum = i + 1;
      if (!row.type) return alert(`Row ${rowNum}: select Stock or Raw Material`);
      if (!row.name.trim()) return alert(`Row ${rowNum}: name is required`);
      if (row.type === 'stock' && !row.category_name.trim()) return alert(`Row ${rowNum}: category is required`);
      if (row.type === 'raw_material' && !row.unit) return alert(`Row ${rowNum}: unit is required`);
      if (row.quantity === '' || Number.isNaN(Number(row.quantity)) || Number(row.quantity) < 0) {
        return alert(`Row ${rowNum}: quantity is required`);
      }
    }

    setExcelSaving(true);
    try {
      await productsApi.bulkCreateProducts(excelRows.map((row) => ({
        type: row.type,
        name: row.name.trim(),
        category_name: row.type === 'stock' ? row.category_name.trim() : undefined,
        size: row.type === 'stock' ? (row.size.trim() || undefined) : undefined,
        unit: row.type === 'raw_material' ? row.unit : undefined,
        quantity: Number(row.quantity),
        description: row.description.trim() || undefined
      })));
      closeExcelGrid();
      fetchProducts();
      fetchCategories();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setExcelSaving(false);
    }
  };

  const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500 disabled:bg-gray-100 disabled:text-gray-400";

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-8 py-6 flex justify-between items-center">
        <div>
          {typeFilter ? (
            <>
              <button
                onClick={() => handleTypeFilterChange('')}
                className="group inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-900 hover:text-white px-3 py-1.5 rounded-full mb-2 transition-colors duration-150"
              >
                <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
                All Products
              </button>
              <h1 className="text-3xl font-bold text-gray-800">{typeFilter === 'stock' ? 'Stock' : 'Raw Material'}</h1>
              <p className="text-gray-600 mt-2">{products.length} products</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-gray-800">Products</h1>
              <p className="text-gray-600 mt-2">{products.length} products in catalog</p>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={openCatManager}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded font-bold text-sm"
          >
            + Add Category
          </button>
          <button
            onClick={() => setShowChooseMethod(true)}
            className="bg-gray-900 text-white px-4 py-2 rounded font-bold text-sm"
          >
            + Add Product
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">

      {/* Category / Unit Manager Modal */}
      {showCatManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Manage Categories & Units</h3>
              <button onClick={closeCatManager} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-600 mb-1">Type *</label>
              <select
                className={inp}
                value={catManagerType}
                onChange={(e) => {
                  setCatManagerType(e.target.value);
                  setCatManagerSearch('');
                  setCatManagerEditingId(null);
                }}
              >
                <option value="">-- Select Type --</option>
                <option value="stock">Stock (Category)</option>
                <option value="raw_material">Raw Material (Unit)</option>
              </select>
            </div>

            {catManagerType && (
              <>
                <div className="mb-3">
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    {catManagerType === 'stock' ? 'Category name' : 'Unit name'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      className={inp}
                      placeholder={`Search or add ${catManagerType === 'stock' ? 'category' : 'unit'}...`}
                      value={catManagerSearch}
                      onChange={(e) => setCatManagerSearch(e.target.value)}
                    />
                    <button
                      onClick={handleCatManagerAdd}
                      className="bg-gray-900 text-white px-4 py-2 rounded font-bold text-sm whitespace-nowrap"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-y-auto flex-1">
                  {catManagerFilteredList.length === 0 ? (
                    <div className="p-4 text-center text-gray-400 text-sm">No matches</div>
                  ) : (
                    catManagerFilteredList.map((item) => (
                      <div key={item.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0">
                        {catManagerEditingId === item.id ? (
                          <>
                            <input
                              className={`${inp} mr-2`}
                              value={catManagerEditingValue}
                              onChange={(e) => setCatManagerEditingValue(e.target.value)}
                              autoFocus
                            />
                            <div className="flex gap-1 shrink-0">
                              <button onClick={handleCatManagerSaveEdit} className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                Save
                              </button>
                              <button onClick={() => setCatManagerEditingId(null)} className="text-xs font-bold text-gray-500 px-2 py-1 rounded">
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-sm">{item.name}</span>
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => handleCatManagerStartEdit(item)} className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                Rename
                              </button>
                              <button onClick={() => handleCatManagerDelete(item)} className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded">
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Choose Add Method Modal */}
      {showChooseMethod && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Add Product</h3>
              <button onClick={() => setShowChooseMethod(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">How would you like to add products?</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setShowChooseMethod(false); resetForm(); setShowForm(true); }}
                className="border border-gray-300 hover:border-gray-900 rounded-lg px-4 py-3 text-left"
              >
                <div className="font-bold text-sm">Add Manually</div>
                <div className="text-xs text-gray-400">Fill in one product at a time</div>
              </button>
              <button
                onClick={() => { setShowChooseMethod(false); openExcelGrid(); }}
                className="border border-gray-300 hover:border-gray-900 rounded-lg px-4 py-3 text-left"
              >
                <div className="font-bold text-sm">Excel Sheet</div>
                <div className="text-xs text-gray-400">Add multiple products in a spreadsheet-style grid</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add Products (Excel-style grid) Modal */}
      {showExcelGrid && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Add Products — Excel Sheet</h3>
              <button onClick={closeExcelGrid} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button
                onClick={handleDownloadTemplate}
                className="bg-gray-100 text-gray-700 px-3 py-2 rounded font-bold text-xs"
              >
                Download Template
              </button>
              <button
                onClick={() => excelFileInputRef.current?.click()}
                className="bg-gray-100 text-gray-700 px-3 py-2 rounded font-bold text-xs"
              >
                Import Excel File
              </button>
              <input
                ref={excelFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleImportFileChange}
              />
              <span className="text-xs text-gray-400">Import a filled-in template, or type rows below</span>
            </div>

            <datalist id="excel-category-options">
              {categories.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>

            <div className="overflow-auto border border-gray-200 rounded-lg flex-1">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    {['Category *', 'Name *', 'Category Name / Unit *', 'Size', 'Quantity *', 'Description', ''].map((h) => (
                      <th key={h} className="px-2 py-2 text-left font-bold text-gray-700 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {excelRows.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="p-1">
                        <select
                          className={inp}
                          value={row.type}
                          onChange={(e) => updateExcelRow(i, 'type', e.target.value)}
                        >
                          <option value="">-- Select --</option>
                          <option value="stock">Stock</option>
                          <option value="raw_material">Raw Material</option>
                        </select>
                      </td>
                      <td className="p-1">
                        <input
                          className={inp}
                          placeholder="Name"
                          value={row.name}
                          onChange={(e) => updateExcelRow(i, 'name', e.target.value)}
                        />
                      </td>
                      <td className="p-1">
                        {row.type === 'raw_material' ? (
                          <select
                            className={inp}
                            value={row.unit}
                            onChange={(e) => updateExcelRow(i, 'unit', e.target.value)}
                          >
                            <option value="">-- Select Unit --</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.name}>{u.name}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className={inp}
                            placeholder="Category name"
                            value={row.category_name}
                            list="excel-category-options"
                            disabled={!row.type}
                            onChange={(e) => updateExcelRow(i, 'category_name', e.target.value)}
                          />
                        )}
                      </td>
                      <td className="p-1">
                        <input
                          className={inp}
                          placeholder="Size"
                          value={row.size}
                          disabled={row.type !== 'stock'}
                          onChange={(e) => updateExcelRow(i, 'size', e.target.value)}
                        />
                      </td>
                      <td className="p-1">
                        <input
                          className={inp}
                          placeholder="Quantity"
                          type="number"
                          min="0"
                          value={row.quantity}
                          onChange={(e) => updateExcelRow(i, 'quantity', e.target.value)}
                          onWheel={(e) => e.target.blur()}
                        />
                      </td>
                      <td className="p-1">
                        <input
                          className={inp}
                          placeholder="Description"
                          value={row.description}
                          onChange={(e) => updateExcelRow(i, 'description', e.target.value)}
                        />
                      </td>
                      <td className="p-1 text-center">
                        <button
                          onClick={() => removeExcelRow(i)}
                          disabled={excelRows.length === 1}
                          className="text-red-500 hover:bg-red-50 rounded p-1 disabled:text-gray-300"
                          title="Remove row"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <button
                onClick={addExcelRow}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded font-bold text-sm"
              >
                + Add Row
              </button>
              <div className="flex gap-2">
                <button onClick={closeExcelGrid} className="bg-gray-100 text-gray-700 px-5 py-2 rounded font-bold text-sm">
                  Cancel
                </button>
                <button
                  onClick={handleExcelSubmit}
                  disabled={excelSaving}
                  className="bg-gray-900 text-white px-5 py-2 rounded font-bold text-sm disabled:opacity-50"
                >
                  {excelSaving ? 'Saving...' : `Save ${excelRows.length} Product${excelRows.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                <option value="">-- Select Type --</option>
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

                {/* 4. Quantity */}
                <input
                  className={inp}
                  placeholder="Quantity *"
                  type="number"
                  min="0"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  onWheel={(e) => e.target.blur()}
                />

                {/* 5. Description */}
                <input
                  className={`${inp} col-span-2`}
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
                  {units.map((u) => (
                    <option key={u.id} value={u.name}>{u.name}</option>
                  ))}
                </select>
                <input
                  className={inp}
                  placeholder="Quantity *"
                  type="number"
                  min="0"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  onWheel={(e) => e.target.blur()}
                />
                <input
                  className={inp}
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

      {/* Type cards (default view) or search/filters + table (drilled into a type) */}
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : !typeFilter ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <button
            onClick={() => handleTypeFilterChange('stock')}
            className="group text-left bg-white border-l-4 border-[var(--color-text-accent)] border-y border-r border-gray-200 rounded-xl p-5 shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={ACCENT_GRADIENT_STYLE}>
                <Package className="w-5 h-5 text-white" />
              </div>
            </div>
            <h3 className="font-semibold text-xl text-gray-800 mb-0.5 group-hover:text-red-700 transition-colors">Stock</h3>
            <p className="text-gray-600 text-sm mb-3">
              {products.filter((p) => p.type === 'stock').length} product{products.filter((p) => p.type === 'stock').length === 1 ? '' : 's'}
            </p>
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-sm font-semibold text-gray-600">Categories</span>
              <span className="text-xl font-semibold text-gray-900">{categories.length}</span>
            </div>
          </button>

          <button
            onClick={() => handleTypeFilterChange('raw_material')}
            className="group text-left bg-white border-l-4 border-gray-500 border-y border-r border-gray-200 rounded-xl p-5 shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={ACCENT_GRADIENT_STYLE}>
                <Layers className="w-5 h-5 text-white" />
              </div>
            </div>
            <h3 className="font-semibold text-xl text-gray-800 mb-0.5 group-hover:text-red-700 transition-colors">Raw Material</h3>
            <p className="text-gray-600 text-sm mb-3">
              {products.filter((p) => p.type === 'raw_material').length} product{products.filter((p) => p.type === 'raw_material').length === 1 ? '' : 's'}
            </p>
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-sm font-semibold text-gray-600">Units</span>
              <span className="text-xl font-semibold text-gray-900">{units.length}</span>
            </div>
          </button>
        </div>
      ) : (
        <>
          {/* Search + Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              className={`${inp} max-w-xs`}
              placeholder="Search by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {typeFilter === 'raw_material' ? (
              <select
                className={`${inp} max-w-[180px]`}
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value)}
              >
                <option value="">All Units</option>
                {units.map((u) => (
                  <option key={u.id} value={u.name}>{u.name}</option>
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
          {visibleProducts.length === 0 ? (
            <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg">
              No products yet. Add your first product!
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['Name', 'Category / Unit', 'Size', 'Quantity', 'Description', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-bold text-gray-700">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleProducts.map(item => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {item.type === 'stock' ? (item.category_name || '—') : (item.unit || '—')}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{item.size || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{item.quantity ?? '—'}</td>
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
        </>
      )}
      </div>
    </div>
  );
}
