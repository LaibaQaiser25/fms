// Single source of truth for backend URLs.
// VITE_API_URL (set at build time) overrides the production default.
// A relative one ('/api', the factory build: desktop/scripts/stage.js) means
// "the server this page came from", by whatever name or address it was
// opened — http://fms-host:48620 from another factory PC (T3.4). It is
// resolved to a full URL here, so AUTH_BASE_URL, the WebSocket URL and
// requests like http.get(`${AUTH_BASE_URL}/status`) stay absolute (a bare
// '/status' would get axios's '/api' prefix).
// The auth endpoints (/auth/login, /auth/me) are mounted at the server root,
// NOT under /api, so the auth base is the API base minus the /api suffix.
const API_BASE_URL = new URL(import.meta.env.VITE_API_URL || 'https://api.ittefaqbuilder.com/api', window.location.origin)
  .href.replace(/\/$/, '');
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

// VITE_SITE_VARIANT fixes it at build time instead. The factory build sets
// 'app' (desktop/scripts/stage.js, D13): it is opened by a LAN name or IP
// (fms-host, 192.168.1.20) that matches neither list, which would otherwise
// fall to 'all' and serve the marketing pages at "/" (F11).
const SITE = import.meta.env.VITE_SITE_VARIANT || (() => {
  const host = window.location.hostname;
  if (host === new URL(APP_URL).hostname) return 'app';
  if (PUBLIC_HOSTS.includes(host)) return 'public';
  return 'all';
})();

// The factory desktop app's build (desktop/scripts/stage.js). Offline Setup
// exists only on the online dashboard, never inside the factory app.
const IS_DESKTOP = import.meta.env.VITE_FMS_DESKTOP === '1';

export { API_BASE_URL, AUTH_BASE_URL, APP_URL, SITE, IS_DESKTOP };
