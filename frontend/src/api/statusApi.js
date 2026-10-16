import http from './http';
import { AUTH_BASE_URL } from '../config';

// Factory app: upload + WhatsApp status of this factory PC. GET /status sits
// at the server root (not under /api), like /auth.
export const getFactoryPcStatus = () => http.get(`${AUTH_BASE_URL}/status`);

// Online dashboard: when the factory was last heard from.
export const getFactorySyncStatus = () => http.get('/sync-status');
