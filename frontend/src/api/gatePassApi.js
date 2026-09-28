import http from './http';

// Search sales (kind 'order', status ready) or purchases (kind 'received')
// that don't have a gate pass yet, by party name or phone
export const searchEligible = (kind, search) =>
  http.get(`/gate-passes/eligible`, { params: { kind, search } });

// Generate a gate pass: { kind, ref_id, vehicle_no, driver_name, notes }
export const createGatePass = (data) => http.post(`/gate-passes`, data);

// Get a gate pass with its reference record and items
export const getGatePass = (id) => http.get(`/gate-passes/${id}`);
