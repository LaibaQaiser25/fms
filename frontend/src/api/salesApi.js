import axios from 'axios';

const BASE = 'http://localhost:5000/api';

// Create a new sale
export const createSale = (data) => axios.post(`${BASE}/sales`, data);

// Get all sales
export const getAllSales = (page = 1, limit = 10) => 
  axios.get(`${BASE}/sales?page=${page}&limit=${limit}`);

// Get single sale
export const getSale = (id) => axios.get(`${BASE}/sales/${id}`);

// Update sale status
export const updateSaleStatus = (id, status) => 
  axios.put(`${BASE}/sales/${id}/status`, { status });

// Get today's sales summary
export const getTodaysSalesSummary = () => 
  axios.get(`${BASE}/sales/summary/today`);

// Get recent orders
export const getRecentOrders = () => 
  axios.get(`${BASE}/sales/recent/list`);

// Get consolidated dashboard data (OPTIMIZED - single API call)
export const getDashboardData = () =>
  axios.get(`${BASE}/sales/dashboard/data`);
