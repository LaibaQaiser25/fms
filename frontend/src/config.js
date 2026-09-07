// Single source of truth for backend URLs.
// VITE_API_URL (set at build time) overrides the production default.
// The auth endpoints (/auth/login, /auth/me) are mounted at the server root,
// NOT under /api, so the auth base is the API base minus the /api suffix.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.ittefaqbuilder.com/api';
const AUTH_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export { API_BASE_URL, AUTH_BASE_URL };
