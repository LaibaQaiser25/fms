import http from './http';

export const getAllInvoices = (page = 1, limit = 10)     =>
  http.get(`/invoices?page=${page}&limit=${limit}`);
export const getInvoice     = (id)   => http.get(`/invoices/${id}`);
export const createInvoice  = (data) => http.post(`/invoices`, data);
export const deleteInvoice  = (id)   => http.delete(`/invoices/${id}`);
export const getClientInvoices = (name) => http.get(`/invoices/client/${name}`);

// New methods for dashboard
export const getCustomerInvoices = (customerId) =>
  http.get(`/invoices/customer/${customerId}`);

export const getInvoiceByNumber = (invoiceNo) =>
  http.get(`/invoices/number/${invoiceNo}`);

export const recordPayment = (data) =>
  http.post(`/invoices/payment`, data);

export const getPendingPayments = () =>
  http.get(`/invoices/pending/list`);
