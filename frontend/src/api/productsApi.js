import http from './http';

export const getAllProducts  = (type)      => http.get(`/products${type ? `?type=${type}` : ''}`);
export const searchProducts  = (q, type)   => http.get(`/products/search?q=${q}${type ? `&type=${type}` : ''}`);
export const getProductById  = (id)        => http.get(`/products/${id}`);
export const createProduct   = (data)      => http.post(`/products`, data);
export const bulkCreateProducts = (products) => http.post(`/products/bulk`, { products });
export const updateProduct   = (id, data)  => http.put(`/products/${id}`, data);
export const deleteProduct   = (id)        => http.delete(`/products/${id}`);

export const getCategories   = ()          => http.get(`/products/categories`);
export const createCategory  = (name)      => http.post(`/products/categories`, { name });
export const updateCategory  = (id, name)  => http.put(`/products/categories/${id}`, { name });
export const deleteCategory  = (id)        => http.delete(`/products/categories/${id}`);

export const getUnits        = ()          => http.get(`/products/units`);
export const createUnit      = (name)      => http.post(`/products/units`, { name });
export const updateUnit      = (id, name)  => http.put(`/products/units/${id}`, { name });
export const deleteUnit      = (id)        => http.delete(`/products/units/${id}`);
