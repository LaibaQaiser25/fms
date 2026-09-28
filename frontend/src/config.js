// Single source of truth for backend URLs.
// VITE_API_URL (set at build time) overrides the production default.
// The auth endpoints (/auth/login, /auth/me) are mounted at the server root,
// NOT under /api, so the auth base is the API base minus the /api suffix.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.ittefaqbuilder.com/api';
const AUTH_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

// One build serves two domains (both attached to the same Vercel project):
//   - the public marketing site (ittefaqbuilder.com, www.) — no login, and any
//     dashboard path redirects to the app domain
//   - the management dashboard (app.ittefaqbuilder.com) — "/" goes to /login
// Anything else (localhost, *.vercel.app previews) is 'all': public pages at
// "/" plus /login and the dashboard, so both halves work in dev.
// VITE_APP_URL overrides the dashboard domain.
const APP_URL = (import.meta.env.VITE_APP_URL || 'https://app.ittefaqbuilder.com').replace(/\/$/, '');
const PUBLIC_HOSTS = ['ittefaqbuilder.com', 'www.ittefaqbuilder.com'];

const SITE = (() => {
  const host = window.location.hostname;
  if (host === new URL(APP_URL).hostname) return 'app';
  if (PUBLIC_HOSTS.includes(host)) return 'public';
  return 'all';
})();

export { API_BASE_URL, AUTH_BASE_URL, APP_URL, SITE };
