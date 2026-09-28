import api from './http';

export const expenseAPI = {
  getAll: (params) => api.get('/expenses', { params }),
  getById: (id) => api.get(`/expenses/${id}`),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
  getCategories: () => api.get('/expenses/categories'),
  createCategory: (data) => api.post('/expenses/categories', data),
  updateCategory: (id, name) => api.put(`/expenses/categories/${id}`, { name }),
  deleteCategory: (id) => api.delete(`/expenses/categories/${id}`),
  getSummary: (params) => api.get('/expenses/summary', { params }),
};

export default expenseAPI;
