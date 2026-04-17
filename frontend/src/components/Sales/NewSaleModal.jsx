import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import * as customersApi from '../../api/customersApi';
import * as stockApi from '../../api/stockApi';
import * as salesApi from '../../api/salesApi';
import AddProductionForm from './AddProductionForm';

function NewSaleModal({ onClose }) {
  // Customer Info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Sale Items
  const [items, setItems] = useState([{ description: '', price: '', quantity: '', availableQty: undefined, stock_id: null }]);
  const [suggestions, setSuggestions] = useState({});
  const [stockList, setStockList] = useState([]);
  const [itemsError, setItemsError] = useState('');

  // Payment
  const [paymentType, setPaymentType] = useState('Cash');
  const [advancePaid, setAdvancePaid] = useState('');
  const [notes, setNotes] = useState('');
  const [showProductionForm, setShowProductionForm] = useState(false);
  const [productionItemToAdd, setProductionItemToAdd] = useState(null);

  // Submission
  const [loading, setLoading] = useState(false);

  // Initialize
  useEffect(() => {
    fetchStock();
  }, []);

  const fetchStock = async () => {
    try {
      const response = await stockApi.getAllStock();
      setStockList(response.data || []);
    } catch (error) {
      console.error('Error fetching stock:', error);
    }
  };

  // Customer search and selection
  const handleCustomerSearch = async (value) => {
    setCustomerSearch(value);
    setCustomerName(value);
    setSelectedCustomer(null); // reset selected when typing again
    if (value.length > 0) {
      try {
        const response = await customersApi.searchCustomers(value, 10);
        setCustomers(response.data.data || []);
        setShowCustomerDropdown(true);
      } catch (error) {
        console.error('Error searching customers:', error);
      }
    } else {
      setShowCustomerDropdown(false);
    }
  };

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone || '');
    setCustomerAddress(customer.address || '');
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
  };

  const createNewCustomer = async () => {
    if (!customerName.trim()) return;
    try {
      const response = await customersApi.createCustomer({ 
        name: customerName,
        phone: customerPhone,
        address: customerAddress
      });
      setSelectedCustomer(response.data.data);
      setShowCustomerDropdown(false);
    } catch (error) {
      console.error('Error creating customer:', error);
    }
  };

  // Item handling
  const handleDescriptionChange = async (index, value) => {
    const newItems = [...items];
    newItems[index].description = value;
    setItems(newItems);

    // Search suggestions
    if (value.length > 0) {
      try {
        const response = await stockApi.searchStock(value);
        setSuggestions({
          ...suggestions,
          [index]: response.data || []
        });
      } catch (error) {
        console.error('Error searching stock:', error);
      }
    } else {
      setSuggestions({ ...suggestions, [index]: [] });
    }
  };

  const selectSuggestion = (index, stock) => {
    const newItems = [...items];
    newItems[index] = {
      description: stock.name,
      price: stock.unit_price || '',
      quantity: newItems[index].quantity || 1,
      availableQty: stock.quantity,
      stock_id: stock.id
    };
    setItems(newItems);
    setSuggestions({ ...suggestions, [index]: [] });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { description: '', price: '', quantity: '', availableQty: undefined, stock_id: null }]);
  };

  const removeItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems.length > 0 ? newItems : [{ description: '', price: '', quantity: '', availableQty: undefined, stock_id: null }]);
  };

  const handleAddToProduction = (item, index) => {
    setProductionItemToAdd({ ...item, index });
    setShowProductionForm(true);
  };

  const handleProductionSubmit = async (productionData) => {
    setShowProductionForm(false);
    setProductionItemToAdd(null);
  };

  // Calculate totals
  const total = items.reduce((sum, item) => {
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    return sum + (price * qty);
  }, 0);

  const advance = Number(advancePaid) || 0;
  const balance = total - advance;

  const handleSubmit = async () => {
    // Check stock before saving
    const overStock = items.find(i =>
      i.availableQty !== undefined && Number(i.quantity) > Number(i.availableQty)
    );
    if (overStock) return alert(`⚠️ "${overStock.description}" exceeds available stock of ${overStock.availableQty} units!`);

    // ✅ FIX: If no customer selected but name is typed, auto-create customer
    let customer = selectedCustomer;

    if (!customer && customerName.trim()) {
      try {
        const response = await customersApi.createCustomer({
          name: customerName,
          phone: customerPhone,
          address: customerAddress
        });
        customer = response.data.data;
        setSelectedCustomer(customer);
      } catch (err) {
        console.error('Error creating customer:', err);
        return alert('❌ Failed to create customer. Please try again.');
      }
    }

    // Validate after attempting customer creation
    if (!customer) {
      return alert('⚠️ Please enter a customer name');
    }

    if (items.length === 0 || !items.some(i => i.description && i.price && i.quantity)) {
      return alert('⚠️ Please add at least one item with description, price and quantity');
    }

    setLoading(true);
    try {
      const saleData = {
        customer_id: customer.id,
        customer_name: customer.name || customerName,
        phone: customerPhone,
        address: customerAddress,
        items: items
          .filter(i => i.description && i.price && i.quantity)
          .map(i => ({
            stock_id: i.stock_id,
            product_name: i.description,
            quantity: Number(i.quantity),
            unit_price: Number(i.price),
            description: i.description
          })),
        total_amount: total,
        advance_paid: advance,
        payment_type: paymentType,
        notes
      };

      await salesApi.createSale(saleData);
      alert('✅ Sale created successfully!');
      onClose();
    } catch (err) {
      console.error('❌ Error:', err.response?.data || err.message);
      alert('❌ Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-6">
      <div className="bg-white rounded-lg shadow-xl w-11/12 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-extrabold text-gray-800">New Sale</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {/* Customer Info Section */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
            <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Customer Info</h3>
            
            {/* Customer Search */}
            <div className="mb-4 relative">
              <input 
                type="text"
                className={`${inp} mb-2`} 
                placeholder="Search or create customer *"
                value={customerSearch}
                onChange={(e) => handleCustomerSearch(e.target.value)}
              />
              {showCustomerDropdown && customers.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-10 max-h-48 overflow-y-auto">
                  {customers.map(customer => (
                    <div 
                      key={customer.id} 
                      onClick={() => selectCustomer(customer)}
                      className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                    >
                      <div className="font-semibold text-sm text-gray-800">{customer.name}</div>
                      <div className="text-xs text-gray-500">{customer.phone || 'No phone'}</div>
                    </div>
                  ))}
                  {customerName && (
                    <button 
                      onClick={createNewCustomer}
                      className="w-full text-left px-3 py-2 bg-blue-50 text-blue-600 font-semibold text-sm border-t border-gray-100 hover:bg-blue-100"
                    >
                      + Create New: {customerName}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Customer Details */}
            {selectedCustomer && (
              <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
                <p className="text-sm font-semibold text-gray-700 mb-1">Selected: <span className="text-blue-600">{selectedCustomer.name}</span></p>
                <p className="text-xs text-gray-600">{selectedCustomer.phone || ''}</p>
              </div>
            )}

            {/* Customer Manual Input */}
            <div className="grid grid-cols-3 gap-2">
              <input className={`${inp}`} placeholder="Customer Name *"
                value={customerName} onChange={e => setCustomerName(e.target.value)} />
              <input className={`${inp}`} placeholder="Phone"
                value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
              <input className={`${inp}`} placeholder="Address"
                value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
            </div>
          </div>

          {/* Items Section */}
          <div className="mb-6">
            <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Items</h3>
            {items.map((item, i) => (
              <div key={i} className="mb-4">
                <div className="flex gap-2 mb-1">
                  {/* Description with autocomplete */}
                  <div className="flex-2 relative">
                    <input 
                      className={inp} 
                      placeholder="Item description..."
                      value={item.description}
                      onChange={e => handleDescriptionChange(i, e.target.value)} 
                    />
                    {/* Suggestions dropdown */}
                    {suggestions[i]?.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-b shadow-lg z-10 max-h-40 overflow-y-auto">
                        {suggestions[i].map(stock => (
                          <div 
                            key={stock.id} 
                            onClick={() => selectSuggestion(i, stock)}
                            className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                          >
                            <div className="font-medium text-sm text-gray-800">{stock.name}</div>
                            <div className="text-xs text-gray-500">
                              pkr{Number(stock.unit_price).toFixed(0)} · Stock: {stock.quantity}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Price */}
                  <input 
                    className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Price" 
                    type="number" 
                    value={item.price}
                    onChange={e => updateItem(i, 'price', e.target.value)} 
                  />

                  {/* Quantity */}
                  <input 
                    className="w-20 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Qty" 
                    type="number" 
                    min="1" 
                    value={item.quantity}
                    onChange={e => updateItem(i, 'quantity', e.target.value)} 
                  />

                  {items.length > 1 &&
                    <button 
                      onClick={() => removeItem(i)}
                      className="bg-red-100 text-red-600 px-3 rounded text-sm hover:bg-red-200 transition"
                    >
                      ✕
                    </button>
                  }
                </div>

                {/* Amount preview + stock warning */}
                {item.price && item.quantity && (
                  <div className="pr-2">
                    <div className="text-right text-xs text-gray-500 mb-1">
                      Amount: <span className="font-bold text-gray-700">
                        pkr{(Number(item.price) * Number(item.quantity)).toFixed(0)}
                      </span>
                    </div>
                    {item.availableQty !== undefined && Number(item.quantity) > Number(item.availableQty) && (
                      <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-red-500">⚠️</span>
                          <span className="text-red-600 text-xs font-medium">
                            Exceeds stock! Only <strong>{item.availableQty}</strong> units available.
                          </span>
                        </div>
                        <button 
                          onClick={() => handleAddToProduction(item, i)}
                          className="ml-2 px-2 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 transition whitespace-nowrap font-semibold"
                        >
                          Add to Production
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <button 
              onClick={addItem}
              className="text-sm border border-gray-300 px-4 py-2 rounded hover:bg-gray-50 font-medium transition"
            >
              + Add Item
            </button>
          </div>

          {/* Payment Section */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
            <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Payment</h3>

            {/* Total Summary */}
            <div className="mb-4 p-3 bg-white rounded border border-gray-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-700 font-semibold">Grand Total:</span>
                <span className="text-2xl font-extrabold text-gray-800">pkr{total.toFixed(0)}</span>
              </div>
            </div>

            {/* Payment Type */}
            <div className="mb-4">
              <p className="text-sm font-semibold text-gray-700 mb-2">Payment Type</p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    value="Cash" 
                    checked={paymentType === 'Cash'}
                    onChange={(e) => setPaymentType(e.target.value)}
                    className="cursor-pointer"
                  />
                  <span className="text-gray-700 text-sm">Cash</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    value="Udhaar" 
                    checked={paymentType === 'Udhaar'}
                    onChange={(e) => setPaymentType(e.target.value)}
                    className="cursor-pointer"
                  />
                  <span className="text-gray-700 text-sm">Udhaar (Credit)</span>
                </label>
              </div>
            </div>

            {/* Advance Amount */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Advance Amount Received</label>
              <input 
                type="number" 
                placeholder="0"
                value={advancePaid} 
                onChange={e => setAdvancePaid(e.target.value)}
                className={inp}
                min="0"
                max={total}
              />
              {total > 0 && (
                <p className="text-xs text-gray-600 mt-1">
                  Balance Due: <span className="font-bold text-red-600">pkr{balance.toFixed(0)}</span>
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
              <textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional notes..."
                className={`${inp} resize-none`}
                rows="2"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button 
            onClick={handleSubmit} 
            disabled={loading}
            className="w-full bg-gray-900 text-white py-3 rounded font-bold text-sm hover:bg-gray-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Save Sale'}
          </button>
        </div>
      </div>

      {/* Production Form Modal */}
      {showProductionForm && productionItemToAdd && (
        <AddProductionForm
          item={productionItemToAdd}
          onClose={() => setShowProductionForm(false)}
          onSubmit={handleProductionSubmit}
        />
      )}
    </div>
  );
}

export default NewSaleModal;