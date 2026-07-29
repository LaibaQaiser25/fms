// import axios from 'axios';

// const BASE = 'http://localhost:5000/api';

// // ---------- Purchases ----------

// // Create a new purchase
// export const createPurchase = (data) => axios.post(`${BASE}/purchase`, data);

// // Get all purchases
// export const getAllPurchases = (page = 1, limit = 10) =>
//   axios.get(`${BASE}/purchase?page=${page}&limit=${limit}`);

// // Get single purchase
// export const getPurchase = (id) => axios.get(`${BASE}/purchase/${id}`);

// // Update purchase
// export const updatePurchase = (id, data) => axios.put(`${BASE}/purchase/${id}`, data);

// // Delete purchase
// export const deletePurchase = (id) => axios.delete(`${BASE}/purchase/${id}`);

// // ---------- Purchase Invoices ----------

// export const getPurchaseInvoices = (page = 1, limit = 10) =>
//   axios.get(`${BASE}/purchase/purchase-invoices?page=${page}&limit=${limit}`);

// export const getPurchaseInvoice = (id) =>
//   axios.get(`${BASE}/purchase/purchase-invoices/${id}`);

// // ---------- Purchase Payments ----------

// export const recordPurchasePayment = (data) =>
//   axios.post(`${BASE}/purchase/purchase-payments`, data);

// export const getPurchasePayments = (sellerId) =>
//   axios.get(`${BASE}/purchase/purchase-payments/${sellerId}`);

// // ---------- Purchase Ledger ----------

// export const getPurchaseLedger = (sellerId) =>
//   axios.get(`${BASE}/purchase/purchase-ledger/${sellerId}`);

// // ---------- Default export ----------

// export default {
//   createPurchase,
//   getAllPurchases,
//   getPurchase,
//   updatePurchase,
//   deletePurchase,
//   getPurchaseInvoices,
//   getPurchaseInvoice,
//   recordPurchasePayment,
//   getPurchasePayments,
//   getPurchaseLedger
// };


import axios from 'axios';

const BASE = 'http://localhost:5000/api';

// Create a new purchase
export const createPurchase = (data) => axios.post(`${BASE}/purchase`, data);

// Get all purchases
export const getAllPurchases = (page = 1, limit = 10) => 
  axios.get(`${BASE}/purchase?page=${page}&limit=${limit}`);

// Get single purchase
export const getPurchase = (id) => axios.get(`${BASE}/purchase/${id}`);

// Update purchase status
export const updatePurchaseStatus = (id, status) => 
  axios.put(`${BASE}/purchase/${id}/status`, { status });

// Get today's purchases summary
export const getTodaysPurchasesSummary = () => 
  axios.get(`${BASE}/purchase/summary/today`);

// Get recent purchases
export const getRecentPurchases = () => 
  axios.get(`${BASE}/purchase/recent/list`);

// Get consolidated dashboard data (OPTIMIZED - single API call)
export const getDashboardData = () =>
  axios.get(`${BASE}/purchase/dashboard/data`);
