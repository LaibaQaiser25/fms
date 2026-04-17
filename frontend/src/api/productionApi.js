import axios from 'axios';

const BASE = 'http://localhost:5000/api';

// Add to production queue
export const addToQueue = (data) => axios.post(`${BASE}/production`, data);

// Get production queue
export const getQueue = (status = '', page = 1, limit = 10) =>
  axios.get(`${BASE}/production?status=${status}&page=${page}&limit=${limit}`);

// Get single production item
export const getProductionItem = (id) => axios.get(`${BASE}/production/${id}`);

// Update production status
export const updateProductionStatus = (id, status) =>
  axios.put(`${BASE}/production/${id}/status`, { status });

// Get production statistics
export const getStats = () => axios.get(`${BASE}/production/stats/overview`);

// Get today's production schedule
export const getTodaySchedule = () => axios.get(`${BASE}/production/today/schedule`);
