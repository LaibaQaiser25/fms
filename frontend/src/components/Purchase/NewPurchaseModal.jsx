import React, { useState, useEffect, useContext } from 'react';
import { X } from 'lucide-react';
import * as sellersApi from '../../api/sellersApi';
import * as stockApi from '../../api/stockApi';
import * as rawMaterialsApi from '../../api/rawMaterialsApi';
import * as productsApi from '../../api/productsApi';
import * as purchaseApi from '../../api/purchaseApi';
import { AlertRefreshContext } from '../Layout';
import { capitalizeFirstLetter, capitalizeWords, capitalizeAddress } from '../../utils/text';
import { PAYMENT_METHODS, PAKISTANI_BANKS } from '../../paymentOptions';

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

  // Purchase classification — Type is compulsory and gates everything below it.
  // `category` keeps the values the backend already expects ('stock-ready' /
  // 'raw-material'); the UI just labels it "Type" per how the feature was asked for.
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedUnitName, setSelectedUnitName] = useState('');

  // Purchase Items
  const emptyItem = { description: '', price: '', quantity: '', availableQty: undefined, product_id: null, stock_id: null, raw_material_id: null };
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [suggestions, setSuggestions] = useState({});
  const [stockList, setStockList] = useState([]);
  const [rawMaterialsList, setRawMaterialsList] = useState([]);

  // Payment
  const [paymentType, setPaymentType] = useState('Cash');
  const [bankName, setBankName] = useState('');
  const [advancePaid, setAdvancePaid] = useState('');
  const [notes, setNotes] = useState('');

  // Submission
  const [loading, setLoading] = useState(false);

  // Initialize — everything fetched fresh each time the modal opens
  useEffect(() => {
    fetchStock();
    fetchRawMaterialsList();
    fetchCategories();
    fetchUnits();
  }, []);

  const fetchStock = async () => {
    try {
      const response = await stockApi.getAllStock();
      setStockList(response.data || []);
    } catch (error) {
      console.error('Error fetching stock:', error);
    }
  };

  const fetchRawMaterialsList = async () => {
    try {
      const response = await rawMaterialsApi.getAllRawMaterialsList();
      setRawMaterialsList(response.data || []);
    } catch (error) {
      console.error('Error fetching raw materials:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await productsApi.getCategories();
      setCategories(response.data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchUnits = async () => {
    try {
      const response = await productsApi.getUnits();
      setUnits(response.data || []);
    } catch (error) {
      console.error('Error fetching units:', error);
    }
  };

  const handleCategoryChange = (value) => {
    setCategory(value);
    setSelectedCategoryId('');
    setSelectedUnitName('');
    setItems([{ ...emptyItem }]);
    setSuggestions({});
  };

  // Seller search and selection
  const handleSellerSearch = async (value) => {
    const capitalizedValue = capitalizeWords(value);
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

  // Item handling — suggestions come from the products catalog, filtered by the
  // chosen Type (and further by Category/Unit if one is picked), so any defined
  // product is selectable whether or not it has inventory on hand yet.
  const handleDescriptionChange = async (index, value) => {
    const newItems = [...items];
    newItems[index].description = capitalizeFirstLetter(value);
    newItems[index].product_id = null;
    newItems[index].stock_id = null;
    newItems[index].raw_material_id = null;
    setItems(newItems);

    if (value.length > 0) {
      try {
        const productType = category === 'raw-material' ? 'raw_material' : 'stock';
        const response = await productsApi.searchProducts(value, productType);
        let results = response.data || [];

        if (category === 'stock-ready' && selectedCategoryId) {
          results = results.filter((p) => String(p.category_id) === String(selectedCategoryId));
        } else if (category === 'raw-material' && selectedUnitName) {
          results = results.filter((p) => p.unit === selectedUnitName);
        }

        setSuggestions({ ...suggestions, [index]: results });
      } catch (error) {
        console.error('Error searching products:', error);
      }
    } else {
      setSuggestions({ ...suggestions, [index]: [] });
    }
  };

  const selectSuggestion = (index, product) => {
    // Availability is looked up client-side against the already-fetched
    // stock/raw-materials list — a product with no matching row just means
    // stock_id/raw_material_id/availableQty stay unset (first-ever purchase of it).
    const newItems = [...items];

    if (category === 'raw-material') {
      const matched = rawMaterialsList.find((r) => r.product_id === product.id);
      newItems[index] = {
        description: product.name,
        price: matched ? matched.unit_price || '' : '',
        quantity: newItems[index].quantity || 1,
        availableQty: matched ? matched.quantity : 0,
        product_id: product.id,
        stock_id: null,
        raw_material_id: matched ? matched.id : null
      };
    } else {
      const matched = stockList.find((s) => s.product_id === product.id);
      newItems[index] = {
        description: product.name,
        price: matched ? matched.unit_price || '' : '',
        quantity: newItems[index].quantity || 1,
        availableQty: matched ? matched.quantity : 0,
        product_id: product.id,
        stock_id: matched ? matched.id : null,
        raw_material_id: null
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
    // Only allow adding a new row once the current last one has a catalog product picked
    const hasSelectedItem = items.some((i) => i.product_id);
    if (!hasSelectedItem) {
      return alert('⚠️ Please select at least one item from the suggestions before adding another item');
    }
    setItems([...items, { ...emptyItem }]);
  };

  const removeItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems.length > 0 ? newItems : [{ ...emptyItem }]);
  };

  // Calculate totals
  const total = items.reduce((sum, item) => {
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    return sum + (price * qty);
  }, 0);

  const advance = Number(advancePaid) || 0;
  const balance = total - advance;

  const selectedCategoryName = categories.find((c) => String(c.id) === String(selectedCategoryId))?.name || '';

  const handleSubmit = async () => {
    if (!category) {
      return alert('⚠️ Please select a Type (Stock or Raw Material)');
    }

    // Validate seller info is present (either an existing seller was picked,
    // or enough info was typed in to create one)
    if (!selectedSeller && (!sellerName.trim() || !sellerPhone.trim() || !sellerAddress.trim())) {
      return alert('⚠️ Please provide seller name, phone, and address');
    }

    // Validate that at least one item was picked from the product suggestions
    const validItems = items.filter((i) => i.product_id && i.quantity && i.price);
    if (validItems.length === 0) {
      return alert('⚠️ Please select at least one item from the suggestions.');
    }

    if (category === 'raw-material' && !selectedUnitName) {
      return alert('⚠️ Please select a Unit');
    }

    if (paymentType === 'Bank Transfer' && !bankName) {
      return alert('⚠️ Please select a bank');
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
        type: null,
        items: validItems.map((i) => ({
          product_id: i.product_id,
          stock_id: i.stock_id,
          raw_material_id: i.raw_material_id,
          unit: category === 'raw-material' ? selectedUnitName : null,
          category_name: category === 'stock-ready' ? (selectedCategoryName || null) : null,
          product_name: i.description,
          quantity: Number(i.quantity),
          price: Number(i.price),
          description: i.description
        })),
        total_amount: total,
        advance_paid: advance,
        payment_type: paymentType,
        bank_name: paymentType === 'Bank Transfer' ? bankName : null,
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

  const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-500";

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
                  <div className="mb-4 p-3 bg-red-50 rounded border border-red-200">
                    <p className="text-sm font-semibold text-gray-700 mb-1">Selected: <span className="text-red-600">{selectedSeller.name}</span></p>
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
                    value={sellerAddress} onChange={e => setSellerAddress(capitalizeAddress(e.target.value))} />
                </div>
              </div>

              {/* Classification Section */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
                <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Purchase Type</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Type *</label>
                    <select
                      className={inp}
                      value={category}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                    >
                      <option value="">-- Select Type --</option>
                      <option value="stock-ready">Stock</option>
                      <option value="raw-material">Raw Material</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">
                      {category === 'raw-material' ? 'Unit *' : 'Category'}
                    </label>
                    {category === 'raw-material' ? (
                      <select
                        className={inp}
                        value={selectedUnitName}
                        disabled={!category}
                        onChange={(e) => setSelectedUnitName(e.target.value)}
                      >
                        <option value="">-- Select Unit --</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.name}>{u.name}</option>
                        ))}
                      </select>
                    ) : (
                      <select
                        className={inp}
                        value={selectedCategoryId}
                        disabled={!category}
                        onChange={(e) => setSelectedCategoryId(e.target.value)}
                      >
                        <option value="">-- All Categories --</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
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
                {!category && (
                  <p className="text-sm text-gray-400 italic">Select a Type above to start adding items.</p>
                )}
                {category && items.map((item, i) => (
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
                        {/* Suggestions dropdown — names only; availability shows after selection */}
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
                        className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                        placeholder="Price"
                        type="number"
                        value={item.price}
                        onChange={e => updateItem(i, 'price', e.target.value)}
                        onWheel={e => e.target.blur()}
                      />

                      {/* Quantity */}
                      <input
                        className="w-20 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-red-500"
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

                    {/* Amount preview + availability info */}
                    {item.price && item.quantity && (
                      <div className="pr-2">
                        <div className="text-right text-xs text-gray-500 mb-1">
                          Amount: <span className="font-bold text-gray-700">
                            pkr{(Number(item.price) * Number(item.quantity)).toFixed(0)}
                          </span>
                        </div>
                        {item.product_id && (
                          <div>
                            {(category === 'raw-material' ? item.raw_material_id : item.stock_id) === null ? (
                              <div className="text-xs text-gray-500 mt-1">
                                Not currently in inventory — this purchase will create it.
                              </div>
                            ) : (
                              <div className="text-xs text-red-600 mt-1">
                                ✓ Currently Available: <span className="font-bold">{item.availableQty} units</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                ))}

                {category && (
                  <button
                    onClick={addItem}
                    disabled={!items.some(i => i.product_id)}
                    className="text-sm border border-gray-300 px-4 py-2 rounded hover:bg-gray-50 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                  >
                    + Add Item
                  </button>
                )}
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
