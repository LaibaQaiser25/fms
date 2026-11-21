# Restoring FMS

Recovery for the Factory Management System: `api.ittefaqbuilder.com` (backend),
`n8n.ittefaqbuilder.com`, and the Windows desktop updater. Everything needed is
in GitHub; nothing lives only on the host.

**Backups:** private repo `hanzla46/vps-backups`
• `fms_db-*` — hourly, custom-format `pg_dump` of `fms_db`
• `config-*` — daily, carries `backend/.env` and `deploy/.env.n8n`

The whole-machine rebuild (provisioning, Caddy, tunnels, DNS, restore order across
all services) is documented separately in the `box-doc-*` release of the same repo.

---

## Stack

| Container | Image | Notes |
|---|---|---|
| `fms-backend-1` | `fms-backend` (**built locally**) | `node:24-alpine`, multi-arch |
| `fms-db-1` | `postgres:16-alpine` | volume `fms_pg_data` |
| `fms-n8n-1` | `docker.n8n.io/n8nio/n8n:2.37.10` | volume `fms_n8n_data` (SQLite) |

`fms/downloads` is a bind mount holding the Windows installers served to
customers — it is the electron-updater channel, not a build artefact.

---

## 1. Code and config

```bash
git clone https://github.com/LaibaQaiser25/fms.git /opt/fms
# mirror if the collaborator account is unavailable:
# git clone https://github.com/hanzla46/fms-mirror.git /opt/fms

gh release download config-<LATEST> -R hanzla46/vps-backups -D /tmp/cfg --clobber
cd /tmp/cfg && tar -xzpf app-envs.tar.gz -C /opt/fms/     # .env + backend/.env + deploy/.env.n8n
chmod 600 /opt/fms/.env /opt/fms/backend/.env /opt/fms/deploy/.env.n8n
```

⚠️ **`/opt/fms/.env` is required.** It holds the compose-level `POSTGRES_PASSWORD`
that `docker-compose.yml` interpolates as `${POSTGRES_PASSWORD}`. It is not in git
and not in `backend/.env`; without it `docker compose up -d db` aborts with
*"POSTGRES_PASSWORD variable is not set"* and the database restarts in a loop.
A DR drill on 2026-11-21 caught exactly this.

⚠️ **`deploy/.env.n8n` holds `N8N_ENCRYPTION_KEY`.** Without it every n8n
credential — Shopify, Meta WhatsApp, anything stored in a workflow — is
permanently unreadable. Confirm before starting n8n:

```bash
grep -c N8N_ENCRYPTION_KEY /opt/fms/deploy/.env.n8n   # must print 1
```

---

## 2. Database

```bash
cd /opt/fms
docker compose up -d db
# wait for the real start, not pg_isready — the entrypoint restarts once after
# initdb and a restore inside that window dies with "database system is shutting down"
for i in $(seq 1 90); do
  docker compose logs db 2>&1 | grep -q 'database system is ready to accept connections' && break
  sleep 2
done
sleep 4

gh release download <newest fms_db-*> -R hanzla46/vps-backups -D /tmp/fms --clobber
docker exec -i fms-db-1 sh -c \
  'exec pg_restore -U fms_app -d fms_db --no-owner --no-privileges -Fc' < /tmp/fms/*.dump
```

Verify: **39 public tables**, and `pgmigrations` count matches the code:

```bash
docker exec fms-db-1 psql -U fms_app -d fms_db -tAc \
  "select count(*) from information_schema.tables where table_schema='public';"
docker exec fms-db-1 psql -U fms_app -d fms_db -tAc "select count(*) from pgmigrations;"
```

---

## 3. n8n

```bash
docker run --rm -v fms_n8n_data:/data -v /tmp/fms:/in alpine:3 \
  sh -c 'cd /data && tar -xzf /in/fms_n8n_data-*.tar.gz'
```

The n8n version **must match** the one that wrote the SQLite volume — its
migrations are one-way. `docker-compose.yml` pins `2.37.10`; do not change it to
`latest` before restoring.

---

## 4. Build and start

```bash
cd /opt/fms
docker compose build backend      # locally built; needs node:24-alpine (multi-arch)
( cd frontend && npm ci && npm run build )
docker compose up -d
```

Health:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5000/api/health   # 401 = up
curl -s -o /dev/null -w '%{http_code}\n' https://api.ittefaqbuilder.com/api/health
```

---

## 5. Desktop update channel

`~/fms/downloads` must hold `FMS-Setup-*.exe`, the `.blockmap` and `latest.yml`.
If the box is gone, restore them from the previous host's copy or rebuild the
installer — **without `latest.yml` every installed desktop app fails to update.**

```bash
curl -sI https://api.ittefaqbuilder.com/downloads/latest.yml | head -1   # 200
```

---

## 6. Cron, tunnel and the deploy pipeline

```bash
crontab -e   # add:
# 0 * * * * bash /home/myuser/fms/deploy/fms-hourly-backup.sh >/dev/null 2>&1
```

The `fms` Cloudflare tunnel (`178e058c-…`) serves `api.` and `n8n.`; its
credentials come from the `config-*` release (`cloudflared-creds.tar.gz`), so no
re-auth is needed. Only **one** origin may run at a time.

The repo's GitHub Action deploys on push to `main`. It needs four repo secrets —
`VPS_HOST` must be updated to the new address:

```bash
gh secret set VPS_HOST -R LaibaQaiser25/fms --body "<new-ip>"
gh run list -R LaibaQaiser25/fms -L 3
```

The workflow has a `concurrency` group (`fms-vps-deploy`, no cancel) so two quick
pushes queue instead of racing. Two parallel deploys once left the backend
half-created and the API down for an hour — do not remove that guard.

---

## Pitfalls

- **`latest` on n8n** — one-way SQLite migrations; always pin.
- **`pg_restore --exit-on-error`** is fine for plain Postgres, but for PostGIS
  images the pre-installed extensions raise `already exists`. FMS uses plain
  Postgres, so strict mode is safe here.
- **`.env.bak-*` files** in `backend/` are untracked local copies; do not commit
  them, and do not assume they exist on a fresh clone.
