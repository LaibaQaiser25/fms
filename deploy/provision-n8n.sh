#!/usr/bin/env bash
# Create the n8n owner + API key (idempotent), then run the JS provisioner.
#
# Needs deploy/.env.n8n to exist (copy from .env.example and fill in).
# Optional overrides:
#   N8N_ADMIN_EMAIL, N8N_ADMIN_PASSWORD  — n8n owner login (defaults below)
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
N8N_BASE="${N8N_BASE_URL:-http://127.0.0.1:5678}"
ADMIN_EMAIL="${N8N_ADMIN_EMAIL:-admin@binzahidtraders.com}"

# Load n8n env (for the encryption-key note) but passwords come from CLI/env
if [ ! -f deploy/.env.n8n ]; then
  echo "ERROR: deploy/.env.n8n missing. Copy deploy/.env.n8n.example and fill it in."
  exit 1
fi

# Owner password: required. Prefer env, else prompt.
if [ -z "${N8N_ADMIN_PASSWORD:-}" ]; then
  echo -n "n8n admin password (min 8 chars, incl. a number): "
  read -rs N8N_ADMIN_PASSWORD
  echo
fi

echo "==> Waiting for n8n at ${N8N_BASE} ..."
for i in $(seq 1 30); do
  if curl -sf -o /dev/null "${N8N_BASE}/healthz"; then break; fi
  [ "$i" = 30 ] && { echo "n8n not reachable"; exit 1; }
  sleep 2
done

COOKIE_JAR="$(mktemp)"

echo "==> Checking if owner exists (try login)"
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "${N8N_BASE}/rest/login" \
  -H 'Content-Type: application/json' \
  -d "{\"emailOrLdapLoginId\":\"${ADMIN_EMAIL}\",\"password\":\"${N8N_ADMIN_PASSWORD}\"}")
if echo "$LOGIN" | grep -q '"id"'; then
  echo "    owner already exists"
else
  echo "==> Creating n8n owner (${ADMIN_EMAIL})"
  curl -s -X POST "${N8N_BASE}/rest/owner/setup" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"firstName\":\"FMS\",\"lastName\":\"Admin\",\"password\":\"${N8N_ADMIN_PASSWORD}\"}" >/dev/null
  curl -s -c "$COOKIE_JAR" -X POST "${N8N_BASE}/rest/login" \
    -H 'Content-Type: application/json' \
    -d "{\"emailOrLdapLoginId\":\"${ADMIN_EMAIL}\",\"password\":\"${N8N_ADMIN_PASSWORD}\"}" >/dev/null
fi

echo "==> Ensuring an API key exists"
# Reuse an existing key labelled 'fms-deploy' if present
EXISTING=$(curl -s -b "$COOKIE_JAR" "${N8N_BASE}/rest/api-keys")
KEY_ID=$(echo "$EXISTING" | grep -o '"id":"[^"]*","label":"fms-deploy"' | head -1 | sed 's/"id":"//;s/","label".*//')
RAW_KEY=""
if [ -n "$KEY_ID" ]; then
  # api key values are only shown once at creation; if we can't read it back we
  # delete and recreate so we always end up with a usable key in the env file.
  curl -s -b "$COOKIE_JAR" -X DELETE "${N8N_BASE}/rest/api-keys/${KEY_ID}" >/dev/null || true
fi
CREATED=$(curl -s -b "$COOKIE_JAR" -X POST "${N8N_BASE}/rest/api-keys" \
  -H 'Content-Type: application/json' \
  -d '{"label":"fms-deploy","scopes":["credential:create","credential:read","credential:update","credential:delete","workflow:activate","workflow:read","workflow:update","workflow:list"],"expiresAt":null}')
RAW_KEY=$(echo "$CREATED" | sed -n 's/.*"rawApiKey":"\([^"]*\)".*/\1/p')
if [ -z "$RAW_KEY" ]; then
  echo "ERROR: could not create API key. Response: $CREATED"
  exit 1
fi
echo "    API key ready"

echo "==> Running JS provisioner (workflows + credential)"
N8N_API_KEY="$RAW_KEY" N8N_BASE_URL="$N8N_BASE" node deploy/provision-n8n.js

rm -f "$COOKIE_JAR"
echo "DONE."
