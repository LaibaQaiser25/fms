import http from './http';

// Add to production queue
export const addToQueue = (data) => http.post(`/production`, data);

// Get production queue
export const getQueue = (status = '', page = 1, limit = 10) =>
  http.get(`/production?status=${status}&page=${page}&limit=${limit}`);

// Get single production item
export const getProductionItem = (id) => http.get(`/production/${id}`);

// Update production status
export const updateProductionStatus = (id, status) =>
  http.put(`/production/${id}/status`, { status });

// Get production statistics
export const getStats = () => http.get(`/production/stats/overview`);

// Get today's production schedule
export const getTodaySchedule = () => http.get(`/production/today/schedule`);
