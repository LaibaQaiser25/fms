import axios from 'axios';

const BASE = 'http://localhost:5000/api';

export const getAllStock   = ()      => axios.get(`${BASE}/stock`);
export const searchStock   = (q)     => axios.get(`${BASE}/stock/search?q=${q}`);
export const createStock   = (data)  => axios.post(`${BASE}/stock`, data);
export const updateStock   = (id, data) => axios.put(`${BASE}/stock/${id}`, data);
export const deleteStock   = (id)    => axios.delete(`${BASE}/stock/${id}`);