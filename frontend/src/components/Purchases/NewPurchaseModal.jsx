import React, { useState, useContext } from 'react';
import { X } from 'lucide-react';
import * as purchasesApi from '../../api/purchasesApi';
import { AlertRefreshContext } from '../Layout';

function NewPurchaseModal({ onClose, onSuccess }) {
  const alertRefresh = useContext(AlertRefreshContext);

  const [sellerName, setSellerName] = useState('');
  const [category, setCategory] = useState('stock');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const inp = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-violet-500';

  const handleSubmit = async () => {
    if (!sellerName.trim()) {
      return alert('⚠️ Please enter the seller name');
    }

    if (!category) {
      return alert('⚠️ Please select a category');
    }

    if (!quantity || Number(quantity) <= 0) {
      return alert('⚠️ Please enter a valid quantity');
    }

    if (!price || Number(price) <= 0) {
      return alert('⚠️ Please enter a valid price');
    }

    if (!date) {
      return alert('⚠️ Please select a date');
    }

    setLoading(true);
    try {
      const purchaseData = {
        seller_name: sellerName.trim(),
        category,
        quantity: Number(quantity),
        price: Number(price),
        date,
        notes: notes.trim()
      };

      await purchasesApi.createPurchase(purchaseData);
      alert('✅ Purchase created successfully!');
      alertRefresh?.fetchAlerts?.();
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('❌ Error:', err.response?.data || err.message);
      alert('❌ Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex z-50 overflow-y-auto">
      <div className="bg-white w-full h-screen flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-extrabold text-gray-800">New Purchase</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <div className="flex-1 p-6 overflow-hidden flex flex-col">
          <div className="grid grid-cols-3 gap-6 flex-1 overflow-y-auto">
            <div className="col-span-2 pr-4">
              <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
                <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Purchase Details</h3>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Seller Name</label>
                    <input
                      type="text"
                      className={inp}
                      placeholder="Enter seller name *"
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
                    <select
                      className={inp}
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="stock">Stock</option>
                      <option value="production">Production</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      className={inp}
                      placeholder="Enter quantity"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Price</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inp}
                      placeholder="Enter price"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    className={inp}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any additional notes..."
                    className={`${inp} resize-none`}
                    rows="4"
                  />
                </div>
              </div>
            </div>

            <div className="col-span-1">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 sticky top-0">
                <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Summary</h3>

                <div className="mb-4 p-3 bg-white rounded border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-700 font-semibold">Total Amount:</span>
                    <span className="text-2xl font-extrabold text-gray-800">
                      pkr{((Number(price) || 0) * (Number(quantity) || 0)).toFixed(0)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Category: {category === 'stock' ? 'Stock' : 'Production'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-violet-600 text-white py-3 rounded font-bold text-sm hover:bg-violet-700 transition disabled:bg-violet-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Purchase'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewPurchaseModal;
