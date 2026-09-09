import { useEffect, useState } from 'react';
import { ArrowLeft, Package, Pencil, Trash2 } from 'lucide-react';
import { getAllStock, createStock, updateStock, deleteStock } from '../api/stockApi';
import * as productsApi from '../api/productsApi';
import { ACCENT_GRADIENT_STYLE } from '../theme';

// Cycled left-border accents for category cards — mirrors the stat-card language
// used on the Dashboard (border-l-4 in rotating brand colors).
const CARD_ACCENTS = ['border-[var(--color-accent)]', 'border-gray-500', 'border-amber-500', 'border-[var(--color-accent-hover)]', 'border-gray-700', 'border-[var(--color-accent)]'];

export default function StockManager() {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showCalculator, setShowCalculator] = useState(false);
  // Default landing view is category cards; picking one drills into its in-stock items.
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [form, setForm] = useState({
    name: '', unit_price: '0', quantity: '', category: '', size: '', extra: '', product_id: null
  });

  // Adding a new stock item requires picking an existing Stock-type product from the
  // catalog — name/category/size come from that product, not free text.
  const [productSearch, setProductSearch] = useState('');
  const [productSuggestions, setProductSuggestions] = useState([]);

  // Price calculator state
  const [calculatorRows, setCalculatorRows] = useState([
    { id: 1, itemSearch: '', selectedItem: null, calcPrice: '', calcQuantity: '' }
  ]);
  const [nextRowId, setNextRowId] = useState(2);

  // Filter stocks based on search
  const getFilteredStocks = (search) => {
    return stocks.filter(stock =>
      stock.name.toLowerCase().includes(search.toLowerCase())
    );
  };

  const handleItemSelect = (rowId, item) => {
    setCalculatorRows(prev => {
      const updatedRows = prev.map(row =>   // ✅ fixed typo
        row.id === rowId
          ? { ...row, selectedItem: item, itemSearch: item.name, calcPrice: item.unit_price, calcQuantity: item.quantity, showSuggestions: false, rowAdded: true }
          : row
      );

      const currentRow = prev.find(r => r.id === rowId);
      if (!currentRow.rowAdded && !updatedRows.some(r => !r.selectedItem)) {
        return [
          ...updatedRows,
          { id: nextRowId, itemSearch: '', selectedItem: null, calcPrice: '', calcQuantity: '', showSuggestions: false, rowAdded: false }
        ];
      }

      return updatedRows;
    });

    setNextRowId(prev => prev + 1);
  };

  const handleRowChange = (rowId, field, value) => {
    setCalculatorRows(prev =>
      prev.map(row =>
        row.id === rowId
          ? { ...row, [field]: value, ...(field === 'itemSearch' ? { showSuggestions: true, selectedItem: null } : {}) }
          : row
      )
    );

    // Auto-add new row when all fields are filled
    const updatedRows = calculatorRows.map(row =>
      row.id === rowId ? { ...row, [field]: value } : row
    );
    const currentRow = updatedRows.find(r => r.id === rowId);

    if (
      currentRow.selectedItem &&
      currentRow.calcPrice &&
      currentRow.calcQuantity &&
      !currentRow.rowAdded  // only trigger once per row
    ) {
      // All rows are filled, add new empty row
      setCalculatorRows([
        ...updatedRows.map(r => r.id === rowId ? { ...r, rowAdded: true } : r),
        { id: nextRowId, itemSearch: '', selectedItem: null, calcPrice: '', calcQuantity: '', showSuggestions: false, rowAdded: false }
      ]);
      setNextRowId(nextRowId + 1);
    }
  };

  const handleRemoveRow = (rowId) => {
    if (calculatorRows.length > 1) {
      setCalculatorRows(calculatorRows.filter(row => row.id !== rowId));
    }
  };

  const calculateRowTotal = (row) => {
    return (Number(row.calcPrice) || 0) * (Number(row.calcQuantity) || 0);
  };

  const calculateGrandTotal = () => {
    return calculatorRows.reduce((sum, row) => sum + calculateRowTotal(row), 0);
  };

  useEffect(() => { fetchStock(); }, []);

  const fetchStock = async () => {
    try {
      const res = await getAllStock();
      setStocks(Array.isArray(res.data) ? res.data : []);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ name: '', unit_price: '0', quantity: '', category: '', size: '', extra: '', product_id: null });
    setProductSearch('');
    setProductSuggestions([]);
    setEditing(null);
  };

  const handleProductSearch = async (value) => {
    setProductSearch(value);
    setForm(f => ({ ...f, product_id: null, name: '', category: '', size: '' }));
    if (value.length > 0) {
      try {
        const res = await productsApi.searchProducts(value, 'stock');
        setProductSuggestions(res.data || []);
      } catch (err) {
        console.error('Error searching products:', err);
      }
    } else {
      setProductSuggestions([]);
    }
  };

  const selectProduct = (p) => {
    setForm(f => ({ ...f, product_id: p.id, name: p.name, category: p.category_name || '', size: p.size || '' }));
    setProductSearch(p.name);
    setProductSuggestions([]);
  };

  const handleSubmit = async () => {
    if (!editing && !form.product_id) return alert('Select an existing Stock product first (add it in Products if it doesn\'t exist yet)!');
    if (!form.name || !form.unit_price) return alert('Name and price are required!');
    try {
      if (editing) {
        await updateStock(editing.id, form);
      } else {
        await createStock(form);
      }
      resetForm();
      setShowForm(false);
      fetchStock();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name, unit_price: item.unit_price,
      quantity: item.quantity, category: item.category || '',
      size: item.size || '', extra: item.extra || '', product_id: item.product_id || null
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this stock item?')) return;
    await deleteStock(id);
    fetchStock();
  };

  const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500";

  // Group stock items by category for the card view (uncategorized items get their own bucket).
  const categoryGroups = stocks.reduce((acc, item) => {
    const key = item.category?.trim() || 'Uncategorized';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const categoryCards = Object.entries(categoryGroups)
    .map(([name, items]) => ({
      name,
      items,
      totalQty: items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0),
      outOfStockCount: items.filter((i) => Number(i.quantity) <= 0).length
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const categoryItems = selectedCategory ? (categoryGroups[selectedCategory] || []) : [];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-8 py-6 flex justify-between items-center">
        <div>
          {selectedCategory ? (
            <>
              <button
                onClick={() => setSelectedCategory(null)}
                className="group inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-gray-100 hover:bg-gray-900 hover:text-white px-3 py-1.5 rounded-full mb-2 transition-colors duration-150"
              >
                <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
                All Categories
              </button>
              <h1 className="text-3xl font-bold text-gray-800">{selectedCategory}</h1>
              <p className="text-gray-600 mt-2">{categoryItems.length} items in stock</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-gray-800">Stock Manager</h1>
              <p className="text-gray-600 mt-2">{stocks.length} items across {categoryCards.length} categories</p>
            </>
          )}
        </div>
        {/* --- BUTTONS --- */}
        <div className="flex gap-2">
          <button onClick={() => setShowCalculator(!showCalculator)}
            className={`px-4 py-2 rounded-lg font-semibold text-sm text-white transition-colors ${showCalculator ? 'bg-gray-600 hover:bg-gray-700' : 'bg-black hover:bg-gray-900'}`}
          >
            {showCalculator ? '✕ Close Calc' : '󱐋 Calculator'}
          </button>

          <button onClick={() => { resetForm(); setShowForm(!showForm); }}
            className={`px-4 py-2 rounded-lg font-semibold text-sm text-white transition-colors ${showForm ? 'bg-gray-600 hover:bg-gray-700' : 'bg-black hover:bg-gray-900'}`}>
            {showForm ? '✕ Cancel' : '+ Add Item'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">

      {/* Price Calculator Card */}
      {/* This says: IF showCalculator is true, THEN show the div below */}
    {showCalculator && (
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
        <h3 className="font-bold">Quick Price Calculator</h3>
        <div className="space-y-3">
          {/* Header Row */}
          <div className="grid grid-cols-5 gap-4 pb-3 border-b border-gray-200">
            <div className="text-sm font-semibold text-gray-700">Item Name</div>
            <div className="text-sm font-semibold text-gray-700">Price (PKR)</div>
            <div className="text-sm font-semibold text-gray-700">Quantity</div>
            <div className="text-sm font-semibold text-gray-700">Gross Total</div>
            <div className="text-sm font-semibold text-gray-700">Action</div>
          </div>

          {/* Calculator Rows */}
          {calculatorRows.map((row, index) => {
            const filteredStocks = getFilteredStocks(row.itemSearch);
            const rowTotal = calculateRowTotal(row);

            return (
              <div key={row.id} className="grid grid-cols-5 gap-4 items-end">
                {/* Column 1: Item Name with Auto-suggest */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search item..."
                    value={row.itemSearch}
                    onChange={(e) => handleRowChange(row.id, 'itemSearch', e.target.value)}
                    onFocus={() => row.itemSearch.length > 0 && filteredStocks.length > 0}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
                  />
                  {row.showSuggestions && row.itemSearch.length > 0 && filteredStocks.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 max-h-40 overflow-y-auto">
                      {filteredStocks.map(item => (
                        <div
                          key={item.id}
                          onClick={() => handleItemSelect(row.id, item)}
                          className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                        >
                          <div className="font-semibold text-sm text-gray-800">{item.name}</div>
                          <div className="text-xs text-gray-500">PKR{Number(item.unit_price).toFixed(0)} × {item.quantity} qty</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Column 2: Per-Item Price */}
                <input
                  type="number"
                  placeholder="Price"
                  value={row.calcPrice}
                  onChange={(e) => handleRowChange(row.id, 'calcPrice', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
                  disabled={!row.selectedItem}
                />

                {/* Column 3: Quantity */}
                <input
                  type="number"
                  placeholder="Quantity"
                  value={row.calcQuantity}
                  onChange={(e) => handleRowChange(row.id, 'calcQuantity', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
                />

                {/* Column 4: Gross Total */}
                <div className="bg-gray-50 rounded px-3 py-2 border border-gray-100">
                  <p className="text-sm font-bold text-gray-900">
                    PKR {rowTotal.toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                  </p>
                </div>

                {/* Column 5: Remove Button */}
                <div>
                  {calculatorRows.length > 1 && (
                    <button
                      onClick={() => handleRemoveRow(row.id)}
                      className="w-full bg-red-50 text-red-600 px-3 py-2 rounded text-xs font-medium hover:bg-red-100"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Grand Total Row */}
          <div className="grid grid-cols-5 gap-4 pt-3 border-t border-gray-200 mt-2">
            <div></div>
            <div></div>
            <div className="text-right font-bold text-gray-800">Grand Total:</div>
            <div className="bg-red-50 rounded px-3 py-2 border border-red-200">
              <p className="text-sm font-bold text-red-900">
                PKR {calculateGrandTotal().toLocaleString('en-PK', { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div></div>
          </div>
        </div>
      </div>)}

      {/* Form */}
      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mb-6">
          <h3 className="font-bold mb-4">{editing ? 'Edit Item' : 'Add New Stock Item'}</h3>
          <div className="grid grid-cols-2 gap-3">
            {editing ? (
              <>
                <input className={inp} placeholder="Item Name *" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
                <input className={inp} placeholder="Category" value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })} />
                <input className={inp} placeholder="Size (e.g. 10ft, 2m)" value={form.size}
                  onChange={e => setForm({ ...form, size: e.target.value })} />
              </>
            ) : (
              <>
                {/* Name is not free-typed here — it's picked from an existing
                    Stock-type product in the catalog, and Category/Size are derived
                    from that product rather than entered independently. */}
                <div className="relative">
                  <input className={inp} placeholder="Search product name *" value={productSearch}
                    onChange={e => handleProductSearch(e.target.value)} />
                  {productSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 max-h-40 overflow-y-auto">
                      {productSuggestions.map(p => (
                        <div key={p.id} onClick={() => selectProduct(p)}
                          className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0 text-sm">
                          <div className="font-medium text-gray-800">{p.name}</div>
                          <div className="text-xs text-gray-500">{p.category_name || '—'}{p.size ? ` · ${p.size}` : ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input className={`${inp} bg-gray-100 text-gray-400`} placeholder="Category (from product)"
                  value={form.category} readOnly />
                <input className={`${inp} bg-gray-100 text-gray-400`} placeholder="Size (from product)"
                  value={form.size} readOnly />
              </>
            )}
            <input className={inp} placeholder="Unit Price *" type="number" value={form.unit_price}
              onChange={e => setForm({ ...form, unit_price: e.target.value })} />
            <input className={inp} placeholder="Quantity" type="number" value={form.quantity}
              onChange={e => setForm({ ...form, quantity: e.target.value })} />
            <input className={inp} placeholder="Extra info" value={form.extra}
              onChange={e => setForm({ ...form, extra: e.target.value })} />
          </div>
          <button onClick={handleSubmit}
            style={ACCENT_GRADIENT_STYLE}
            className="mt-4 text-white px-5 py-2 rounded-lg font-semibold text-sm">
            {editing ? 'Update Item' : 'Save Item'}
          </button>
        </div>
      )}

      {/* Category cards (default view) or items table (drilled into a category) */}
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : stocks.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg">
          No stock items yet. Add your first item!
        </div>
      ) : !selectedCategory ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {categoryCards.map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(cat.name)}
              className={`group text-left bg-white border-l-4 ${CARD_ACCENTS[i % CARD_ACCENTS.length]} border-y border-r border-gray-200 rounded-xl p-5 shadow-md hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200`}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={ACCENT_GRADIENT_STYLE}
                >
                  <Package className="w-5 h-5 text-white" />
                </div>
                {cat.outOfStockCount > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                    {cat.outOfStockCount} out of stock
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-xl text-gray-800 mb-0.5 truncate group-hover:text-[var(--color-accent)] transition-colors">{cat.name}</h3>
              <p className="text-gray-600 text-sm mb-3">{cat.items.length} item{cat.items.length === 1 ? '' : 's'}</p>
              <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-sm font-semibold text-gray-600">Total Quantity</span>
                <span className="text-xl font-semibold text-gray-900">{cat.totalQty}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-6 text-left font-semibold text-gray-700">Name</th>
                  <th className="py-3 px-6 text-left font-semibold text-gray-700">Category</th>
                  <th className="py-3 px-6 text-left font-semibold text-gray-700">Size</th>
                  <th className="py-3 px-6 text-right font-semibold text-gray-700">Unit Price (pkr)</th>
                  <th className="py-3 px-6 text-right font-semibold text-gray-700">Qty</th>
                  <th className="py-3 px-6 text-left font-semibold text-gray-700">Extra</th>
                  <th className="py-3 px-6 text-center font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {categoryItems.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 transition">
                    <td className="py-4 px-6 font-semibold text-gray-800">{item.name}</td>
                    <td className="py-4 px-6 text-gray-700">{item.category || '—'}</td>
                    <td className="py-4 px-6 text-gray-700">{item.size || '—'}</td>
                    <td className="py-4 px-6 text-right text-gray-700 font-semibold">
                      {Number(item.unit_price).toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${item.quantity > 10 ? 'bg-gray-100 text-gray-700' : item.quantity > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {item.quantity}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-gray-500 text-xs">{item.extra || '—'}</td>
                    <td className="py-4 px-6 text-center whitespace-nowrap">
                      <button onClick={() => handleEdit(item)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition font-semibold text-sm mr-2">
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button onClick={() => handleDelete(item.id)}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition font-semibold text-sm">
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}