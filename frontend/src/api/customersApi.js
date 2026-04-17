import axios from 'axios';

const BASE = 'http://localhost:5000/api';

// Search/auto-suggest customers
export const searchCustomers = (search = '', limit = 10) => 
  axios.get(`${BASE}/customers/search?search=${search}&limit=${limit}`);

// Get all customers
export const getAllCustomers = (page = 1, limit = 10) =>
  axios.get(`${BASE}/customers?page=${page}&limit=${limit}`);

// Get single customer
export const getCustomer = (id) => axios.get(`${BASE}/customers/${id}`);

// Create a new customer
export const createCustomer = (data) => axios.post(`${BASE}/customers`, data);

// Update customer
export const updateCustomer = (id, data) => axios.put(`${BASE}/customers/${id}`, data);

// Delete customer
export const deleteCustomer = (id) => axios.delete(`${BASE}/customers/${id}`);
