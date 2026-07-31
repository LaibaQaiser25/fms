import http from './http';

export const getAllStock   = ()      => http.get(`/stock`);
export const searchStock   = (q)     => http.get(`/stock/search?q=${q}`);
export const createStock   = (data)  => http.post(`/stock`, data);
export const updateStock   = (id, data) => http.put(`/stock/${id}`, data);
export const deleteStock   = (id)    => http.delete(`/stock/${id}`);
export const getStockById  = (id)    => http.get(`/stock/${id}`);

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
