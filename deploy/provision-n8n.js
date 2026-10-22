#!/usr/bin/env node
/**
 * Provision n8n for FMS on a fresh machine — workflow + credential half.
 *
 * Reads deploy/.env.n8n (and SYNC_TOKEN from backend/.env), transforms the RAW repo
 * workflows (n8n/fms-whatsapp-alerts.json, n8n/fms-sync-watchdog.json, and
 * n8n/fms-whatsapp-status.json once META_STATUS_WEBHOOK_SECRET is set — until
 * then the alerts workflow's "Remember sent" node is left out too):
 *   - substitutes {{ $env.X }} with real values (n8n 2.x blocks $env in expressions)
 *   - swaps the placeholder credential id (meta-whatsapp-header-auth) for the real one
 *   - drops the unused "Respond to Webhook" node (responseMode=lastNode + Respond
 *     node is rejected by n8n 2.x)
 * then upserts + activates the workflows and creates their credentials (Meta
 * WhatsApp Cloud API + webhook secret headers; with the status workflow, the
 * FMS Postgres login from the root .env) — all via the n8n public API.
 *
 * Requires N8N_API_KEY (created by provision-n8n.sh). Idempotent.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const N8N_BASE = process.env.N8N_BASE_URL || 'http://127.0.0.1:5678';
const API_KEY = process.env.N8N_API_KEY;
if (!API_KEY) {
  console.error('ERROR: N8N_API_KEY not set — run deploy/provision-n8n.sh first (it creates the key).');
  process.exit(1);
}

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const n8nEnv = { ...loadEnv(path.join(ROOT, 'deploy/.env.n8n')) };
const backendEnv = loadEnv(path.join(ROOT, 'backend/.env'));

const env = {
  META_WHATSAPP_TOKEN: n8nEnv.META_WHATSAPP_TOKEN,
  META_PHONE_NUMBER_ID: n8nEnv.META_PHONE_NUMBER_ID,
  WHATSAPP_TO_NUMBER: n8nEnv.WHATSAPP_TO_NUMBER,
  WEBHOOK_URL: n8nEnv.WEBHOOK_URL || 'http://localhost:5678/',
  // Must match N8N_WEBHOOK_SECRET in backend/.env (sent as X-FMS-Secret).
  N8N_WEBHOOK_SECRET: n8nEnv.N8N_WEBHOOK_SECRET,
  // Sync watchdog (T2.4): reads the backend's GET /sync/health over the
  // compose network, and sends through the alerts workflow above.
  SYNC_TOKEN: backendEnv.SYNC_TOKEN,
  FMS_HEALTH_URL: n8nEnv.FMS_HEALTH_URL || 'http://backend:5000/sync/health',
  WATCHDOG_ALERT_URL: n8nEnv.WATCHDOG_ALERT_URL || 'http://localhost:5678/webhook/fms-alert',
};
// Optional: the approved Meta template alerts go out as (docs/whatsapp-alerts.md, "Templates").
// Empty = free-form text, which Meta only delivers inside the 24-hour window.
Object.assign(env, {
  WHATSAPP_TEMPLATE_NAME: n8nEnv.WHATSAPP_TEMPLATE_NAME || '',
  WHATSAPP_TEMPLATE_LANG: n8nEnv.WHATSAPP_TEMPLATE_LANG || 'en',
  // Optional: turns on the delivery-status workflow. It is both the secret
  // part of the Callback URL given to Meta and Meta's verify token.
  META_STATUS_WEBHOOK_SECRET: n8nEnv.META_STATUS_WEBHOOK_SECRET || '',
});
const OPTIONAL = new Set(['WHATSAPP_TEMPLATE_NAME', 'META_STATUS_WEBHOOK_SECRET']);
if (env.META_STATUS_WEBHOOK_SECRET && !/^[A-Za-z0-9_-]{24,}$/.test(env.META_STATUS_WEBHOOK_SECRET)) {
  console.error('ERROR: META_STATUS_WEBHOOK_SECRET must be at least 24 letters/digits/-/_ (openssl rand -hex 24).');
  process.exit(1);
}
// Both are pasted into the workflow's code as JS strings.
if (!/^[a-z0-9_]*$/.test(env.WHATSAPP_TEMPLATE_NAME) || !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(env.WHATSAPP_TEMPLATE_LANG)) {
  console.error('ERROR: WHATSAPP_TEMPLATE_NAME must be lowercase letters/digits/_ (e.g. fms_alert) and WHATSAPP_TEMPLATE_LANG a Meta language code (e.g. en, en_US).');
  process.exit(1);
}
// Delivery tracking (whatsapp_messages, migration 029) is written by n8n
// straight into the FMS database over the compose network.
const tracking = Boolean(env.META_STATUS_WEBHOOK_SECRET);
const rootEnv = loadEnv(path.join(ROOT, '.env'));
const db = {
  host: n8nEnv.FMS_DB_HOST || 'db',
  port: Number(n8nEnv.FMS_DB_PORT || 5432),
  database: n8nEnv.FMS_DB_NAME || 'fms_db',
  user: n8nEnv.FMS_DB_USER || 'fms_app',
  password: rootEnv.POSTGRES_PASSWORD,
};
if (tracking && (!db.password || db.password === 'change-me')) {
  console.error('ERROR: META_STATUS_WEBHOOK_SECRET is set, so n8n needs the database: POSTGRES_PASSWORD missing in the root .env.');
  process.exit(1);
}
for (const [k, v] of Object.entries(env)) {
  if (OPTIONAL.has(k)) continue;
  if (!v || v === 'change-me') {
    console.error(`ERROR: missing value for ${k} — fill in ${k === 'SYNC_TOKEN' ? 'backend/.env' : 'deploy/.env.n8n'} first.`);
    process.exit(1);
  }
}

async function api(method, urlPath, body) {
  const headers = { 'Content-Type': 'application/json', 'X-N8N-API-KEY': API_KEY };
  const res = await fetch(`${N8N_BASE}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

function substituteEnv(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\{\{\s*\$env\.([A-Z0-9_]+)\s*\}\}/g, (m, name) => {
      if (!(name in env)) throw new Error(`no value for $env.${name}`);
      return env[name];
    });
  }
  if (Array.isArray(obj)) return obj.map(substituteEnv);
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) obj[k] = substituteEnv(v);
    return obj;
  }
  return obj;
}

// drop: node names to leave out (their links go too).
function transformWorkflow(rawPath, drop = []) {
  const wf = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  substituteEnv(wf);
  const webhook = wf.nodes.find((n) => n.name === 'Webhook');
  if (webhook?.parameters?.responseMode === 'lastNode') drop = [...drop, 'Respond to Webhook'];
  if (drop.length) {
    wf.nodes = wf.nodes.filter((n) => !drop.includes(n.name));
    const names = new Set(wf.nodes.map((n) => n.name));
    const cleaned = {};
    for (const [from, conns] of Object.entries(wf.connections)) {
      if (!names.has(from)) continue;
      cleaned[from] = {
        ...conns,
        main: (conns.main || []).map((b) => (b || []).filter((r) => names.has(r.node))),
      };
    }
    wf.connections = cleaned;
  }
  return wf;
}

(async () => {
  const alerts = transformWorkflow(path.join(ROOT, 'n8n/fms-whatsapp-alerts.json'), tracking ? [] : ['Remember sent']);
  const watchdog = transformWorkflow(path.join(ROOT, 'n8n/fms-sync-watchdog.json'));
  const status = tracking ? transformWorkflow(path.join(ROOT, 'n8n/fms-whatsapp-status.json')) : null;

  // 1. Credentials (one per node name) -----------------------------------
  // The public API forbids LISTING credentials, so we derive each existing
  // credential id from the node in a deployed workflow that references it
  // (matched by node name and credential type), and verify it still exists
  // (GET by id). If none is found, create one.
  const list = await api('GET', '/api/v1/workflows');
  const deployedNodes = (list.status === 200 && list.json?.data || []).flatMap((w) => w.nodes || []);

  async function ensureCred(nodeName, type, credName, data) {
    const id = deployedNodes.find((n) => n.name === nodeName && n.credentials?.[type])?.credentials[type].id;
    if (id && (await api('GET', `/api/v1/credentials/${id}`)).status === 200) {
      console.log(`Reusing credential "${credName}" from existing workflow ref:`, id);
      return id;
    }
    const created = await api('POST', '/api/v1/credentials', { name: credName, type, data });
    if (created.status !== 201 && created.status !== 200) {
      console.error(`credential create failed for "${credName}":`, JSON.stringify(created.json || created.text));
      process.exit(1);
    }
    console.log(`Credential "${credName}" created:`, created.json.id);
    return created.json.id;
  }

  const credIds = {
    httpHeaderAuth: {
      'Send WhatsApp Message': await ensureCred('Send WhatsApp Message', 'httpHeaderAuth',
        'Meta WhatsApp Cloud API Credentials', { name: 'Authorization', value: `Bearer ${env.META_WHATSAPP_TOKEN}` }),
      // Checked by the Webhook node's header auth — requests without a matching
      // X-FMS-Secret header are rejected with 403 before any node runs.
      'Webhook': await ensureCred('Webhook', 'httpHeaderAuth',
        'FMS Webhook Secret', { name: 'X-FMS-Secret', value: env.N8N_WEBHOOK_SECRET }),
    },
    postgres: {},
  };
  if (tracking) {
    const pgId = await ensureCred('Remember sent', 'postgres', 'FMS Postgres',
      { ...db, ssl: 'disable', allowUnauthorizedCerts: false, maxConnections: 5 });
    for (const n of [...alerts.nodes, ...status.nodes]) if (n.credentials?.postgres) credIds.postgres[n.name] = pgId;
  }

  // 2. Workflows (upsert by name, then activate) -------------------------
  const existing = (list.json?.data || []).reduce((m, w) => { m[w.name] = w; return m; }, {});

  for (const n of [...alerts.nodes, ...(status?.nodes || [])]) {
    for (const type of Object.keys(n.credentials || {})) n.credentials[type].id = credIds[type][n.name];
  }
  async function upsert(wf) {
    const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {} };
    let id = existing[wf.name]?.id;
    if (id) {
      const upd = await api('PUT', `/api/v1/workflows/${id}`, payload);
      if (upd.status !== 200) { console.error(`update failed for ${wf.name}:`, upd.text); process.exit(1); }
    } else {
      const created = await api('POST', '/api/v1/workflows', payload);
      if (created.status !== 200 && created.status !== 201) {
        console.error(`create failed for ${wf.name}:`, created.text);
        process.exit(1);
      }
      id = created.json.id;
    }
    const act = await api('POST', `/api/v1/workflows/${id}/activate`);
    if (act.status !== 200 && act.status !== 201) {
      console.error(`activate failed for ${wf.name}:`, act.text);
      process.exit(1);
    }
    console.log(`workflow ready & active: ${wf.name} (${id})`);
  }
  await upsert(alerts);
  await upsert(watchdog);
  if (status) {
    await upsert(status);
    console.log('\nMeta delivery statuses (docs/whatsapp-alerts.md, "Free tier"):');
    console.log(`  Callback URL: ${env.WEBHOOK_URL.replace(/\/?$/, '/')}webhook/meta-status/${env.META_STATUS_WEBHOOK_SECRET}`);
    console.log(`  Verify token: ${env.META_STATUS_WEBHOOK_SECRET}`);
  } else {
    console.log('(delivery-status workflow skipped: META_STATUS_WEBHOOK_SECRET not set)');
  }

  console.log('\nDONE. n8n workflows + credentials provisioned from code.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
