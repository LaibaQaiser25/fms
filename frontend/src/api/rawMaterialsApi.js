import http from './http';

// Search/auto-suggest raw materials
export const searchRawMaterials = (search = '', limit = 10) =>
  http.get(`/raw-materials/search?search=${search}&limit=${limit}`);

// Low-stock raw materials (quantity <= minimum_stock)
export const getLowStockRawMaterials = () =>
  http.get(`/raw-materials/alerts/low-stock`);

// Get all raw materials
export const getAllRawMaterials = (page = 1, limit = 10) =>
  http.get(`/raw-materials?page=${page}&limit=${limit}`);

// Get single raw material
export const getRawMaterial = (id) => http.get(`/raw-materials/${id}`);

// Create a new raw material
export const createRawMaterial = (data) => http.post(`/raw-materials`, data);

// Update raw material
export const updateRawMaterial = (id, data) => http.put(`/raw-materials/${id}`, data);

// Delete raw material
export const deleteRawMaterial = (id) => http.delete(`/raw-materials/${id}`);
