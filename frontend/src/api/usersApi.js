import http from './http';

export const getAllUsers = () => http.get('/users');
export const createUser = (data) => http.post('/users', data);
export const updateUser = (id, data) => http.put(`/users/${id}`, data);
export const setUserPassword = (id, password) => http.put(`/users/${id}/password`, { password });
export const changeOwnPassword = (data) => http.put('/users/self/password', data);
