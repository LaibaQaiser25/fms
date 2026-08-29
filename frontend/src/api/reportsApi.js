import http from './http';

export const listReports = (params) => http.get('/reports', { params });
export const getReport = (id) => http.get(`/reports/${id}`);
export const createReport = (payload) => http.post('/reports', payload);
export const updateReport = (id, payload) => http.put(`/reports/${id}`, payload);
export const deleteReport = (id) => http.delete(`/reports/${id}`);

export const getSchedules = () => http.get('/reports/schedules');
export const updateSchedule = (frequency, payload) => http.put(`/reports/schedules/${frequency}`, payload);

export const sendDailyReportWhatsApp = () => http.post('/reports/send-whatsapp');
