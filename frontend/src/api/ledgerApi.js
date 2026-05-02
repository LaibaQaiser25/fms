import axios from 'axios';

const BASE = 'http://localhost:5000/api';

export const getAllLedger        = (page = 1, limit = 10)        => 
  axios.get(`${BASE}/ledger?page=${page}&limit=${limit}`);
export const getCustomerLedger   = (customerId)       => 
  axios.get(`${BASE}/ledger/customer/${customerId}`);
export const addCredit           = (data)       => 
  axios.post(`${BASE}/ledger`, data);
export const deleteCustomer      = (name)       => 
  axios.delete(`${BASE}/ledger/customer/${name}`);

// New methods for dashboard
export const getLedgerSummary = ()=>
  axios.get(`${BASE}/ledger/summary/all`);

export const getOutstandingDebts = () =>
  axios.get(`${BASE}/ledger/debts/outstanding`);

export const addLedgerEntry = (data) =>
  axios.post(`${BASE}/ledger`, data);

export const getCustomerLedgerHistory = (customerId) =>
  axios.get(`${BASE}/ledger/customer/${customerId}`);