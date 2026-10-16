import http from './http';

// Factory app only: changes the online server refused, and retrying them.
export const getRefusedChanges = () => http.get('/sync-quarantine');
export const retryRefusedChange = (id) => http.post(`/sync-quarantine/${id}/retry`);
