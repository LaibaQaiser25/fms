import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Tags, Package, Hash, Flag, FileText, Boxes } from 'lucide-react';
import * as productionApi from '../api/productionApi';
import * as stockApi from '../api/stockApi';
import * as productsApi from '../api/productsApi';
import { capitalizeFirstLetter } from '../utils/text';

function AddProductionDirect({ onClose, onSuccess }) {
  const [stockList, setStockList] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [formData, setFormData] = useState({
    product_name: '',
    product_id: null,
    stock_id: '',
    required_quantity: '',
    notes: '',
    priority: 'normal'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedStock, setSelectedStock] = useState(null);
  const productFieldRef = useRef(null);

  useEffect(() => {
    fetchStock();
    fetchProducts();
    fetchCategories();
  }, []);

  useEffect(() => {
    if (!showSuggestions) return;
    const handleClickOutside = (e) => {
      if (productFieldRef.current && !productFieldRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSuggestions]);

  const fetchStock = async () => {
    try {
      const response = await stockApi.getAllStock();
      setStockList(response.data || []);
    } catch (err) {
      console.error('Error fetching stock:', err);
    }
  };

  // Loaded once so the category dropdown can narrow the product list
  // entirely client-side, without a round-trip per keystroke/selection.
  const fetchProducts = async () => {
    try {
      const response = await productsApi.getAllProducts('stock');
      setAllProducts(response.data || []);
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await productsApi.getCategories();
      setCategories(response.data || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const suggestions = useMemo(() => {
    const search = formData.product_name.trim().toLowerCase();
    return allProducts
      .filter(p => !selectedCategoryId || String(p.category_id) === String(selectedCategoryId))
      .filter(p => !search || p.name.toLowerCase().includes(search))
      .slice(0, 8);
  }, [allProducts, formData.product_name, selectedCategoryId]);

  const handleCategoryChange = (categoryId) => {
    setSelectedCategoryId(categoryId);

    // Selected product no longer matches the chosen category — clear it
    // rather than silently submit a mismatched category/product pair.
    if (formData.product_id) {
      const product = allProducts.find(p => p.id === formData.product_id);
      if (categoryId && String(product?.category_id) !== String(categoryId)) {
        setFormData(f => ({ ...f, product_name: '', product_id: null, stock_id: '' }));
        setSelectedStock(null);
      }
    }
  };

  // Suggestions come from the products catalog (always type=stock for production)
  // so any defined stock product is selectable, whether or not it has stock on hand yet.
  const handleProductNameChange = (value) => {
    setFormData({ ...formData, product_name: capitalizeFirstLetter(value), product_id: null, stock_id: '' });
    setSelectedStock(null);
    setShowSuggestions(value.trim().length > 0);
  };

  const selectSuggestion = (product) => {
    const matched = stockList.find((s) => s.product_id === product.id);
    setSelectedStock(matched || null);
    setFormData({
      ...formData,
      product_name: product.name,
      product_id: product.id,
      stock_id: matched ? matched.id : ''
    });
    setSelectedCategoryId(product.category_id ? String(product.category_id) : selectedCategoryId);
    setShowSuggestions(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === 'notes' ? capitalizeFirstLetter(value) : value
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
        product_id: formData.product_id,
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

  const selectedCategoryName = categories.find(c => String(c.id) === String(selectedCategoryId))?.name;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 pointer-events-none">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
              <Boxes className="w-5 h-5 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Create Production Order</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium">
              {error}
            </div>
          )}

          {/* Category — narrows the product picker below */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
              <Tags className="w-3.5 h-3.5 text-gray-400" />
              Category
            </label>
            <select
              value={selectedCategoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 text-sm bg-white"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Product Selection — suggestions from the products catalog (type=stock),
              filtered to the chosen category when one is set */}
          <div className="relative" ref={productFieldRef}>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
              <Package className="w-3.5 h-3.5 text-gray-400" />
              Product Name *
            </label>
            <input
              type="text"
              value={formData.product_name}
              onChange={(e) => handleProductNameChange(e.target.value)}
              placeholder={selectedCategoryName ? `Search within ${selectedCategoryName}...` : 'Search for a product...'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 text-sm"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-52 overflow-y-auto">
                {suggestions.map((product) => {
                  const matched = stockList.find((s) => s.product_id === product.id);
                  const qty = matched ? matched.quantity : 0;
                  return (
                    <div
                      key={product.id}
                      className="px-3 py-2 border-b border-gray-100 last:border-0 hover:bg-red-50 cursor-pointer transition-colors"
                      onClick={() => selectSuggestion(product)}
                      title={product.description || ''}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm text-gray-800">{product.name}</span>
                        {product.category_name && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700">
                            {product.category_name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {product.size && <span>{product.size}</span>}
                        {product.size && <span> · </span>}
                        <span className={qty > 0 ? 'text-gray-500' : 'text-amber-600'}>
                          {qty > 0 ? `Qty: ${qty}` : 'Not currently in stock'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {showSuggestions && formData.product_name && suggestions.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 px-3 py-3 text-xs text-gray-500">
                No {selectedCategoryName ? `${selectedCategoryName} ` : ''}products match "{formData.product_name}"
              </div>
            )}
            {formData.product_id && (
              <p className="text-xs text-gray-500 mt-1.5">
                {selectedStock ? `Current Stock: ${selectedStock.quantity} units` : 'Not currently in stock'}
              </p>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
              <Hash className="w-3.5 h-3.5 text-gray-400" />
              Required Quantity *
            </label>
            <input
              type="number"
              name="required_quantity"
              value={formData.required_quantity}
              onChange={handleInputChange}
              placeholder="Enter quantity"
              min="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 text-sm"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
              <Flag className="w-3.5 h-3.5 text-gray-400" />
              Priority
            </label>
            <select
              name="priority"
              value={formData.priority}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 text-sm bg-white"
            >
              <option value="low">🟢 Low</option>
              <option value="normal">🟡 Normal</option>
              <option value="high">🔴 High</option>
              <option value="urgent">🟣 Urgent</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              Notes / Instructions
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              placeholder="Add any special instructions..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 text-sm"
              rows="3"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
          >
            {loading ? 'Adding...' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddProductionDirect;
