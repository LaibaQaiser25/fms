import http from './http';

// Log a raw material usage entry
export const logConsumption = (data) => http.post(`/raw-material-consumption`, data);

// Consumption history, optional raw_material_id filter
export const getConsumptionHistory = (rawMaterialId, page = 1, limit = 10) => {
  const params = new URLSearchParams({ page, limit });
  if (rawMaterialId) params.set('raw_material_id', rawMaterialId);
  return http.get(`/raw-material-consumption?${params.toString()}`);
};

// Today's consumption entries
export const getTodaysConsumption = () =>
  http.get(`/raw-material-consumption/today`);
