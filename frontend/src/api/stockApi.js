import axios from 'axios';

const BASE = 'http://localhost:5000/api';

export const getAllStock   = ()      => axios.get(`${BASE}/stock`);
export const searchStock   = (q)     => axios.get(`${BASE}/stock/search?q=${q}`);
export const createStock   = (data)  => axios.post(`${BASE}/stock`, data);
export const updateStock   = (id, data) => axios.put(`${BASE}/stock/${id}`, data);
export const deleteStock   = (id)    => axios.delete(`${BASE}/stock/${id}`);
export const getStockById  = (id)    => axios.get(`${BASE}/stock/${id}`);

// Additional methods for dashboard
export const checkStockAvailability = (stockId, quantity) =>
  getAllStock().then(res => {
    const stock = res.data.find(s => s.id === stockId);
    return stock && stock.quantity >= quantity;
  });

export const getLowStockAlerts = () =>
  getAllStock().then(res => {
    return res.data.filter(s => s.quantity <= (s.minimum_stock || 10));
  });