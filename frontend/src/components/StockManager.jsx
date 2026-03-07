import { useEffect, useState } from 'react';
import { getAllStock, createStock, updateStock, deleteStock } from '../api/stockApi';

export default function StockManager() {
  const [stocks, setStocks]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState({
    name: '', unit_price: '', quantity: '', category: '', size: '', extra: ''
  });

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
      setForm({ name: '', unit_price: '', quantity: '', category: '', size: '', extra: '' });
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
        <button onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ name: '', unit_price: '', quantity: '', category: '', size: '', extra: '' }); }}
          className="bg-gray-900 text-white px-4 py-2 rounded font-bold text-sm">
          {showForm ? '✕ Cancel' : '+ Add Item'}
        </button>
      </div>

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
                  <td className="px-4 py-3 font-bold">${Number(item.unit_price).toFixed(0)}</td>
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