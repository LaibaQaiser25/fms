import axios from 'axios';

const BASE = 'http://localhost:5000/api';

export const getAllInvoices = ()     => axios.get(`${BASE}/invoices`);
export const getInvoice     = (id)   => axios.get(`${BASE}/invoices/${id}`);
export const createInvoice  = (data) => axios.post(`${BASE}/invoices`, data);
export const deleteInvoice  = (id)   => axios.delete(`${BASE}/invoices/${id}`);
export const getClientInvoices = (name) => axios.get(`${BASE}/invoices/client/${name}`);