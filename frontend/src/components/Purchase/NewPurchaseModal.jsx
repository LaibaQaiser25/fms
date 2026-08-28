import React, { useState, useEffect, useContext } from 'react';
import { X } from 'lucide-react';
import * as sellersApi from '../../api/sellersApi';
import * as stockApi from '../../api/stockApi';
import * as rawMaterialsApi from '../../api/rawMaterialsApi';
import * as purchaseApi from '../../api/purchaseApi';
import { AlertRefreshContext } from '../Layout';
import { capitalizeFirstLetter } from '../../utils/text';

function NewPurchaseModal({ onClose }) {
  const alertRefresh = useContext(AlertRefreshContext);
  // Seller Info
  const [sellerName, setSellerName] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [sellerAddress, setSellerAddress] = useState('');
  const [sellerSearch, setSellerSearch] = useState('');
  const [sellers, setSellers] = useState([]);
  const [showSellerDropdown, setShowSellerDropdown] = useState(false);
  const [showSellerPhoneDropdown, setShowSellerPhoneDropdown] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState(null);

  // Purchase classification
  const [category, setCategory] = useState('stock-ready');
  const [type, setType] = useState('');

  // Purchase Items
  const [items, setItems] = useState([{ description: '', price: '', quantity: '', stock_id: null, raw_material_id: null, unit: '' }]);
  const [suggestions, setSuggestions] = useState({});
  const [stockList, setStockList] = useState([]);

  // Payment
  const [paymentType, setPaymentType] = useState('Cash');
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

  // Seller search and selection
  const handleSellerSearch = async (value) => {
    const capitalizedValue = capitalizeFirstLetter(value);
    setSellerSearch(capitalizedValue);
    setSellerName(capitalizedValue);
    setSelectedSeller(null); // reset selected when typing again
    if (value.length > 0) {
      try {
        const response = await sellersApi.searchSellers(value, 10);
        setSellers(response.data.data || []);
        setShowSellerDropdown(true);
      } catch (error) {
        console.error('Error searching sellers:', error);
      }
    } else {
      setShowSellerDropdown(false);
    }
  };

  // Phone doubles as a search field — but only while no name has been typed yet, so
  // typing a phone number first surfaces matching sellers the same way typing a name
  // does (the backend's /sellers/search already matches on name OR phone).
  const handleSellerPhoneSearch = async (value) => {
    setSellerPhone(value);
    setSelectedSeller(null);
    if (!sellerSearch && value.length > 0) {
      try {
        const response = await sellersApi.searchSellers(value, 10);
        setSellers(response.data.data || []);
        setShowSellerPhoneDropdown(true);
      } catch (error) {
        console.error('Error searching sellers by phone:', error);
      }
    } else {
      setShowSellerPhoneDropdown(false);
    }
  };

  const selectSeller = async (seller) => {
    try {
      // Fetch full seller details to ensure phone and address are populated
      const response = await sellersApi.getSeller(seller.id);
      const fullSeller = response.data?.data || response.data || seller;

      setSelectedSeller(fullSeller);
      setSellerName(fullSeller.name);
      setSellerPhone(fullSeller.phone || '');
      setSellerAddress(fullSeller.address || '');
      setSellerSearch(fullSeller.name);
      setShowSellerDropdown(false);
      setShowSellerPhoneDropdown(false);
    } catch (error) {
      console.error('Error fetching seller details:', error);
      // Fallback to search result
      setSelectedSeller(seller);
      setSellerName(seller.name);
      setSellerPhone(seller.phone || '');
      setSellerAddress(seller.address || '');
      setSellerSearch(seller.name);
      setShowSellerDropdown(false);
      setShowSellerPhoneDropdown(false);
    }
  };

  // Item handling
  const handleDescriptionChange = async (index, value) => {
    const newItems = [...items];
    newItems[index].description = capitalizeFirstLetter(value);
    newItems[index].stock_id = null;
    newItems[index].raw_material_id = null;
    setItems(newItems);

    // Search suggestions — existing stock for stock-ready, raw materials otherwise
    if (value.length > 0) {
      try {
        if (category === 'raw-material') {
          const response = await rawMaterialsApi.searchRawMaterials(value);
          setSuggestions({
            ...suggestions,
            [index]: response.data.data || []
          });
        } else {
          const response = await stockApi.searchStock(value);
          setSuggestions({
            ...suggestions,
            [index]: response.data || []
          });
        }
      } catch (error) {
        console.error('Error searching items:', error);
      }
    } else {
      setSuggestions({ ...suggestions, [index]: [] });
    }
  };

  const selectSuggestion = (index, suggestion) => {
    const newItems = [...items];
    if (category === 'raw-material') {
      newItems[index] = {
        description: suggestion.name,
        price: suggestion.unit_price || '',
        quantity: newItems[index].quantity || 1,
        stock_id: null,
        raw_material_id: suggestion.id,
        unit: suggestion.unit || ''
      };
    } else {
      newItems[index] = {
        description: suggestion.name,
        price: suggestion.unit_price || '',
        quantity: newItems[index].quantity || 1,
        stock_id: suggestion.id,
        raw_material_id: null,
        unit: ''
      };
    }
    setItems(newItems);
    setSuggestions({ ...suggestions, [index]: [] });
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { description: '', price: '', quantity: '', stock_id: null, raw_material_id: null, unit: '' }]);
  };

  const removeItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems.length > 0 ? newItems : [{ description: '', price: '', quantity: '', stock_id: null, raw_material_id: null, unit: '' }]);
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
    // Validate seller info is present (either an existing seller was picked,
    // or enough info was typed in to create one)
    if (!selectedSeller && (!sellerName.trim() || !sellerPhone.trim() || !sellerAddress.trim())) {
      return alert('⚠️ Please provide seller name, phone, and address');
    }

    // Validate items
    const validItems = items.filter(i => i.description && i.quantity && i.price);
    if (validItems.length === 0) {
      return alert('⚠️ Please add at least one item with a description, price, and quantity');
    }

    setLoading(true);
    try {
      let seller = selectedSeller;
      if (!seller) {
        const sellerResponse = await sellersApi.createSeller({
          name: sellerName,
          phone: sellerPhone,
          address: sellerAddress
        });
        seller = sellerResponse.data.data;
      }

      const purchaseData = {
        seller_id: seller.id,
        seller_name: seller.name,
        phone: seller.phone || '',
        address: seller.address || '',
        category,
        type: type || null,
        items: validItems.map(i => ({
          stock_id: i.stock_id,
          raw_material_id: i.raw_material_id,
          unit: i.unit || null,
          product_name: i.description,
          quantity: Number(i.quantity),
          price: Number(i.price),
          description: i.description
        })),
        total_amount: total,
        advance_paid: advance,
        payment_type: paymentType,
        notes
      };

      await purchaseApi.createPurchase(purchaseData);
      alert('✅ Purchase created successfully!');
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
          <h2 className="text-2xl font-extrabold text-gray-800">New Purchase</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-hidden flex flex-col">
          <div className="grid grid-cols-3 gap-6 flex-1 overflow-y-auto">
            {/* Left Column - Seller Info & Items */}
            <div className="col-span-2 pr-4">
              {/* Seller Info Section */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
                <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Seller Info</h3>

                {/* Seller Search */}
                <div className="mb-4 relative">
                  <input
                    type="text"
                    className={`${inp} mb-2`}
                    placeholder="Search or create seller *"
                    value={sellerSearch}
                    onChange={(e) => handleSellerSearch(e.target.value)}
                    onBlur={() => setTimeout(() => setShowSellerDropdown(false), 150)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.target.blur();
                      }
                    }}
                  />
                  {showSellerDropdown && sellers.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-10 max-h-48 overflow-y-auto">
                      {sellers.map(seller => (
                        <div
                          key={seller.id}
                          onClick={() => selectSeller(seller)}
                          className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                        >
                          <div className="font-semibold text-sm text-gray-800">{seller.name}</div>
                          <div className="text-xs text-gray-500">{seller.phone || 'No phone'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Seller Details */}
                {selectedSeller && (
                  <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Selected: <span className="text-blue-600">{selectedSeller.name}</span></p>
                    <p className="text-xs text-gray-600">{selectedSeller.phone || ''}</p>
                  </div>
                )}

                {/* Seller Manual Input */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input className={`${inp}`} placeholder="Phone"
                      value={sellerPhone}
                      onChange={e => handleSellerPhoneSearch(e.target.value)}
                      onBlur={() => setTimeout(() => setShowSellerPhoneDropdown(false), 150)}
                    />
                    {showSellerPhoneDropdown && sellers.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-10 max-h-48 overflow-y-auto">
                        {sellers.map(seller => (
                          <div
                            key={seller.id}
                            onClick={() => selectSeller(seller)}
                            className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                          >
                            <div className="font-semibold text-sm text-gray-800">{seller.phone}</div>
                            <div className="text-xs text-gray-500">{seller.name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <input className={`${inp}`} placeholder="Address"
                    value={sellerAddress} onChange={e => setSellerAddress(capitalizeFirstLetter(e.target.value))} />
                </div>
              </div>

              {/* Classification Section */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
                <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Purchase Type</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Category *</label>
                    <select
                      className={inp}
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="stock-ready">Stock Ready (adds to stock)</option>
                      <option value="raw-material">Raw Material</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
                    <select
                      className={inp}
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                    >
                      <option value="">— Optional —</option>
                      <option value="truck">Truck</option>
                      <option value="bag">Bag</option>
                    </select>
                  </div>
                </div>
                {category === 'raw-material' && (
                  <p className="text-xs text-gray-500 mt-2">
                    ℹ️ Raw material purchases feed production and won't update sellable stock quantities.
                  </p>
                )}
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
                            {suggestions[i].map(suggestion => (
                              <div
                                key={suggestion.id}
                                className="px-3 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer"
                                onClick={() => selectSuggestion(i, suggestion)}
                              >
                                <div className="font-medium text-sm text-gray-800">{suggestion.name}</div>
                                <div className="text-xs text-gray-500">
                                  {category === 'raw-material'
                                    ? <>pkr{Number(suggestion.unit_price || 0).toFixed(0)} · Current Stock: {suggestion.quantity} {suggestion.unit || ''}</>
                                    : <>pkr{Number(suggestion.unit_price).toFixed(0)} · Current Stock: {suggestion.quantity}</>
                                  }
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
                        onWheel={e => e.target.blur()}
                      />

                      {/* Quantity */}
                      <input
                        className="w-20 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        placeholder="Qty"
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateItem(i, 'quantity', e.target.value)}
                        onWheel={e => e.target.blur()}
                      />

                      {/* Unit (raw material only) */}
                      {category === 'raw-material' && (
                        <input
                          className="w-20 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                          placeholder="Unit"
                          value={item.unit}
                          onChange={e => updateItem(i, 'unit', e.target.value)}
                        />
                      )}

                      {items.length > 1 &&
                        <button
                          onClick={() => removeItem(i)}
                          className="bg-red-100 text-red-600 px-3 rounded text-sm hover:bg-red-200 transition"
                        >
                          ✕
                        </button>
                      }
                    </div>

                    {/* Amount preview + stock info */}
                    {item.price && item.quantity && (
                      <div className="pr-2">
                        <div className="text-right text-xs text-gray-500 mb-1">
                          Amount: <span className="font-bold text-gray-700">
                            pkr{(Number(item.price) * Number(item.quantity)).toFixed(0)}
                          </span>
                        </div>
                        {item.stock_id && category === 'stock-ready' && (
                          <div className="text-xs text-green-600 mt-1">
                            ✓ Will add {item.quantity} units to existing stock
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
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Advance Amount Paid</label>
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
                      Balance Owed: <span className="font-bold text-red-600">pkr{balance.toFixed(0)}</span>
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
              {loading ? 'Saving...' : 'Save Purchase'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewPurchaseModal;
