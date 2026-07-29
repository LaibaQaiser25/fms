// import { useEffect, useState, useRef } from 'react';
// import { useReactToPrint } from 'react-to-print';
// import { getAllInvoices, getPurchaseInvoice, deleteInvoice, getClientInvoices } from '../../../api/purchaseInvoiceApi';
// import InvoicePDF from './PInvoicePdf';
// import axios from 'axios';

// export default function InvoiceList() {
//   const [invoices, setInvoices] = useState([]);
//   const [selected, setSelected] = useState(null);
//   const [showModal, setShowModal] = useState(false);
//   const [loading, setLoading] = useState(true);
//   const [sellerInvoices, setSellerInvoices] = useState([]);
//   const [sellerName, setSellerName] = useState('');
//   const [showSellerList, setShowSellerList] = useState(false);
//   const printRef = useRef();

//   useEffect(() => { fetchInvoices(); }, []);

//   // Listen for seller deletion signal from Ledger
//   useEffect(() => {
//     const handleStorageChange = () => {
//       fetchInvoices();
//     };
//     window.addEventListener('storage', handleStorageChange);
//     return () => window.removeEventListener('storage', handleStorageChange);
//   }, []);

//   const fetchInvoices = async () => {
//     try {
//       const res = await getAllInvoices();
//       setInvoices(Array.isArray(res.data) ? res.data : []);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleInvoiceClick = async (id) => {
//     const res = await getPurchaseInvoice(id);
//     const inv = res.data;
//     try {
//       const ledgerRes = await axios.get(`http://localhost:5000/api/purchase-ledger/seller/${inv.seller_name}`);
//       const entries = ledgerRes.data;
//       const totalDebit = entries.reduce((sum, e) => sum + Number(e.debit), 0);
//       const totalCredit = entries.reduce((sum, e) => sum + Number(e.credit), 0);
//       inv.balance = { totalDebit, totalCredit, debt: totalDebit - totalCredit };
//     } catch {
//       inv.balance = null;
//     }
//     setSelected(inv);
//     setShowModal(true);
//   };

//   const handleSellerInvoicesClick = async (sellerName) => {
//     const res = await getClientInvoices(sellerName);
//     const invoices = res.data;
//     if (invoices.length === 1) {
//       handleInvoiceClick(invoices[0].id);
//     } else {
//       setSellerInvoices(invoices);
//       setSellerName(sellerName);
//       setShowSellerList(true);
//     }
//   };

//   const handlePrint = useReactToPrint({ content: () => printRef.current });

//   const handleDelete = async (id) => {
//     if (!window.confirm('Delete this invoice?')) return;
//     await deleteInvoice(id);
//     fetchInvoices();
//   };

//   const statusBadge = (status) => {
//     switch (status) {
//       case 'paid':    return 'bg-green-100 text-green-700';
//       case 'partial': return 'bg-blue-100 text-blue-600';
//       case 'overdue': return 'bg-red-100 text-red-600';
//       default:        return 'bg-yellow-100 text-yellow-600';
//     }
//   };

//   return (
//     <div className="max-w-4xl mx-auto mt-8 px-4">

//       {/* Top bar */}
//       <div className="flex justify-between items-center mb-6">
//         <div>
//           <h2 className="text-2xl font-extrabold m-0">Invoices</h2>
//           <p className="text-gray-400 text-xs mt-0.5">
//             {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} found
//           </p>
//         </div>
//         <a href="/create" className="px-5 py-2.5 bg-gray-900 text-white rounded-md font-bold text-sm no-underline cursor-pointer">
//           + New Invoice
//         </a>
//       </div>

