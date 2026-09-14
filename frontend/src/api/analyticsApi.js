import http from './http';

export const getSummary = (period = 'month') =>
  http.get(`/analytics/summary?period=${period}`);

export const getOrdersTrend = (granularity = 'monthly') =>
  http.get(`/analytics/orders-trend?granularity=${granularity}`);

export const getEarningsBreakdown = (period = 'month') =>
  http.get(`/analytics/earnings-breakdown?period=${period}`);

export const getRecords = (params = {}) =>
  http.get(`/analytics/records`, { params });
