import axios from 'axios';

const BASE = 'http://localhost:5000/api';

// Search/auto-suggest sellers
export const searchSellers = (search = '', limit = 10) => 
  axios.get(`${BASE}/sellers/search?search=${search}&limit=${limit}`);

// Get all sellers
export const getAllSellers = (page = 1, limit = 10) =>
  axios.get(`${BASE}/sellers?page=${page}&limit=${limit}`);

// Get single seller
export const getSeller = (id) => axios.get(`${BASE}/sellers/${id}`);

// Create a new seller
export const createSeller = (data) => axios.post(`${BASE}/sellers`, data);

// Update seller
export const updateSeller = (id, data) => axios.put(`${BASE}/sellers/${id}`, data);

// Delete seller
export const deleteSeller = (id) => axios.delete(`${BASE}/sellers/${id}`);
