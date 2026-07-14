import axios from 'axios';

const BASE = 'http://localhost:5000/api';

// Create a new purchase
export const createPurchase = (data) => axios.post(`${BASE}/purchases`, data);

// Get all purchases
export const getAllPurchases = (page = 1, limit = 10) =>
  axios.get(`${BASE}/purchases?page=${page}&limit=${limit}`);

// Get single purchase
export const getPurchase = (id) => axios.get(`${BASE}/purchases/${id}`);

// Update purchase
export const updatePurchase = (id, data) => axios.put(`${BASE}/purchases/${id}`, data);

// Delete purchase
export const deletePurchase = (id) => axios.delete(`${BASE}/purchases/${id}`);
