// import { useEffect, useState } from 'react';
// import { getAllLedger, getSellerLedger, addCredit, deleteSeller } from '../../../api/purchaseLedgerApi';
// import { getPurchaseInvoice } from '../../../api/purchaseInvoiceApi';
// import { useReactToPrint } from 'react-to-print';
// import { useRef } from 'react';

// function InvoicePDFMini({ invoice }) {
//     if (!invoice) return null;
//     const date = new Date(invoice.created_at).toLocaleDateString('en-GB', {
//         day: 'numeric', month: 'long', year: 'numeric'
//     });
//     return (
//         <div style={{ background: '#fff', color: '#111', fontFamily: 'Georgia, serif', padding: '2rem', minWidth: 500 }}>
//             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
//                 <div style={{ fontSize: '2.5rem', fontWeight: 900 }}>INVOICE</div>
//                 <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#555' }}>
//                     <strong style={{ display: 'block', fontSize: '0.9rem', color: '#111' }}>Bin-Zahid & Partners</strong>
//                     123 Anywhere St., Any City, ST 12345<br />Tel: +123-456-7890
//                 </div>
//             </div>
//             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.8rem', borderTop: '1px solid #ddd', paddingTop: '1rem', marginBottom: '1.5rem' }}>
//                 <div>
//                     <div><b>Invoice No:</b> {invoice.invoice_no}</div>
//                     <div><b>Seller:</b> {invoice.seller_name}</div>
//                     <div><b>Address:</b> {invoice.address}</div>
//                 </div>
//                 <div>
//                     <div><b>Date:</b> {date}</div>
//                     <div><b>Phone:</b> {invoice.phone}</div>
//                 </div>
//             </div>
//             <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
//                 <thead>
//                     <tr>
//                         {['Item', 'Description', 'Price', 'Qty', 'Amount'].map(h => (
//                             <th key={h} style={{ borderBottom: '2px solid #111', padding: '0.4rem 0', textAlign: 'left' }}>{h}</th>
//                         ))}
//                     </tr>
//                 </thead>
//                 <tbody>
//                     {(invoice.items || []).map((item, i) => (
//                         <tr key={item.id}>
//                             <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>{i + 1}.</td>
//                             <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>{item.description}</td>
//                             <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>${Number(item.price).toFixed(0)}</td>
//                             <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>{item.quantity || 1}</td>
//                             <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #eee', textAlign: 'right' }}>
//                                 ${(Number(item.price) * Number(item.quantity || 1)).toFixed(0)}
//                             </td>
//                         </tr>
//                     ))}
//                     <tr>
//                         <td colSpan="4" style={{ paddingTop: '0.8rem', textAlign: 'right', fontWeight: 800 }}>Total</td>
//                         <td style={{ paddingTop: '0.8rem', textAlign: 'right', fontWeight: 800 }}>
//                             ${Number(invoice.total).toFixed(0)}
//                         </td>
//                     </tr>
//                 </tbody>
//             </table>
//         </div>
//     );
// }

// export default function Ledger() {
//     const [ledger, setLedger] = useState([]);
//     const [selected, setSelected] = useState(null);
//     const [entries, setEntries] = useState([]);
//     const [showDetail, setShowDetail] = useState(false);
//     const [showInvoice, setShowInvoice] = useState(false);
//     const [invoice, setInvoice] = useState(null);
//     const [loading, setLoading] = useState(true);
//     const [creditForm, setCreditForm] = useState({ amount: '', note: '' });
//     const [showCredit, setShowCredit] = useState(false);
//     const printRef = useRef();

//     useEffect(() => { fetchLedger(); }, []);

//     const fetchLedger = async () => {
//         try {
//             const res = await getAllLedger();
//             setLedger(Array.isArray(res.data) ? res.data : []);
//         } finally {
//             setLoading(false);
//         }
//     };

//     const handleSellerClick = async (seller) => {
//         setSelected(seller);
//         const res = await getSellerLedger(seller.seller_name);
//         setEntries(res.data);
//         setShowDetail(true);
//         setShowCredit(false);
//     };

//     const handleInvoiceClick = async (invoiceId) => {
//         if (!invoiceId) return;
//         const res = await getPurchaseInvoice(invoiceId);
//         setInvoice(res.data);
//         setShowInvoice(true);
//     };

//     const handlePrint = useReactToPrint({ content: () => printRef.current });

//     const handleAddCredit = async () => {
//         if (!creditForm.amount) return alert('Enter amount!');
//         try {
//             await addCredit({
//                 seller_name: selected.seller_name,
//                 credit: creditForm.amount,
//                 note: creditForm.note,
//                 invoice_id: entries[0]?.invoice_id || null  // link to most recent invoice
//             });
//             setCreditForm({ amount: '', note: '' });
//             setShowCredit(false);
//             handleSellerClick(selected);
//             fetchLedger();
//         } catch (err) {
//             alert('❌ Error: ' + (err.response?.data?.error || err.message));
//         }
//     };

