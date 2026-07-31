import api from './http';

export const employeeAPI = {
  getAll: (params) => api.get('/employees', { params }),
  getById: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  delete: (id) => api.delete(`/employees/${id}`),
  getTypes: () => api.get('/employees/types'),
  getSummary: (params) => api.get('/employees/summary', { params }),
};

export default employeeAPI;
