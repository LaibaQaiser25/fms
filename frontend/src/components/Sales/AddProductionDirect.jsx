import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import * as productionApi from '../../api/productionApi';
import * as stockApi from '../../api/stockApi';

function AddProductionDirect({ onClose, onSuccess }) {
  const [stockList, setStockList] = useState([]);
  const [formData, setFormData] = useState({
    product_name: '',
    stock_id: '',
    required_quantity: '',
    notes: '',
    priority: 'normal'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedStock, setSelectedStock] = useState(null);

  useEffect(() => {
    fetchStock();
  }, []);

  const fetchStock = async () => {
    try {
      const response = await stockApi.getAllStock();
      setStockList(response.data || []);
    } catch (err) {
      console.error('Error fetching stock:', err);
    }
  };

  const handleStockChange = (e) => {
    const stockId = e.target.value;
    const stock = stockList.find(s => s.id === parseInt(stockId));
    setSelectedStock(stock);
    setFormData({
      ...formData,
      stock_id: stockId,
      product_name: stock ? stock.name : ''
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      if (!formData.product_name || !formData.required_quantity) {
        setError('Please fill in all required fields');
        setLoading(false);
        return;
      }

      const required_qty = parseInt(formData.required_quantity);
      if (required_qty <= 0) {
        setError('Quantity must be greater than 0');
        setLoading(false);
        return;
      }

      const productionData = {
        product_name: formData.product_name,
        stock_id: formData.stock_id ? parseInt(formData.stock_id) : null,
        required_quantity: required_qty,
        notes: formData.notes,
        priority: formData.priority
      };

      await productionApi.addToQueue(productionData);
      
      onSuccess?.();
      alert('✅ Production order added successfully!');
      onClose();
    } catch (err) {
      console.error('Error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to add production order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 pointer-events-none">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-800">Create Production Order</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          {/* Product Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Select Stock Item *
            </label>
            <select
              value={formData.stock_id}
              onChange={handleStockChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="">-- Select a product --</option>
              {stockList.map(stock => (
                <option key={stock.id} value={stock.id}>
                  {stock.name} (Qty: {stock.quantity})
                </option>
              ))}
            </select>
          </div>

          {/* Product Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Product Name *
            </label>
            <input
              type="text"
              name="product_name"
              value={formData.product_name}
              onChange={handleInputChange}
              placeholder="Enter product name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Required Quantity *
            </label>
            <input
              type="number"
              name="required_quantity"
              value={formData.required_quantity}
              onChange={handleInputChange}
              placeholder="Enter quantity"
              min="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Priority</label>
            <select
              name="priority"
              value={formData.priority}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <option value="low">🟢 Low</option>
              <option value="normal">🟡 Normal</option>
              <option value="high">🔴 High</option>
              <option value="urgent">🟣 Urgent</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Notes / Instructions</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              placeholder="Add any special instructions..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
              rows="3"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
          >
            {loading ? 'Adding...' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddProductionDirect;
