// import axios from 'axios';

// const BASE = 'http://localhost:5000/api';

// export const getAllPurchaseLedger = (page = 1, limit = 10) =>
//   axios.get(`${BASE}/purchase-ledger?page=${page}&limit=${limit}`);

// export const getSellerLedgerHistory = (sellerId) =>
//   axios.get(`${BASE}/purchase-ledger/seller/${sellerId}`);

// export const getPurchaseLedgerSummary = () =>
//   axios.get(`${BASE}/purchase-ledger/summary/all`);

// export const getOutstandingDebts = () =>
//   axios.get(`${BASE}/purchase-ledger/debts/outstanding`);

// export const addLedgerEntry = (data) =>
//   axios.post(`${BASE}/purchase-ledger`, data);


import axios from 'axios';

const BASE = 'http://localhost:5000/api';

// ─── Legacy-style functions (mirror the old getAllLedger/getCustomerLedger/
// addCredit/deleteCustomer set in ledgerApi.js). Like their sales
// counterparts, addCredit and deleteSeller call routes that don't exist
// on PurchaseLedgerController — see SETUP_NOTES for details. ───
export const getAllLedger = (page = 1, limit = 10) =>
  axios.get(`${BASE}/purchase-ledger?page=${page}&limit=${limit}`);

// NOTE: passes a seller *name*, same mismatch as the original
// getCustomerLedger(customerId) which was actually called with a name.
export const getSellerLedger = (sellerName) =>
  axios.get(`${BASE}/purchase-ledger/seller/${sellerName}`);

// NOTE: legacy endpoint — no matching route exists in purchaseLedger.js
export const addCredit = (data) =>
  axios.post(`${BASE}/purchase-ledger`, data);

// NOTE: legacy endpoint — no matching route exists in purchaseLedger.js
export const deleteSeller = (name) =>
  axios.delete(`${BASE}/purchase-ledger/seller/${name}`);

export const getAllPurchaseLedger = (page = 1, limit = 10) =>
  axios.get(`${BASE}/purchase-ledger?page=${page}&limit=${limit}`);

export const getSellerLedgerHistory = (sellerId) =>
  axios.get(`${BASE}/purchase-ledger/seller/${sellerId}`);

export const getPurchaseLedgerSummary = () =>
  axios.get(`${BASE}/purchase-ledger/summary/all`);

export const getOutstandingDebts = () =>
  axios.get(`${BASE}/purchase-ledger/debts/outstanding`);

export const addLedgerEntry = (data) =>
  axios.post(`${BASE}/purchase-ledger`, data);
