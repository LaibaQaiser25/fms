#!/usr/bin/env node
/**
 * Provision n8n for FMS on a fresh machine — workflow + credential half.
 *
 * Reads deploy/.env.n8n (and backend/.env for BACKEND_WEBHOOK_SECRET), transforms
 * the RAW repo workflows (n8n/*.json):
 *   - substitutes {{ $env.X }} with real values (n8n 2.x blocks $env in expressions)
 *   - swaps the placeholder credential id (twilio-basic-auth) for the real one
 *   - drops the unused "Respond to Webhook" node from the alerts workflow
 *     (responseMode=lastNode + Respond node is rejected by n8n 2.x)
 * then upserts + activates both workflows and creates the Twilio httpBasicAuth
 * credential — all via the n8n public API.
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
const backendEnv = { ...loadEnv(path.join(ROOT, 'backend/.env')) };
const secret =
  n8nEnv.BACKEND_WEBHOOK_SECRET && n8nEnv.BACKEND_WEBHOOK_SECRET !== 'change-me'
    ? n8nEnv.BACKEND_WEBHOOK_SECRET
    : backendEnv.BACKEND_WEBHOOK_SECRET;

const env = {
  TWILIO_ACCOUNT_SID: n8nEnv.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: n8nEnv.TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM: n8nEnv.TWILIO_WHATSAPP_FROM,
  WHATSAPP_TO_NUMBER: n8nEnv.WHATSAPP_TO_NUMBER,
  BACKEND_URL: n8nEnv.BACKEND_URL || 'http://backend:5000',
  BACKEND_WEBHOOK_SECRET: secret,
  WEBHOOK_URL: n8nEnv.WEBHOOK_URL || 'http://localhost:5678/',
};
for (const [k, v] of Object.entries(env)) {
  if (!v || v === 'change-me') {
    console.error(`ERROR: missing value for ${k} — fill in deploy/.env.n8n / backend/.env first.`);
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

function transformWorkflow(rawPath) {
  const wf = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  substituteEnv(wf);
  const webhook = wf.nodes.find((n) => n.name === 'Webhook');
  if (webhook?.parameters?.responseMode === 'lastNode') {
    wf.nodes = wf.nodes.filter((n) => n.name !== 'Respond to Webhook');
    delete wf.connections['Respond to Webhook'];
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
  const alerts = transformWorkflow(path.join(ROOT, 'n8n/fms-whatsapp-alerts.json'));
  const inbound = transformWorkflow(path.join(ROOT, 'n8n/fms-whatsapp-inbound.json'));

  // 1. Twilio credential ------------------------------------------------
  // The public API forbids LISTING credentials, so we derive the existing
  // credential id from the workflows that already reference it, and verify
  // it still exists (GET by id). If none is found, create one.
  let credId = null;
  const list = await api('GET', '/api/v1/workflows');
  if (list.status === 200 && list.json?.data) {
    for (const w of list.json.data) {
      for (const n of w.nodes || []) {
        const id = n.credentials?.httpBasicAuth?.id;
        if (!id) continue;
        const check = await api('GET', `/api/v1/credentials/${id}`);
        if (check.status === 200) credId = id;
        break;
      }
      if (credId) break;
    }
  }
  if (!credId) {
    const created = await api('POST', '/api/v1/credentials', {
      name: 'Twilio Account Credentials',
      type: 'httpBasicAuth',
      data: {
        user: env.TWILIO_ACCOUNT_SID,
        password: env.TWILIO_AUTH_TOKEN,
        allowedHttpRequestDomains: 'all',
      },
    });
    if (created.status !== 201 && created.status !== 200) {
      console.error('credential create failed:', JSON.stringify(created.json || created.text));
      process.exit(1);
    }
    credId = created.json.id;
    console.log('Twilio credential created:', credId);
  } else {
    console.log('Reusing Twilio credential from existing workflow ref:', credId);
  }

  // 2. Workflows (upsert by name, then activate) --------------------------
  const existing = (list.json?.data || []).reduce((m, w) => { m[w.name] = w; return m; }, {});

  for (const wf of [alerts, inbound]) {
    wf.nodes.forEach((n) => {
      if (n.credentials?.httpBasicAuth) n.credentials.httpBasicAuth.id = credId;
    });
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

  console.log('\nDONE. n8n workflows + credential provisioned from code.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
