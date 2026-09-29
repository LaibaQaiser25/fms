// Fixed, unusual ports so they don't clash with a dev backend (5000) or a
// system Postgres (5432). APP_PORT must stay fixed across releases: the
// frontend is built against it, and the login token lives in localStorage,
// which is keyed by origin (host + port).
module.exports = {
  APP_PORT: 48620,
  PG_PORT: 48621,
  ALERT_PORT: 48622, // lib/alertRelay.js (backend -> relay -> n8n)
};
