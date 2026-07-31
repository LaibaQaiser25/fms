import http from './http';

// ─── Legacy-style functions (mirror the old getAllInvoices/createInvoice/
// deleteInvoice/getClientInvoices set in invoiceApi.js). Like their sales
// counterparts, createInvoice, deleteInvoice, and getClientInvoices call
// routes that don't exist on PurchaseInvoiceController — see SETUP_NOTES. ───
export const getAllInvoices = (page = 1, limit = 10) =>
  http.get(`/purchase-invoices?page=${page}&limit=${limit}`);

// NOTE: legacy endpoint — no matching POST '/' route in purchaseInvoices.js
export const createInvoice = (data) =>
  http.post(`/purchase-invoices`, data);

// NOTE: legacy endpoint — no matching DELETE '/:id' route in purchaseInvoices.js
export const deleteInvoice = (id) =>
  http.delete(`/purchase-invoices/${id}`);

// NOTE: legacy endpoint, name-based lookup — no matching route in purchaseInvoices.js
export const getClientInvoices = (name) =>
  http.get(`/purchase-invoices/client/${name}`);

export const getAllPurchaseInvoices = (page = 1, limit = 10) =>
  http.get(`/purchase-invoices?page=${page}&limit=${limit}`);

export const getPurchaseInvoice = (id) => http.get(`/purchase-invoices/${id}`);

export const getSellerInvoices = (sellerId) =>
  http.get(`/purchase-invoices/seller/${sellerId}`);

export const getPurchaseInvoiceByNumber = (invoiceNo) =>
  http.get(`/purchase-invoices/number/${invoiceNo}`);

export const recordPayment = (data) =>
  http.post(`/purchase-invoices/payment`, data);

export const getPendingPayments = () =>
  http.get(`/purchase-invoices/pending/list`);
