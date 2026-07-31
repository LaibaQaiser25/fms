import http from './http';

// Search/auto-suggest sellers
export const searchSellers = (search = '', limit = 10) =>
  http.get(`/sellers/search?search=${search}&limit=${limit}`);

// Get all sellers
export const getAllSellers = (page = 1, limit = 10) =>
  http.get(`/sellers?page=${page}&limit=${limit}`);

// Get single seller
export const getSeller = (id) => http.get(`/sellers/${id}`);

// Create a new seller
export const createSeller = (data) => http.post(`/sellers`, data);

// Update seller
export const updateSeller = (id, data) => http.put(`/sellers/${id}`, data);

// Delete seller
export const deleteSeller = (id) => http.delete(`/sellers/${id}`);