//       {/* Table */}
//       {loading ? (
//         <p className="text-gray-400">Loading...</p>
//       ) : invoices.length === 0 ? (
//         <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg">
//           No invoices yet. Create your first one!
//         </div>
//       ) : (
//         <div className="overflow-x-auto border border-gray-100 rounded-lg">
//           <table className="w-full border-collapse text-sm">
//             <thead>
//               <tr>
//                 {['Invoice No', 'Seller', 'Phone', 'Total', 'Status', 'Date', 'Actions'].map(h => (
//                   <th key={h} className="bg-gray-50 px-4 py-3 text-left font-bold border-b border-gray-100 whitespace-nowrap">
//                     {h}
//                   </th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody>
//               {invoices.map(inv => (
//                 <tr key={inv.id} className="border-b border-gray-100">
//                   <td className="px-4 py-3 align-middle">{inv.invoice_no}</td>
//                   <td className="px-4 py-3 align-middle">{inv.seller_name}</td>
//                   <td className="px-4 py-3 align-middle">{inv.phone}</td>
//                   <td className="px-4 py-3 align-middle font-bold">${Number(inv.total).toFixed(0)}</td>
//                   <td className="px-4 py-3 align-middle">
//                     <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusBadge(inv.status)}`}>
//                       {inv.status}
//                     </span>
//                   </td>
//                   <td className="px-4 py-3 align-middle">
//                     {new Date(inv.created_at).toLocaleDateString('en-GB')}
//                   </td>
//                   <td className="px-4 py-3 align-middle">
//                     <button
//                       onClick={() => handleSellerInvoicesClick(inv.seller_name)}
//                       className="px-3.5 py-1.5 bg-gray-900 text-white border-none rounded cursor-pointer text-xs font-medium mr-1.5"
//                     >
//                       Invoice
//                     </button>
//                     <button
//                       onClick={() => handleDelete(inv.id)}
//                       className="px-3.5 py-1.5 bg-red-100 text-red-600 border-none rounded cursor-pointer text-xs"
//                     >
//                       Delete
//                     </button>
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>

//           {/* Seller invoices list modal */}
//           {showSellerList && (
//             <div
//               className="fixed inset-0 bg-black/70 z-1000 flex items-start justify-center overflow-y-auto p-8"
//               onClick={() => setShowSellerList(false)}
//             >
//               <div
//                 className="bg-gray-100 rounded-xl p-6 w-full max-w-md"
//                 onClick={e => e.stopPropagation()}
//               >
//                 <div className="flex justify-between items-center mb-4">
//                   <div>
//                     <div className="font-extrabold text-base">{sellerName}</div>
//                     <div className="text-gray-400 text-xs">{sellerInvoices.length} invoices found</div>
//                   </div>
//                   <button
//                     onClick={() => setShowSellerList(false)}
//                     className="px-5 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-md cursor-pointer text-sm"
//                   >
//                     ✕
//                   </button>
//                 </div>
//                 <div className="flex flex-col gap-2">
//                   {sellerInvoices.map(inv => (
//                     <div
//                       key={inv.id}
//                       onClick={() => { handleInvoiceClick(inv.id); setShowSellerList(false); }}
//                       className="flex justify-between items-center px-4 py-3 bg-gray-50 rounded-md border border-gray-100 cursor-pointer"
//                     >
//                       <div>
//                         <div className="font-bold text-sm">{inv.invoice_no}</div>
//                         <div className="text-gray-400 text-xs">
//                           {new Date(inv.created_at).toLocaleDateString('en-GB')} · ${Number(inv.total).toFixed(0)}
//                         </div>
//                       </div>
//                       <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusBadge(inv.status)}`}>
//                         {inv.status}
//                       </span>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </div>
//           )}
//         </div>
//       )}

//       {/* Invoice detail modal */}
//       {showModal && (
//         <div
//           className="fixed inset-0 bg-black/70 z-1000 flex items-start justify-center overflow-y-auto p-8"
//           onClick={() => setShowModal(false)}
//         >
//           <div
//             className="bg-gray-100 rounded-xl p-6 w-full max-w-2xl"
//             onClick={e => e.stopPropagation()}
//           >
//             <div className="flex gap-3 mb-4 justify-end">
//               <button onClick={handlePrint} className="px-5 py-2.5 bg-gray-900 text-white border-none rounded-md cursor-pointer font-bold text-sm">
//                 🖨 Print / Save PDF
//               </button>
//               <button onClick={() => setShowModal(false)} className="px-5 py-2.5 bg-white text-gray-900 border border-gray-200 rounded-md cursor-pointer text-sm">
//                 ✕ Close
//               </button>
//             </div>
//             <div ref={printRef}>
//               <InvoicePDF invoice={selected} />
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }
