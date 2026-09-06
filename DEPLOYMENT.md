# FMS Production Deployment

Frontend: Vercel (`binzahidtraders.vercel.app`). Backend/Postgres/n8n: Docker Compose stack on a VPS.
Public ingress: Cloudflare named tunnel → `api.ittefaqbuilder.com` (backend) + `n8n.ittefaqbuilder.com` (n8n).

## Reproduce the whole stack on a fresh machine

The deployment is reproducible **from code**. A new machine needs only: Docker Engine +
compose plugin, the repo clone, and three env files filled with secrets.

```bash
# 1. Clone
git clone https://github.com/LaibaQaiser25/fms.git && cd fms

# 2. Create env files from templates and fill in real values
cp .env.example .env                      # POSTGRES_PASSWORD, N8N_PUBLIC_URL
cp backend/.env.example backend/.env      # DATABASE_URL pw, JWT_SECRET, Twilio, webhook secrets
cp deploy/.env.n8n.example deploy/.env.n8n  # Twilio, BACKEND_WEBHOOK_SECRET, encryption key

# 3. One-shot setup (idempotent; safe to re-run)
bash deploy/setup.sh
#    prompts for: owner app password, n8n admin password
```

`setup.sh` does, in order:
1. Validates env files have no `change-me` placeholders.
2. Starts Postgres and waits for healthy.
3. Loads `backend/db/pgdb.sql` base schema if `public.users` is absent (idempotent).
4. Builds + starts the backend — migrations 001–013 auto-run on boot.
5. Seeds the `owner` user (bcrypt) if missing.
6. Starts n8n.
7. Runs `deploy/provision-n8n.sh` → creates the n8n owner + API key, then
   `deploy/provision-n8n.js` transforms the raw workflows in `n8n/*.json`
   (substitutes `{{ $env.X }}` with real values, swaps in the real credential id,
   drops the unused Respond node from the alerts workflow), upserts + activates
   them, and creates the Twilio httpBasicAuth credential.

### Why the workflow files get transformed at provision time

The repo's raw `n8n/*.json` workflows are the portable source of truth. They use
`{{ $env.X }}` expressions and a placeholder credential id (`twilio-basic-auth`).
They cannot be imported verbatim on n8n 2.x because:
- n8n 2.x blocks `$env` access in node expressions (sandbox) → values are substituted.
- The placeholder credential id must be replaced with the real one.
- The alerts workflow's `responseMode: lastNode` + a `Respond to Webhook` node is
  rejected ("Unused Respond to Webhook node") → the Respond node is dropped.

After provisioning, the same workflows are also exported to `deploy/n8n-backup/`
for reference/inspection.

## Env files (all gitignored — never commit real secrets)

| File | Holds | Source template |
|------|-------|-----------------|
| `.env` | `POSTGRES_PASSWORD`, `N8N_PUBLIC_URL` | `.env.example` |
| `backend/.env` | `DATABASE_URL`, `JWT_SECRET`, Twilio, Groq/DeepSeek, webhook secrets | `backend/.env.example` |
| `deploy/.env.n8n` | n8n Twilio env, `BACKEND_WEBHOOK_SECRET`, `N8N_ENCRYPTION_KEY` | `deploy/.env.n8n.example` |

Generate secrets:
```bash
openssl rand -hex 24   # DB password, webhook secrets
openssl rand -hex 32   # JWT secret
```

`N8N_ENCRYPTION_KEY` note: on first boot n8n generates its own key and stores it in
the volume config (`/home/node/.n8n/config`). If you set the env var it MUST equal
the stored key or n8n refuses to start. Safest: leave it unset on first boot, then
pin the stored value into `deploy/.env.n8n` so container recreates keep working:
```bash
docker compose exec n8n cat /home/node/.n8n/config   # -> "encryptionKey": "..."
```

## Architecture

| Service | Container | Internal | Host | Public |
|---------|-----------|----------|------|--------|
| Postgres 16 | `db` | `db:5432` | — | none (private) |
| Backend (Node/Express) | `backend` | `backend:5000` | `127.0.0.1:5000` | `https://api.ittefaqbuilder.com` ✅ |
| n8n 2.x | `n8n` | `n8n:5678` | `127.0.0.1:5678` | `https://n8n.ittefaqbuilder.com` ✅ |

- `backend/Dockerfile` runs migrations on boot (`npx node-pg-migrate up`) then `node server.js`.
- DB base schema: `backend/db/pgdb.sql` (pgAdmin export). Migrations extend it.
- Nothing is exposed publicly except through the cloudflared tunnel — do NOT publish
  5000/5678 to `0.0.0.0`.

## Public exposure — DONE (named tunnel, live)

The tunnel is created and running as a systemd service (`cloudflared`), exposing:
- `https://api.ittefaqbuilder.com` → backend (verified: login + JWT + CORS all pass)
- `https://n8n.ittefaqbuilder.com` → n8n editor (verified: /healthz 200)

To re-run on a new machine / new domain after `cloudflared tunnel login`:
```bash
bash deploy/go-live-named-tunnel.sh            # default: api./n8n.ittefaqbuilder.com
bash deploy/go-live-named-tunnel.sh otherdomain.com
```

Remaining owner actions:
1. **Vercel**: set `VITE_API_URL=https://api.ittefaqbuilder.com/api` (project → Settings →
   Environment Variables) and redeploy.
2. **Twilio console**: point the WhatsApp message webhook at
   `https://n8n.ittefaqbuilder.com/webhook/twilio-incoming`.

## Normal operations

```bash
docker compose ps                       # status
docker compose logs -f backend          # backend logs
docker compose logs -f n8n              # n8n logs
docker compose restart backend          # restart backend
docker compose up -d --build backend    # rebuild after code change
docker compose down && docker compose up -d   # full restart (volumes kept)
```

Database:
```bash
docker compose exec db psql -U fms_app -d fms_db          # psql shell
docker compose exec -T db pg_dump -U fms_app -d fms_db > ~/backup-$(date +%F).sql
docker compose exec -T db psql -U fms_app -d fms_db < ~/backup-YYYY-MM-DD.sql
```

## Security

- Real secrets were committed to git history earlier (`backend/.env` was tracked):
  Twilio auth token, Groq/DeepSeek keys, old JWT + DB password. Treat them as
  compromised — rotate the Twilio Auth Token (it is currently stale/invalid:
  Twilio error 20003) and ideally the Groq/DeepSeek keys.
- `backend/.env`, `.env`, `deploy/` are gitignored.
- `backend/db/pool.js` intentionally does NOT log the full `DATABASE_URL`
  (it used to, leaking the DB password into logs).

## Known current state (deployment day)

- Twilio Auth Token is **stale** — update in `backend/.env`, `deploy/.env.n8n`,
  and the n8n "Twilio Account Credentials" httpBasicAuth credential (re-run
  `bash deploy/provision-n8n.sh` after updating the env files to refresh it).
- NLP route (`/api/nlp/nlp-search`) is commented out upstream (`routes/nlp-search.js`)
  and returns 404 — pre-existing, not a deployment issue.
