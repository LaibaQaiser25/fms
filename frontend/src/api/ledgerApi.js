import axios from 'axios';

const BASE = 'http://localhost:5000/api';

export const getAllLedger        = ()           => axios.get(`${BASE}/ledger`);
export const getCustomerLedger   = (name)       => axios.get(`${BASE}/ledger/customer/${name}`);
export const addCredit           = (data)       => axios.post(`${BASE}/ledger/credit`, data);
export const deleteCustomer      = (name)       => axios.delete(`${BASE}/ledger/customer/${name}`);