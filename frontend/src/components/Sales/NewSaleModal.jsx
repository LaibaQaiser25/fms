import React, { useState, useEffect, useContext } from 'react';
import { X, AlertCircle } from 'lucide-react';
import * as customersApi from '../../api/customersApi';
import * as stockApi from '../../api/stockApi';
import * as productsApi from '../../api/productsApi';
import * as salesApi from '../../api/salesApi';
import { AlertRefreshContext } from '../Layout';
import { capitalizeFirstLetter, capitalizeWords, capitalizeAddress } from '../../utils/text';
import { PAYMENT_METHODS, PAKISTANI_BANKS } from '../../paymentOptions';

function NewSaleModal({ onClose }) {
  const alertRefresh = useContext(AlertRefreshContext);
  // Customer Info
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showPhoneDropdown, setShowPhoneDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Sale Items
  const emptyItem = { description: '', price: '', quantity: '', availableQty: undefined, product_id: null, stock_id: null };
  const [items, setItems] = useState([emptyItem]);
  const [suggestions, setSuggestions] = useState({});
  const [stockList, setStockList] = useState([]);
  const [itemsError, setItemsError] = useState('');

  // Payment
  const [paymentType, setPaymentType] = useState('Cash');
  const [bankName, setBankName] = useState('');
  const [advancePaid, setAdvancePaid] = useState('');
  const [notes, setNotes] = useState('');

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
    const capitalizedValue = capitalizeWords(value);
    setCustomerSearch(capitalizedValue);
    setCustomerName(capitalizedValue);
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

  // Phone doubles as a search field — but only while no name has been typed yet, so
  // typing a phone number first surfaces matching customers the same way typing a name
  // does (the backend's /customers/search already matches on name OR phone).
  const handlePhoneSearch = async (value) => {
    setCustomerPhone(value);
    setSelectedCustomer(null);
    if (!customerSearch && value.length > 0) {
      try {
        const response = await customersApi.searchCustomers(value, 10);
        setCustomers(response.data.data || []);
        setShowPhoneDropdown(true);
      } catch (error) {
        console.error('Error searching customers by phone:', error);
      }
    } else {
      setShowPhoneDropdown(false);
    }
  };

  const selectCustomer = async (customer) => {
    try {
      // Fetch full customer details to ensure phone and address are populated
      const response = await customersApi.getCustomer(customer.id);
      const fullCustomer = response.data?.data || response.data || customer;

      setSelectedCustomer(fullCustomer);
      setCustomerName(fullCustomer.name);
      setCustomerPhone(fullCustomer.phone || '');
      setCustomerAddress(fullCustomer.address || '');
      setCustomerSearch(fullCustomer.name);
      setShowCustomerDropdown(false);
      setShowPhoneDropdown(false);
    } catch (error) {
      console.error('Error fetching customer details:', error);
      // Fallback to search result
      setSelectedCustomer(customer);
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone || '');
      setCustomerAddress(customer.address || '');
      setCustomerSearch(customer.name);
      setShowCustomerDropdown(false);
      setShowPhoneDropdown(false);
    }
  };

  // Item handling — suggestions come from the products catalog (Stock-type only) so
  // any defined product is selectable, whether or not it has stock on hand yet.
  const handleDescriptionChange = async (index, value) => {
    const newItems = [...items];
    newItems[index].description = capitalizeFirstLetter(value);
    setItems(newItems);

    if (value.length > 0) {
      try {
        const response = await productsApi.searchProducts(value, 'stock');
        setSuggestions({
          ...suggestions,
          [index]: response.data || []
        });
      } catch (error) {
        console.error('Error searching products:', error);
      }
    } else {
      setSuggestions({ ...suggestions, [index]: [] });
    }
  };

  const selectSuggestion = (index, product) => {
    // Availability is looked up client-side against the already-fetched stock list —
    // a product with no matching row just means stock_id/availableQty stay unset.
    const matchedStock = stockList.find((s) => s.product_id === product.id);

    const newItems = [...items];
    newItems[index] = {
      description: product.name,
      price: matchedStock ? matchedStock.unit_price : '',
      quantity: 1,
      availableQty: matchedStock ? matchedStock.quantity : 0,
      product_id: product.id,
      stock_id: matchedStock ? matchedStock.id : null
    };
    setItems(newItems);
    setSuggestions({ ...suggestions, [index]: [] });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  // Check if item exceeds available stock
  const isItemOverStock = (item) => {
    return item.stock_id && item.availableQty !== undefined && Number(item.quantity) > Number(item.availableQty);
  };

  const addItem = () => {
    // Only allow adding a new row once the current last one has a catalog product
    // picked — stock availability no longer gates this.
    const hasSelectedItem = items.some(i => i.product_id);
    if (!hasSelectedItem) {
      return alert('⚠️ Please select at least one item from the suggestions before adding another item');
    }
    setItems([...items, emptyItem]);
  };

  const removeItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems.length > 0 ? newItems : [emptyItem]);
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
    // Validate customer info is present (either an existing customer was picked,
    // or enough info was typed in to create one)
    if (!selectedCustomer && (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim())) {
      return alert('⚠️ Please provide customer name, phone, and address');
    }

    // Validate that at least one item was picked from the product suggestions —
    // stock availability is informational only and no longer gates submission.
    const validItems = items.filter(i => i.product_id && i.quantity && i.price);
    if (validItems.length === 0) {
      return alert('⚠️ Please select at least one item from the suggestions.');
    }

    const allItemsValid = validItems.every(i => i.product_id && i.description && i.price && i.quantity);
    if (!allItemsValid) {
      return alert('⚠️ All items must be selected from the suggestions with quantity specified');
    }

    if (paymentType === 'Bank Transfer' && !bankName) {
      return alert('⚠️ Please select a bank');
    }

    setLoading(true);
    try {
      let customer = selectedCustomer;
      if (!customer) {
        const customerResponse = await customersApi.createCustomer({
          name: customerName,
          phone: customerPhone,
          address: customerAddress
        });
        customer = customerResponse.data.data;
      }

      const saleData = {
        customer_id: customer.id,
        customer_name: customer.name,
        phone: customer.phone || '',
        address: customer.address || '',
        items: validItems.map(i => ({
          stock_id: i.stock_id,
          product_name: i.description,
          quantity: Number(i.quantity),
          unit_price: Number(i.price),
          description: i.description
        })),
        total_amount: total,
        advance_paid: advance,
        payment_type: paymentType,
        bank_name: paymentType === 'Bank Transfer' ? bankName : null,
        notes
      };

      await salesApi.createSale(saleData);
      alert('✅ Sale created successfully!');
      alertRefresh?.fetchAlerts();
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex z-50 overflow-y-auto">
      <div className="bg-white w-full h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-2xl font-extrabold text-gray-800">New Sale</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-hidden flex flex-col">
          <div className="grid grid-cols-3 gap-6 flex-1 overflow-y-auto">
            {/* Left Column - Customer Info & Items */}
            <div className="col-span-2 pr-4">
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
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.target.blur();
                      }
                    }}
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input className={`${inp}`} placeholder="Phone"
                      value={customerPhone}
                      onChange={e => handlePhoneSearch(e.target.value)}
                      onBlur={() => setTimeout(() => setShowPhoneDropdown(false), 150)}
                    />
                    {showPhoneDropdown && customers.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-10 max-h-48 overflow-y-auto">
                        {customers.map(customer => (
                          <div
                            key={customer.id}
                            onClick={() => selectCustomer(customer)}
                            className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                          >
                            <div className="font-semibold text-sm text-gray-800">{customer.phone}</div>
                            <div className="text-xs text-gray-500">{customer.name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <input className={`${inp}`} placeholder="Address"
                    value={customerAddress} onChange={e => setCustomerAddress(capitalizeAddress(e.target.value))} />
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
                        {/* Suggestions dropdown — names only; availability shows
                            after selection, not while browsing */}
                        {suggestions[i]?.length > 0 && (
                          <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-b shadow-lg z-10 max-h-40 overflow-y-auto">
                            {suggestions[i].map(product => (
                              <div
                                key={product.id}
                                className="px-3 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer"
                                onClick={() => selectSuggestion(i, product)}
                                title={product.description || ''}
                              >
                                <div className="font-medium text-sm text-gray-800">{product.name}</div>
                                {(product.size || product.description) && (
                                  <div className="text-xs text-gray-500 truncate">
                                    {product.size && <span>{product.size}</span>}
                                    {product.size && product.description && <span> · </span>}
                                    {product.description && <span>{product.description}</span>}
                                  </div>
                                )}
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
                        onWheel={e => e.target.blur()}
                      />

                      {/* Quantity */}
                      <input
                        className={`w-20 border rounded px-3 py-2 text-sm focus:outline-none ${isItemOverStock(item)
                          ? 'border-red-500 bg-red-50 focus:border-red-600'
                          : 'border-gray-300 focus:border-blue-500'
                          }`}
                        placeholder="Qty"
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateItem(i, 'quantity', e.target.value)}
                        onWheel={e => e.target.blur()}
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
                        {item.product_id && i === items.length - 1 && (
                          <div>
                            {item.stock_id === null ? (
                              <div className="text-xs text-gray-500 mt-1">
                                Not currently in stock — sale can still be recorded.
                              </div>
                            ) : isItemOverStock(item) ? (
                              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded px-3 py-2 mt-1">
                                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                <span className="text-xs text-red-600 font-medium">
                                  Exceeds stock! Only <strong>{item.availableQty}</strong> units available.
                                </span>
                              </div>
                            ) : (
                              <div className="text-xs text-green-600 mt-1">
                                ✓ Available Stock: <span className="font-bold">{item.availableQty} units</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {/* End amount preview */}

                  </div>
                  // End <div key={i} className="mb-4">
                ))}
                {/* End items.map */}

                <button
                  onClick={addItem}
                  disabled={!items.some(i => i.product_id)}
                  className="text-sm border border-gray-300 px-4 py-2 rounded hover:bg-gray-50 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                >
                  + Add Item
                </button>
              </div>
            </div>

            {/* Right Column - Payment */}
            <div className="col-span-1">
              {/* Payment Section */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 sticky top-0">
                <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Payment</h3>

                {/* Total Summary */}
                <div className="mb-4 p-3 bg-white rounded border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-700 font-semibold">Grand Total:</span>
                    <span className="text-2xl font-extrabold text-gray-800">pkr{total.toFixed(0)}</span>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
                  <select
                    value={paymentType}
                    onChange={(e) => { setPaymentType(e.target.value); setBankName(''); }}
                    className={inp}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                {paymentType === 'Bank Transfer' && (
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Bank *</label>
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className={inp}
                    >
                      <option value="">-- Select Bank --</option>
                      {PAKISTANI_BANKS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Advance Amount */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Advance Amount Received</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={advancePaid}
                    onChange={e => setAdvancePaid(e.target.value)}
                    onWheel={e => e.target.blur()}
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
            </div>
          </div>

          {/* Submit Button - Fixed at Bottom */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-gray-900 text-white py-3 rounded font-bold text-sm hover:bg-gray-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Sale'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewSaleModal;