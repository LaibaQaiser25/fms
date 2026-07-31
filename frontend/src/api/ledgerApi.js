import http from './http';

export const getAllLedger        = (page = 1, limit = 10)        =>
  http.get(`/ledger?page=${page}&limit=${limit}`);
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
