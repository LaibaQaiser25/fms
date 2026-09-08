#!/usr/bin/env node
/**
 * Provision n8n for FMS on a fresh machine — workflow + credential half.
 *
 * Reads deploy/.env.n8n, transforms the RAW repo workflow (n8n/fms-whatsapp-alerts.json):
 *   - substitutes {{ $env.X }} with real values (n8n 2.x blocks $env in expressions)
 *   - swaps the placeholder credential id (meta-whatsapp-header-auth) for the real one
 *   - drops the unused "Respond to Webhook" node (responseMode=lastNode + Respond
 *     node is rejected by n8n 2.x)
 * then upserts + activates the workflow and creates the Meta WhatsApp Cloud API
 * httpHeaderAuth credential — all via the n8n public API.
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

const env = {
  META_WHATSAPP_TOKEN: n8nEnv.META_WHATSAPP_TOKEN,
  META_PHONE_NUMBER_ID: n8nEnv.META_PHONE_NUMBER_ID,
  WHATSAPP_TO_NUMBER: n8nEnv.WHATSAPP_TO_NUMBER,
  WEBHOOK_URL: n8nEnv.WEBHOOK_URL || 'http://localhost:5678/',
};
for (const [k, v] of Object.entries(env)) {
  if (!v || v === 'change-me') {
    console.error(`ERROR: missing value for ${k} — fill in deploy/.env.n8n first.`);
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

  // 1. Meta WhatsApp credential ------------------------------------------
  // The public API forbids LISTING credentials, so we derive the existing
  // credential id from the workflow that already references it, and verify
  // it still exists (GET by id). If none is found, create one.
  let credId = null;
  const list = await api('GET', '/api/v1/workflows');
  if (list.status === 200 && list.json?.data) {
    for (const w of list.json.data) {
      for (const n of w.nodes || []) {
        const id = n.credentials?.httpHeaderAuth?.id;
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
      name: 'Meta WhatsApp Cloud API Credentials',
      type: 'httpHeaderAuth',
      data: {
        name: 'Authorization',
        value: `Bearer ${env.META_WHATSAPP_TOKEN}`,
      },
    });
    if (created.status !== 201 && created.status !== 200) {
      console.error('credential create failed:', JSON.stringify(created.json || created.text));
      process.exit(1);
    }
    credId = created.json.id;
    console.log('Meta WhatsApp credential created:', credId);
  } else {
    console.log('Reusing Meta WhatsApp credential from existing workflow ref:', credId);
  }

  // 2. Workflow (upsert by name, then activate) --------------------------
  const existing = (list.json?.data || []).reduce((m, w) => { m[w.name] = w; return m; }, {});

  alerts.nodes.forEach((n) => {
    if (n.credentials?.httpHeaderAuth) n.credentials.httpHeaderAuth.id = credId;
  });
  const payload = { name: alerts.name, nodes: alerts.nodes, connections: alerts.connections, settings: alerts.settings || {} };
  let id = existing[alerts.name]?.id;
  if (id) {
    const upd = await api('PUT', `/api/v1/workflows/${id}`, payload);
    if (upd.status !== 200) { console.error(`update failed for ${alerts.name}:`, upd.text); process.exit(1); }
  } else {
    const created = await api('POST', '/api/v1/workflows', payload);
    if (created.status !== 200 && created.status !== 201) {
      console.error(`create failed for ${alerts.name}:`, created.text);
      process.exit(1);
    }
    id = created.json.id;
  }
  const act = await api('POST', `/api/v1/workflows/${id}/activate`);
  if (act.status !== 200 && act.status !== 201) {
    console.error(`activate failed for ${alerts.name}:`, act.text);
    process.exit(1);
  }
  console.log(`workflow ready & active: ${alerts.name} (${id})`);

  console.log('\nDONE. n8n workflow + credential provisioned from code.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
