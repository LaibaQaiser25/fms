import http from './http';

// Cashbook entries + totals for the active filters
export const getCashbook = (params) => http.get(`/cashbook`, { params });

// Totals only, same filters
export const getCashbookSummary = (params) => http.get(`/cashbook/summary`, { params });

// Who owes / is owed: side is 'receivable' (customers) or 'payable' (sellers)
export const getBalanceDetails = (side, params) => http.get(`/cashbook/balances/${side}`, { params });

// Distinct payment types present in the cashbook, for the filter dropdown
export const getPaymentTypes = () => http.get(`/cashbook/payment-types`);
