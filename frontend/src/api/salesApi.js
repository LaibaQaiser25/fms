import http from './http';

// Create a new sale
export const createSale = (data) => http.post(`/sales`, data);

// Get all sales
export const getAllSales = (page = 1, limit = 10) =>
  http.get(`/sales?page=${page}&limit=${limit}`);

// Get single sale
export const getSale = (id) => http.get(`/sales/${id}`);

// Update sale status
export const updateSaleStatus = (id, status) =>
  http.put(`/sales/${id}/status`, { status });

// Get today's sales summary
export const getTodaysSalesSummary = () =>
  http.get(`/sales/summary/today`);

// Get recent orders
export const getRecentOrders = () =>
  http.get(`/sales/recent/list`);

// Get consolidated dashboard data (OPTIMIZED - single API call)
export const getDashboardData = () =>
  http.get(`/sales/dashboard/data`);
