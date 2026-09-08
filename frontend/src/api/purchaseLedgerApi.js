import http from './http';

// ─── Legacy-style functions (mirror the old getAllLedger/getCustomerLedger/
// addCredit/deleteCustomer set in ledgerApi.js). Like their sales
// counterparts, addCredit and deleteSeller call routes that don't exist
// on PurchaseLedgerController — see SETUP_NOTES for details. ───
export const getAllLedger = (page = 1, limit = 10) =>
  http.get(`/purchase-ledger?page=${page}&limit=${limit}`);

// NOTE: passes a seller *name*, same mismatch as the original
// getCustomerLedger(customerId) which was actually called with a name.
export const getSellerLedger = (sellerName) =>
  http.get(`/purchase-ledger/seller/${sellerName}`);

// NOTE: legacy endpoint — no matching route exists in purchaseLedger.js
export const addCredit = (data) =>
  http.post(`/purchase-ledger`, data);

// NOTE: legacy endpoint — no matching route exists in purchaseLedger.js
export const deleteSeller = (name) =>
  http.delete(`/purchase-ledger/seller/${name}`);

export const getAllPurchaseLedger = (page = 1, limit = 10, search = '', sortBy = 'id', sortOrder = 'desc') =>
  http.get(`/purchase-ledger?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&sortBy=${sortBy}&sortOrder=${sortOrder}`);

export const getSellerLedgerHistory = (sellerId) =>
  http.get(`/purchase-ledger/seller/${sellerId}`);

export const getPurchaseLedgerSummary = () =>
  http.get(`/purchase-ledger/summary/all`);

export const getOutstandingDebts = () =>
  http.get(`/purchase-ledger/debts/outstanding`);

export const addLedgerEntry = (data) =>
  http.post(`/purchase-ledger`, data);

export const updateLedgerEntry = (id, data) =>
  http.put(`/purchase-ledger/${id}`, data);

export const deleteLedgerEntry = (id) =>
  http.delete(`/purchase-ledger/${id}`);
