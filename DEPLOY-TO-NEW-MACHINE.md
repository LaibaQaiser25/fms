# Deploy FMS to a New Linux Machine — Step-by-Step Runbook

This guide takes a **fresh Linux VPS** from zero to a running, publicly reachable
FMS deployment (Postgres + backend + n8n behind a Cloudflare tunnel).

Everything except your secret values and one Cloudflare browser click is automated
by scripts committed in the repo under `deploy/`.

---

## 0. What you need before starting

| Item | Where to get it | Notes |
|------|-----------------|-------|
| A Linux VPS (Ubuntu 22.04/24.04 recommended) | your provider | 2+ GB RAM, root or sudo access |
| Docker + compose plugin | auto-installed in step 2 | — |
| The repo | `git clone` (step 2) | you need push/pull access as a collaborator |
| A domain on Cloudflare | already done: `ittefaqbuilder.com` | tunnel hostnames are `api.` and `n8n.` |
| Secret values | generate OR copy from the current VPS | see step 3 — these are NOT in the repo |
| Twilio Account SID + **current** Auth Token | Twilio console | required only if you want WhatsApp alerts working |

> If you are **migrating from the existing VPS** (keeping data), read
> "Appendix A — migrating existing data" first and do those steps.

---

## 1. Install Docker Engine + compose plugin

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out and back in (or run: newgrp docker) so the docker group takes effect
docker version        # verify the daemon responds
docker compose version
```

---

## 2. Clone the repo

```bash
git clone https://github.com/LaibaQaiser25/fms.git
cd fms
```

---

## 3. Create the three env files and fill in secrets

Each `.example` file documents its own variables. Copy and edit all three:

```bash
cp .env.example .env                      # root compose vars
cp backend/.env.example backend/.env      # backend secrets
cp deploy/.env.n8n.example deploy/.env.n8n  # n8n secrets
```

### What goes in each file

**`.env`** (root)
| Variable | Value |
|----------|-------|
| `POSTGRES_PASSWORD` | generate: `openssl rand -hex 24` |
| `N8N_PUBLIC_URL` | `http://localhost:5678/` for now (script updates it at go-live) |

**`backend/.env`**
| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://fms_app:<POSTGRES_PASSWORD>@db:5432/fms_db` — the password must match `.env` |
| `JWT_SECRET` | generate: `openssl rand -hex 32` |
| `FRONTEND_URL` | `https://ittefaqbuilder.com` (the frontend origin; CORS allows this) |
| `GROQ_API_KEY`, `DEEPSEEK_API_KEY` | your keys (only needed for NLP; can be `change-me` if unused) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | from Twilio console — must be **current**, the old committed token is revoked |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` (or your Twilio WhatsApp number) |
| `OWNER_WHATSAPP` | `whatsapp:+92XXXXXXXXXX` (the number that receives alerts) |
| `N8N_WEBHOOK_URL` | `http://n8n:5678/webhook/fms-alert` (internal Docker hostname — leave as-is) |
| `BACKEND_WEBHOOK_SECRET` | generate: `openssl rand -hex 24` — **must match** the same var in `deploy/.env.n8n` |
| `N8N_INBOUND_SECRET` | generate: `openssl rand -hex 24` |

**`deploy/.env.n8n`**
| Variable | Value |
|----------|-------|
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | same as backend (Twilio account) |
| `TWILIO_WHATSAPP_FROM` | E.164 **without** `whatsapp:` prefix, e.g. `+14155238886` |
| `WHATSAPP_TO_NUMBER` | E.164, e.g. `+92XXXXXXXXXX` |
| `BACKEND_URL` | `http://backend:5000` (internal Docker hostname — leave as-is) |
| `BACKEND_WEBHOOK_SECRET` | **same value** as in `backend/.env` |
| `WEBHOOK_URL` | `http://localhost:5678/` |
| `N8N_ENCRYPTION_KEY` | leave **empty** on first boot (see note below) |

> **N8N_ENCRYPTION_KEY note:** on first boot n8n generates its own key and stores
> it in its data volume. If you set this env var it MUST equal the stored key or
> n8n refuses to start. Safest: leave it empty on a fresh machine. To pin it later
> (so container recreates keep working): `docker compose exec n8n cat /home/node/.n8n/config`
> then copy the `encryptionKey` value into `deploy/.env.n8n`.

---

## 4. Run the one-shot setup

```bash
bash deploy/setup.sh
```

It will prompt for:
- the app **Owner** login password (the `owner` user you log into the FMS UI with)
- the **n8n admin** password (8+ chars, must include a number)

What the script does, in order (all idempotent — safe to re-run):
1. Validates the three env files have no `change-me` placeholders left.
2. `docker compose up -d db` — starts Postgres 16, waits for the healthcheck.
3. Loads `backend/db/pgdb.sql` (base schema) if the `users` table is absent.
4. Builds + starts the backend — node-pg-migrate runs migrations 001–013 on boot.
5. Seeds the `owner` user (bcrypt) if it doesn't exist.
6. Starts n8n and waits for `/healthz`.
7. Provisions n8n automatically: creates the admin user + API key, then
   `deploy/provision-n8n.js` transforms the raw `n8n/*.json` workflows
   (substitutes `{{ $env.X }}` with real values, swaps in the real credential id,
   drops the unused Respond node), imports + activates both workflows, and creates
   the "Twilio Account Credentials" httpBasicAuth credential.

**Verify it worked:**

```bash
docker compose ps                 # db healthy, backend up, n8n up
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:5000/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"x","password":"y"}'   # expect 401
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5678/healthz        # expect 200
```

At this point the stack runs **privately** on `127.0.0.1` (backend 5000, n8n 5678).
Nothing is public yet — that's the next step.

---

## 5. Expose it publicly via a Cloudflare named tunnel

### 5a. Install cloudflared

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared noble main" | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
sudo apt-get update && sudo apt-get install -y cloudflared
```

(For non-Ubuntu, use the instructions at https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

### 5b. Authorize this machine (the ONE interactive step)

```bash
cloudflared tunnel login
```

This prints a URL. Open it in a browser logged into your Cloudflare account
(the account that owns `ittefaqbuilder.com`) and click Authorize. It saves
`~/.cloudflared/cert.pem` on this machine. This cannot be scripted — Cloudflare
requires the browser round-trip.

> The username in the go-live script's config path is `myuser`. If your new
> machine's user is different, adjust the `credentials-file` line after the script
> writes the config (step 5c) — or edit `deploy/go-live-named-tunnel.sh` first.

### 5c. Run the go-live script

```bash
bash deploy/go-live-named-tunnel.sh ittefaqbuilder.com
```

This does everything else automatically:
1. Creates the named tunnel `fms` (idempotent) and symlinks its credentials file.
2. Writes the ingress config: `api.ittefaqbuilder.com → http://localhost:5000`
   and `n8n.ittefaqbuilder.com → http://localhost:5678`.
3. Adds the two DNS CNAME routes in Cloudflare.
4. Installs cloudflared as a systemd service (survives reboots) and waits until active.
5. Updates `N8N_PUBLIC_URL` in `.env` and recreates the n8n container.

### 5d. Verify publicly

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.ittefaqbuilder.com/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"x","password":"y"}'   # expect 401
curl -s -o /dev/null -w "%{http_code}\n" https://n8n.ittefaqbuilder.com/healthz  # expect 200
```

---

## 6. Point the frontend at the new backend (if needed)

The frontend code's default backend URL is `https://api.ittefaqbuilder.com/api`
(see `frontend/src/config.js`). If the backend hostname ever changes:

1. Vercel project → Settings → Environment Variables → set
   `VITE_API_URL=https://api.<your-domain>/api` for **Production**.
2. Redeploy (push to `main` or trigger a deploy). Vite bakes the value in at build
   time — a plain env change without a rebuild has no effect.

---

## 7. Final end-to-end checks

```bash
# 1. Login from the app: open https://ittefaqbuilder.com, log in as 'owner'
# 2. Create a product, then confirm it landed in Postgres:
docker compose exec db psql -U fms_app -d fms_db -c "SELECT * FROM products ORDER BY id DESC LIMIT 3;"

# 3. n8n workflows are imported + active:
curl -s -H "X-N8N-API-KEY: <key>" http://127.0.0.1:5678/api/v1/workflows
#    (get the key from provision-n8n.sh output, or the n8n UI)

# 4. WhatsApp (only if Twilio is configured): trigger the alerts webhook
curl -s -X POST https://n8n.ittefaqbuilder.com/webhook/fms-alert \
  -H 'Content-Type: application/json' -d '{"message":"test"}'
```

---

## Routine operations (cheat sheet)

```bash
cd fms
docker compose ps                       # status
docker compose logs -f backend          # backend logs
docker compose logs -f n8n              # n8n logs
docker compose restart backend          # restart backend
docker compose up -d --build backend    # rebuild after code change / git pull

# DB backup / restore
docker compose exec -T db pg_dump -U fms_app -d fms_db > ~/backup-$(date +%F).sql
docker compose exec -T db psql -U fms_app -d fms_db < ~/backup-YYYY-MM-DD.sql
```

---

## Appendix A — Migrating existing data from the current VPS

`setup.sh` provisions an **empty** database. If you're moving and want to keep
products, sales, users, etc.:

**On the OLD VPS:**
```bash
cd fms
docker compose exec -T db pg_dump -U fms_app -d fms_db > fms-full-$(date +%F).sql
# copy the file to the new machine, e.g.:
scp fms-full-2026-09-06.sql user@new-vps:~
```

**On the NEW VPS, AFTER `setup.sh` has run** (so the schema + owner exist):
```bash
# drop the empty schema objects and restore the dump
docker compose exec -T db psql -U fms_app -d fms_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker compose exec -T db psql -U fms_app -d fms_db < ~/fms-full-2026-09-06.sql
docker compose restart backend
```

The `owner` user (and its password) comes over in the dump — the one `setup.sh`
created is replaced by the one in the dump.

---

## Appendix B — Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `docker: permission denied` | user not in docker group | `sudo usermod -aG docker $USER` then re-login |
| setup.sh fails at env validation | a `change-me` left in an env file | fill in all values in the three `.env` files |
| backend container exits / migrations fail | `DATABASE_URL` password mismatch | ensure `backend/.env` `DATABASE_URL` password == `.env` `POSTGRES_PASSWORD` |
| n8n container crash-loops "Mismatching encryption keys" | `N8N_ENCRYPTION_KEY` set but ≠ stored key | remove the env var (or set it to the stored key) and recreate |
| `cloudflared` service fails to start | missing credentials symlink (UUID-named file) | re-run the go-live script (it now symlinks automatically) or check `/etc/cloudflared/config.yml` |
| login from frontend fails | frontend built with old URL, or CORS origin wrong | rebuild frontend with correct `VITE_API_URL`; check `FRONTEND_URL` in `backend/.env` matches the frontend origin |
| WhatsApp alerts don't send | stale Twilio token | update `TWILIO_AUTH_TOKEN` in both env files, re-run `bash deploy/provision-n8n.sh` |
| login rate-limited (429) | 10 failed attempts / 15 min per IP | wait, or check `docker compose logs backend` |
