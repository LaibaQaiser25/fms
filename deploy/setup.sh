#!/usr/bin/env bash
# FMS one-shot production setup on a fresh machine (idempotent).
#
# PREREQUISITES:
#   - Docker Engine + compose plugin installed
#   - Repo cloned; env files created from the .example templates:
#       cp .env.example .env                # then fill POSTGRES_PASSWORD etc.
#       cp backend/.env.example backend/.env
#       cp deploy/.env.n8n.example deploy/.env.n8n
#   - N8N_ADMIN_PASSWORD and OWNER_PASSWORD set (or you'll be prompted)
#
# RUN:  bash deploy/setup.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

echo "==> [1/7] Validating env files"
for f in .env backend/.env deploy/.env.n8n; do
  if [ ! -f "$f" ]; then echo "ERROR: $f missing — copy from ${f}.example and fill in."; exit 1; fi
done
grep -q 'POSTGRES_PASSWORD=change-me' .env && { echo "ERROR: .env still has placeholders"; exit 1; }
grep -qE '^(JWT_SECRET|BACKEND_WEBHOOK_SECRET|N8N_INBOUND_SECRET)=change-me' backend/.env && \
  { echo "ERROR: backend/.env still has placeholders"; exit 1; }
grep -qE '^(TWILIO_AUTH_TOKEN|BACKEND_WEBHOOK_SECRET)=change-me' deploy/.env.n8n && \
  { echo "ERROR: deploy/.env.n8n still has placeholders"; exit 1; }
echo "    env files OK"

# Prompt helper — reads a secret if the env var isn't set
prompt_secret() { # $1 = var name, $2 = prompt text
  local var="$1" text="$2"
  if [ -z "${!var:-}" ]; then
    echo -n "$text: "
    read -rs "$var"; echo
  fi
}

echo "==> [2/7] Starting Postgres"
docker compose up -d db
echo "    waiting for healthy..."
DB_CID="$(docker compose ps -q db)"
for i in $(seq 1 30); do
  st="$(docker inspect --format='{{.State.Health.Status}}' "$DB_CID" 2>/dev/null || echo starting)"
  [ "$st" = "healthy" ] && break
  [ "$i" = 30 ] && { echo "ERROR: db not healthy"; docker compose logs db | tail -20; exit 1; }
  sleep 2
done
echo "    db healthy"

echo "==> [3/7] Loading base schema (pgdb.sql) — idempotent"
SCHEMA_MARKER="$(docker compose exec -T db psql -U fms_app -d fms_db -tAc \
  "SELECT to_regclass('public.users');" 2>/dev/null || true)"
if [ "$SCHEMA_MARKER" = "public.users" ]; then
  echo "    schema already present — skipping"
else
  docker compose exec -T db psql -U fms_app -d fms_db -v ON_ERROR_STOP=1 -f - < backend/db/pgdb.sql >/dev/null
  echo "    base schema loaded"
fi

echo "==> [4/7] Building + starting backend (auto-runs migrations)"
docker compose build backend
docker compose up -d backend
for i in $(seq 1 20); do
  if docker compose exec -T backend sh -c 'wget -qO- http://localhost:5000/auth/login >/dev/null 2>&1' 2>/dev/null; then break; fi
  sleep 2
done
echo "    backend up (migrations run on boot)"

echo "==> [5/7] Seeding Owner user (idempotent)"
if [ "$(docker compose exec -T db psql -U fms_app -d fms_db -tAc \
    "SELECT count(*) FROM users WHERE username='owner';" 2>/dev/null | tr -d ' ')" = "0" ]; then
  prompt_secret OWNER_PASSWORD "Set the 'owner' app login password"
  docker cp deploy/seed-owner.js "$(docker compose ps -q backend):/tmp/seed-owner.js"
  docker compose exec -T -e OWNER_PW="$OWNER_PASSWORD" backend node /tmp/seed-owner.js
  echo "    Owner user seeded"
else
  echo "    Owner already exists — leaving credentials unchanged"
fi

echo "==> [6/7] Starting n8n"
docker compose up -d n8n
for i in $(seq 1 30); do
  curl -sf -o /dev/null http://127.0.0.1:5678/healthz && break
  [ "$i" = 30 ] && { echo "ERROR: n8n not up"; docker compose logs n8n | tail -20; exit 1; }
  sleep 2
done
echo "    n8n up"

echo "==> [7/7] Provisioning n8n (owner, API key, workflows, credential)"
prompt_secret N8N_ADMIN_PASSWORD "Set the n8n admin password (8+ chars, incl. a number)"
N8N_ADMIN_PASSWORD="$N8N_ADMIN_PASSWORD" bash deploy/provision-n8n.sh

echo
echo "============================================================"
echo " SETUP COMPLETE"
echo "   backend:  http://127.0.0.1:5000"
echo "   n8n:      http://127.0.0.1:5678"
echo "   app login: owner / (password you set)"
echo " NEXT: expose publicly via cloudflared named tunnel"
echo "   -> see DEPLOYMENT.md + deploy/go-live-named-tunnel.sh"
echo "============================================================"
