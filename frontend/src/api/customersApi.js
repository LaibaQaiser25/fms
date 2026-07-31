import http from './http';

// Search/auto-suggest customers
export const searchCustomers = (search = '', limit = 10) =>
  http.get(`/customers/search?search=${search}&limit=${limit}`);

// Get all customers
export const getAllCustomers = (page = 1, limit = 10) =>
  http.get(`/customers?page=${page}&limit=${limit}`);

// Get single customer
export const getCustomer = (id) => http.get(`/customers/${id}`);

// Create a new customer
export const createCustomer = (data) => http.post(`/customers`, data);

// Update customer
export const updateCustomer = (id, data) => http.put(`/customers/${id}`, data);

// Delete customer
export const deleteCustomer = (id) => http.delete(`/customers/${id}`);
