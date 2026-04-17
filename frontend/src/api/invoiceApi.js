import axios from 'axios';

const BASE = 'http://localhost:5000/api';

export const getAllInvoices = (page = 1, limit = 10)     => 
  axios.get(`${BASE}/invoices?page=${page}&limit=${limit}`);
export const getInvoice     = (id)   => axios.get(`${BASE}/invoices/${id}`);
export const createInvoice  = (data) => axios.post(`${BASE}/invoices`, data);
export const deleteInvoice  = (id)   => axios.delete(`${BASE}/invoices/${id}`);
export const getClientInvoices = (name) => axios.get(`${BASE}/invoices/client/${name}`);

// New methods for dashboard
export const getCustomerInvoices = (customerId) =>
  axios.get(`${BASE}/invoices/customer/${customerId}`);

export const getInvoiceByNumber = (invoiceNo) =>
  axios.get(`${BASE}/invoices/number/${invoiceNo}`);

export const recordPayment = (data) =>
  axios.post(`${BASE}/invoices/payment`, data);

export const getPendingPayments = () =>
  axios.get(`${BASE}/invoices/pending/list`);