import http from './http';

// Offline Setup (Owner only, online dashboard): register the main factory PC,
// and the setup name + logo it shows.
export const getOfflineSetup = () => http.get('/offline-setup');
export const saveSetupName = (setupName) => http.put('/offline-setup/settings', { setupName });
// The file itself is the body; the server checks its type from its contents.
export const uploadLogo = (file) =>
  http.put('/offline-setup/logo', file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } });
export const resetLogo = () => http.delete('/offline-setup/logo');
export const createSetupCode = () => http.post('/offline-setup/setup-code');
