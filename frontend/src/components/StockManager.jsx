import { useEffect, useState } from 'react';
import { getAllStock, createStock, updateStock, deleteStock } from '../api/stockApi';

export default function StockManager() {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [form, setForm] = useState({
    name: '', unit_price: '0', quantity: '', category: '', size: '', extra: ''
  });

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

  const handleSubmit = async () => {
    if (!form.name || !form.unit_price) return alert('Name and price are required!');
    try {
      if (editing) {
        await updateStock(editing.id, form);
      } else {
        await createStock(form);
      }
      setForm({ name: '', unit_price: '0', quantity: '', category: '', size: '', extra: '' });
      setEditing(null);
      setShowForm(false);
      fetchStock();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name, unit_price: item.unit_price,
      quantity: item.quantity, category: item.category || '',
      size: item.size || '', extra: item.extra || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this stock item?')) return;
    await deleteStock(id);
    fetchStock();
  };

  const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500";

  return (
    <div className="max-w-5xl mx-auto p-6">

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-extrabold">Stock Manager</h2>
          <p className="text-gray-400 text-sm">{stocks.length} items in stock</p>
        </div>
        {/* --- BUTTONS --- */}
        <div className="flex gap-2">
          <button onClick={() => setShowCalculator(!showCalculator)}
            className={`${showCalculator ? 'bg-gray-900 text-white px-4' : 'bg-gray-900 text-white px-4'} px-4 py-2 rounded font-bold text-sm transition-colors`}
          >
            {showCalculator ? '✕ Close Calc' : '󱐋 Calculator'}
          </button>

          <button onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: '', unit_price: '0', quantity: '', category: '', size: '', extra: '' }); }}
            className="bg-gray-900 text-white px-4 py-2 rounded font-bold text-sm">
            {showForm ? '✕ Cancel' : '+ Add Item'}
          </button>
        </div>
      </div>

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
            <div className="bg-blue-50 rounded px-3 py-2 border border-blue-200">
              <p className="text-sm font-bold text-blue-900">
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
            <input className={inp} placeholder="Item Name *" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className={inp} placeholder="Unit Price *" type="number" value={form.unit_price}
              onChange={e => setForm({ ...form, unit_price: e.target.value })} />
            <input className={inp} placeholder="Quantity" type="number" value={form.quantity}
              onChange={e => setForm({ ...form, quantity: e.target.value })} />
            <input className={inp} placeholder="Category" value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })} />
            <input className={inp} placeholder="Size (e.g. 10ft, 2m)" value={form.size}
              onChange={e => setForm({ ...form, size: e.target.value })} />
            <input className={inp} placeholder="Extra info" value={form.extra}
              onChange={e => setForm({ ...form, extra: e.target.value })} />
          </div>
          <button onClick={handleSubmit}
            className="mt-4 bg-gray-900 text-white px-5 py-2 rounded font-bold text-sm">
            {editing ? 'Update Item' : 'Save Item'}
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : stocks.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg">
          No stock items yet. Add your first item!
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Name', 'Category', 'Size', 'Unit Price', 'Qty', 'Extra', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-bold text-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stocks.map(item => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{item.name}</td>
                  <td className="px-4 py-3 text-gray-500">{item.category || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{item.size || '—'}</td>
                  <td className="px-4 py-3 font-bold">pkr{Number(item.unit_price).toFixed(0)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.quantity > 10 ? 'bg-green-100 text-green-700' : item.quantity > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                      {item.quantity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{item.extra || '—'}</td>
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