// import { useState } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { createInvoice } from '../../../api/purchaseInvoiceApi';
// import { searchStock } from '../../../api/stockApi';

// export default function InvoiceForm() {
//   const navigate = useNavigate();
//   const [seller, setSeller] = useState({ seller_name: '', phone: '', address: '' });
//   const [items, setItems] = useState([{ description: '', price: '', quantity: 1, stock_id: null }]);
//   const [suggestions, setSuggestions] = useState({});
//   const [loading, setLoading] = useState(false);

//   const addItem = () => setItems([...items, { description: '', price: '', quantity: 1, stock_id: null }]);
//   const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

//   const updateItem = (index, field, value) => {
//     const updated = [...items];
//     updated[index][field] = value;
//     setItems(updated);
//   };

//   // Search stock as user types
//   const handleDescriptionChange = async (index, value) => {
//     updateItem(index, 'description', value);
//     updateItem(index, 'stock_id', null);
//     if (value.length < 2) { setSuggestions(prev => ({ ...prev, [index]: [] })); return; }
//     try {
//       const res = await searchStock(value);
//       setSuggestions(prev => ({ ...prev, [index]: res.data }));
//     } catch {
//       setSuggestions(prev => ({ ...prev, [index]: [] }));
//     }
//   };

//   // When user picks a suggestion
//   const selectSuggestion = (index, stock) => {
//     const updated = [...items];
//     updated[index].description = stock.name;
//     updated[index].price = stock.unit_price;
//     updated[index].stock_id = stock.id;
//     updated[index].availableQty = stock.quantity; // ← store available stock
//     setItems(updated);
//     setSuggestions(prev => ({ ...prev, [index]: [] }));
//   };

//   const total = items.reduce((sum, i) => sum + (Number(i.price || 0) * Number(i.quantity || 1)), 0);

//   const handleSubmit = async () => {
//     if (!seller.seller_name) return alert('Please enter seller name!');
//     if (items.some(i => !i.description || !i.price)) return alert('Fill all item fields!');

//     // ⚠️ Check stock before saving — kept for structural parity with the
//     // sales InvoiceForm.jsx, but note this check doesn't really apply to
//     // purchases: a purchase *adds* to stock, it doesn't consume it, so
//     // "exceeds available stock" isn't really a meaningful validation here.
//     const overStock = items.find(i =>
//       i.availableQty !== undefined && Number(i.quantity) > Number(i.availableQty)
//     );
//     if (overStock) return alert(`⚠️ "${overStock.description}" exceeds available stock of ${overStock.availableQty} units!`);

//     setLoading(true);
//     try {
//       await createInvoice({ ...seller, items });
//       alert('✅ Invoice created!');
//       navigate('/');
//     } catch (err) {
//       console.error('❌ Error:', err.response?.data || err.message);
//       alert('❌ Error: ' + (err.response?.data?.error || err.message));
//     } finally {
//       setLoading(false);
//     }
//   };

//   const inp = "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-gray-500";

//   return (
//     <div className="max-w-2xl mx-auto p-6">
//       <h2 className="text-2xl font-extrabold mb-6">Create Invoice</h2>

//       {/* Seller Info */}
//       <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
//         <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Seller Info</h3>
//         <input className={`${inp} mb-2`} placeholder="Seller Name *"
//           value={seller.seller_name} onChange={e => setSeller({ ...seller, seller_name: e.target.value })} />
//         <input className={`${inp} mb-2`} placeholder="Phone"
//           value={seller.phone} onChange={e => setSeller({ ...seller, phone: e.target.value })} />
//         <input className={inp} placeholder="Address"
//           value={seller.address} onChange={e => setSeller({ ...seller, address: e.target.value })} />
//       </div>

//       {/* Items */}
//       <div className="mb-4">
//         <h3 className="font-bold mb-3 text-sm text-gray-600 uppercase tracking-wider">Items</h3>
//         {items.map((item, i) => (
//           <div key={i} className="mb-3">
//             <div className="flex gap-2 mb-1">

//               {/* Description with autocomplete */}
//               <div className="flex-2 relative">
//                 <input className={inp} placeholder="Item description..."
//                   value={item.description}
//                   onChange={e => handleDescriptionChange(i, e.target.value)} />
//                 {/* Suggestions dropdown */}
//                 {suggestions[i]?.length > 0 && (
//                   <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-b shadow-lg z-10">
//                     {suggestions[i].map(stock => (
//                       <div key={stock.id} onClick={() => selectSuggestion(i, stock)}
//                         className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
//                         <div className="font-medium text-sm">{stock.name}</div>
//                         <div className="text-xs text-gray-400">
//                           ${Number(stock.unit_price).toFixed(0)} · Stock: {stock.quantity} · {stock.category || ''}
//                         </div>
//                       </div>
//                     ))}
//                   </div>
//                 )}
//               </div>

//               {/* Price — auto-filled from stock */}
//               <input className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
//                 placeholder="Price" type="number" value={item.price}
//                 onChange={e => updateItem(i, 'price', e.target.value)} />

//               {/* Quantity */}
//               <input className="w-16 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none"
//                 placeholder="Qty" type="number" min="1" value={item.quantity}
//                 onChange={e => updateItem(i, 'quantity', e.target.value)} />

//               {items.length > 1 &&
//                 <button onClick={() => removeItem(i)}
//                   className="bg-red-100 text-red-600 px-3 rounded text-sm">✕</button>}
//             </div>

//             {/* Amount preview */}
//             {/* Amount preview + stock warning */}
//             {item.price && item.quantity && (
//               <div className="pr-10">
//                 <div className="text-right text-xs text-gray-400">
//                   Amount: <span className="font-bold text-gray-700">
//                     ${(Number(item.price) * Number(item.quantity)).toFixed(0)}
//                   </span>
//                 </div>
//                 {/* ⚠️ Disclaimer — only shows when qty exceeds stock */}
//                 {item.stock_id && suggestions[item.index] === undefined &&
//                   (() => {
//                     const stockItem = Object.values(suggestions).flat().find(s => s.id === item.stock_id);
//                     return null; // handled below
//                   })()
//                 }
//                 {item.availableQty !== undefined && Number(item.quantity) > Number(item.availableQty) && (
//                   <div className="flex items-center gap-1 mt-1 bg-red-50 border border-red-200 rounded px-3 py-1.5">
//                     <span className="text-red-500">⚠️</span>
//                     <span className="text-red-600 text-xs font-medium">
//                       Exceeds stock! Only <strong>{item.availableQty}</strong> units available.
//                     </span>
//                   </div>
//                 )}
//               </div>
//             )}
//           </div>
//         ))}

//         <button onClick={addItem}
//           className="text-sm border border-gray-300 px-4 py-2 rounded hover:bg-gray-50">
//           + Add Item
//         </button>
//       </div>

//       {/* Total */}
//       <div className="flex justify-between items-center border-t border-gray-200 pt-4 mb-6">
//         <span className="font-bold text-gray-600">Grand Total</span>
//         <span className="text-2xl font-extrabold">${total.toFixed(0)}</span>
//       </div>

//       {/* Submit */}
//       <button onClick={handleSubmit} disabled={loading}
//         className="w-full bg-gray-900 text-white py-3 rounded font-bold text-sm hover:bg-gray-700 transition">
//         {loading ? 'Saving...' : 'Save Invoice'}
//       </button>
//     </div>
//   );
// }