//     const handleDeleteSeller = async (sellerName) => {
//         if (!window.confirm(`Delete all data for '${sellerName}'? This includes all invoices and ledger entries.`)) return;
//         try {
//             await deleteSeller(sellerName);
//             alert('✅ Seller deleted successfully');
//             // Notify InvoiceList to refresh
//             localStorage.setItem('refreshInvoiceList', Date.now().toString());
//             setShowDetail(false);
//             setSelected(null);
//             fetchLedger();
//         } catch (err) {
//             alert('❌ Error: ' + (err.response?.data?.error || err.message));
//         }
//     };

//     return (
//         <div className="max-w-5xl mx-auto p-6">

//             {/* Header */}
//             <div className="flex justify-between items-center mb-6">
//                 <div>
//                     <h2 className="text-2xl font-extrabold">Ledger</h2>
//                     <p className="text-gray-400 text-sm">{ledger.length} sellers</p>
//                 </div>
//             </div>

//             {/* Main ledger table */}
//             {loading ? (
//                 <p className="text-gray-400">Loading...</p>
//             ) : ledger.length === 0 ? (
//                 <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg">
//                     No ledger entries yet. Create a purchase first!
//                 </div>
//             ) : (
//                 <div className="overflow-x-auto border border-gray-200 rounded-lg mb-6">
//                     <table className="w-full text-sm">
//                         <thead>
//                             <tr className="bg-gray-50 border-b border-gray-200">
//                                 {['Seller', 'Invoices', 'Last Transaction', 'Total Debit', 'Total Credit', 'Debt', 'Actions'].map(h => (
//                                     <th key={h} className="px-4 py-3 text-left font-bold text-gray-700">{h}</th>
//                                 ))}
//                             </tr>
//                         </thead>
//                         <tbody>
//                             {ledger.map((row, i) => (
//                                 <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
//                                     <td className="px-4 py-3 font-semibold text-gray-900">{row.seller_name}</td>
//                                     <td className="px-4 py-3 text-gray-500">{row.total_invoices}</td>
//                                     <td className="px-4 py-3 text-gray-500">
//                                         {new Date(row.last_transaction).toLocaleDateString('en-GB')}
//                                     </td>
//                                     <td className="px-4 py-3 text-red-600 font-bold">${Number(row.total_debit).toFixed(0)}</td>
//                                     <td className="px-4 py-3 text-green-600 font-bold">${Number(row.total_credit).toFixed(0)}</td>
//                                     <td className="px-4 py-3">
//                                         <span className={`px-3 py-1 rounded-full text-xs font-bold ${Number(row.total_debt) > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
//                                             ${Number(row.total_debt).toFixed(0)}
//                                         </span>
//                                     </td>
//                                     <td className="px-4 py-3 flex gap-2">
//                                         <button onClick={() => handleSellerClick(row)}
//                                             className="bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded text-xs font-bold transition">
//                                             View
//                                         </button>
//                                         <button onClick={() => handleDeleteSeller(row.seller_name)}
//                                             className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-bold transition">
//                                             Delete
//                                         </button>
//                                     </td>
//                                 </tr>
//                             ))}
//                         </tbody>
//                     </table>
//                 </div>
//             )}

//             {/* Seller detail panel */}
//             {showDetail && selected && (
//                 <div className="border border-gray-200 rounded-lg p-5 bg-white">

//                     {/* Seller header */}
//                     <div className="flex justify-between items-center mb-4">
//                         <div>
//                             <h3 className="text-lg font-extrabold">{selected.seller_name}</h3>
//                             <p className="text-gray-400 text-xs">Running balance</p>
//                         </div>
//                         <div className="flex gap-2">
//                             <button onClick={() => setShowCredit(!showCredit)}
//                                 className="bg-green-600 text-white px-4 py-2 rounded text-sm font-bold">
//                                 + Add Payment
//                             </button>
//                             <button onClick={() => setShowDetail(false)}
//                                 className="bg-gray-100 text-gray-600 px-4 py-2 rounded text-sm">
//                                 Close
//                             </button>
//                         </div>
//                     </div>

//                     {/* Summary cards */}
//                     <div className="grid grid-cols-3 gap-3 mb-4">
//                         <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
//                             <div className="text-xs text-red-400 font-medium mb-1">Total Debit</div>
//                             <div className="text-xl font-extrabold text-red-600">${Number(selected.total_debit).toFixed(0)}</div>
//                         </div>
//                         <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
//                             <div className="text-xs text-green-400 font-medium mb-1">Total Credit</div>
//                             <div className="text-xl font-extrabold text-green-600">${Number(selected.total_credit).toFixed(0)}</div>
//                         </div>
//                         <div className={`border rounded-lg p-3 text-center ${Number(selected.total_debt) > 0 ? 'bg-orange-50 border-orange-100' : 'bg-green-50 border-green-100'}`}>
//                             <div className={`text-xs font-medium mb-1 ${Number(selected.total_debt) > 0 ? 'text-orange-400' : 'text-green-400'}`}>Remaining Debt</div>
//                             <div className={`text-xl font-extrabold ${Number(selected.total_debt) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
//                                 ${Number(selected.total_debt).toFixed(0)}
//                             </div>
//                         </div>
//                     </div>

//                     {/* Add credit form */}
//                     {showCredit && (
//                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
//                             <h4 className="font-bold text-sm mb-3">Record Payment</h4>
//                             <div className="flex gap-2">
//                                 <input type="number" placeholder="Amount paid"
//                                     value={creditForm.amount}
//                                     onChange={e => setCreditForm({ ...creditForm, amount: e.target.value })}
//                                     className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none" />
//                                 <input placeholder="Note (optional)"
//                                     value={creditForm.note}
//                                     onChange={e => setCreditForm({ ...creditForm, note: e.target.value })}
//                                     className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none" />
//                                 <button onClick={handleAddCredit}
//                                     className="bg-green-600 text-white px-4 py-2 rounded text-sm font-bold">
//                                     Save
//                                 </button>
//                             </div>
//                         </div>
//                     )}

//                     {/* Entries table */}
//                     <div className="overflow-x-auto border border-gray-100 rounded-lg">
//                         <table className="w-full text-sm">
//                             <thead>
//                                 <tr className="bg-gray-50 border-b border-gray-100">
//                                     {['Date', 'Invoice', 'Note', 'Debit', 'Credit', 'Balance'].map(h => (
//                                         <th key={h} className="px-4 py-2 text-left font-bold text-gray-600 text-xs">{h}</th>
//                                     ))}
//                                 </tr>
//                             </thead>
//                             <tbody>
//                                 {(() => {
//                                     let running = 0;
//                                     return entries.map((entry, i) => {
//                                         running += Number(entry.debit) - Number(entry.credit);
//                                         return (
//                                             <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
//                                                 <td className="px-4 py-2 text-gray-500 text-xs">
//                                                     {new Date(entry.date).toLocaleDateString('en-GB')}
//                                                 </td>
//                                                 <td className="px-4 py-2">
//                                                     {entry.invoice_no ? (
//                                                         <button onClick={() => handleInvoiceClick(entry.invoice_id)}
//                                                             className="text-blue-600 underline text-xs font-medium hover:text-blue-800">
//                                                             {entry.invoice_no}
//                                                         </button>
//                                                     ) : <span className="text-gray-300 text-xs">—</span>}
//                                                 </td>
//                                                 <td className="px-4 py-2 text-gray-400 text-xs">{entry.note || '—'}</td>
//                                                 <td className="px-4 py-2 text-red-500 font-medium">
//                                                     {Number(entry.debit) > 0 ? `$${Number(entry.debit).toFixed(0)}` : '—'}
//                                                 </td>
//                                                 <td className="px-4 py-2 text-green-500 font-medium">
//                                                     {Number(entry.credit) > 0 ? `$${Number(entry.credit).toFixed(0)}` : '—'}
//                                                 </td>
//                                                 <td className="px-4 py-2">
//                                                     <span className={`text-xs font-bold ${running > 0 ? 'text-orange-600' : 'text-green-600'}`}>
//                                                         ${running.toFixed(0)}
//                                                     </span>
//                                                 </td>
//                                             </tr>
//                                         );
//                                     });
//                                 })()}
//                             </tbody>
//                         </table>
//                     </div>
//                 </div>
//             )}

//             {/* Invoice modal */}
//             {showInvoice && invoice && (
//                 <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center overflow-y-auto p-8"
//                     onClick={() => setShowInvoice(false)}>
//                     <div className="bg-white rounded-xl p-4 w-full max-w-2xl" onClick={e => e.stopPropagation()}>
//                         <div className="flex justify-end gap-2 mb-3">
//                             <button onClick={handlePrint}
//                                 className="bg-gray-900 text-white px-4 py-2 rounded text-sm font-bold">
//                                 🖨 Print
//                             </button>
//                             <button onClick={() => setShowInvoice(false)}
//                                 className="border border-gray-200 px-4 py-2 rounded text-sm">
//                                 ✕ Close
//                             </button>
//                         </div>
//                         <div ref={printRef}>
//                             <InvoicePDFMini invoice={invoice} />
//                         </div>
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// }
