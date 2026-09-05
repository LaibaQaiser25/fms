import http from './http';

export const getAllLedger        = (page = 1, limit = 10, search = '', sortBy = 'id', sortOrder = 'desc') =>
  http.get(`/ledger?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&sortBy=${sortBy}&sortOrder=${sortOrder}`);
export const getCustomerLedger   = (customerId)       =>
  http.get(`/ledger/customer/${customerId}`);
export const addCredit           = (data)       =>
  http.post(`/ledger`, data);
export const deleteCustomer      = (name)       =>
  http.delete(`/ledger/customer/${name}`);

// New methods for dashboard
export const getLedgerSummary = ()=>
  http.get(`/ledger/summary/all`);

export const getOutstandingDebts = () =>
  http.get(`/ledger/debts/outstanding`);

export const addLedgerEntry = (data) =>
  http.post(`/ledger`, data);

export const getCustomerLedgerHistory = (customerId) =>
  http.get(`/ledger/customer/${customerId}`);
