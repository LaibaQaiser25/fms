import http from './http';

export const getAllProducts  = (type)      => http.get(`/products${type ? `?type=${type}` : ''}`);
export const searchProducts  = (q, type)   => http.get(`/products/search?q=${q}${type ? `&type=${type}` : ''}`);
export const getProductById  = (id)        => http.get(`/products/${id}`);
export const createProduct   = (data)      => http.post(`/products`, data);
export const updateProduct   = (id, data)  => http.put(`/products/${id}`, data);
export const deleteProduct   = (id)        => http.delete(`/products/${id}`);

export const getCategories   = ()          => http.get(`/products/categories`);
export const createCategory  = (name)      => http.post(`/products/categories`, { name });
