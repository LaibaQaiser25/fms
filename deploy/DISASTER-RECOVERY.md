# Disaster recovery — rebuild the whole box from GitHub only

Assumes the VPS is **gone**: no disk, no SSH, no data. All you have is the
`hanzla46` GitHub account and the passwords in your password manager.

Everything below is in **private GitHub release assets**. Nothing needed for a
rebuild lives only on the dead machine.

---

## 1. What is where

| Asset | Repo | Cadence | Restores |
|---|---|---|---|
| Hermes state | `hanzla46/hermes-backups` | daily 02:00 / 02:05 | agent config, skills, memory, sessions, WhatsApp link |
| FMS database | `hanzla46/fms-db-backups` (+ mirror `LaibaQaiser25/fms`) | hourly | `fms_db` |
| SamaanBox DB | `hanzla46/samaanbox-backups` | daily 03:15 | encrypted `samaanbox` dump **and its age key** |
| WordPress | `hanzla46/wordpress-site-backups` | daily 03:15 | MySQL DB, `wp-content` volume, compose + php.ini |
| Box config | `hanzla46/vps-config-backups` | daily 03:15 | every `.env`, Caddyfile, tunnel creds, systemd units |

**Images, containers and volumes are NOT backed up** — they are rebuilt from
public registries and from the code repos (`fms`, `SamaanBox`). That is by
design: architecture-bound binaries must never be restored onto a new host.

---

## 2. Provision a new box

```bash
# Ubuntu 24.04 arm64 (any provider). Same user, same uid.
sudo useradd -u 1001 -m -s /bin/bash myuser
sudo usermod -aG sudo myuser
echo 'myuser ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/90-myuser

# timezone first — every cron is CET
sudo timedatectl set-timezone Europe/Berlin

sudo apt update && sudo apt install -y build-essential python3-dev python3-venv \
  git curl zstd age jq ffmpeg tesseract-ocr ripgrep postgresql-client-16 \
  caddy cloudflared unzip
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker myuser

# Node 22 at the path samaanbox-app.service hardcodes
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo mkdir -p /opt/node22/bin && sudo ln -sf "$(command -v node)" /opt/node22/bin/node

sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# GitHub access
gh auth login
```

---

## 3. Restore the config layer

```bash
gh release download config-<LATEST> -R hanzla46/vps-config-backups -D /tmp/cfg --clobber
cd /tmp/cfg

sudo tar -xzpf env-files.tar.gz      -C /                    # /etc/samaanbox-*.env
sudo tar -xzpf proxy-and-units.tar.gz -C /                   # Caddyfile, units
sudo tar -xzpf app-envs-root.tar.gz  -C /opt/samaanbox/      # CustomApp/.env
sudo tar -xzpf app-envs.tar.gz       -C /opt/fms/            # backend/.env, deploy/.env.n8n
tar -xzpf cloudflared-creds.tar.gz   -C ~                    # ~/.cloudflared
tar -xzpf systemd-user.tar.gz        -C ~                    # ~/.config/systemd/user
sudo systemctl daemon-reload
```

`app-envs.tar.gz` contains `deploy/.env.n8n` — **without `N8N_ENCRYPTION_KEY`
every n8n credential is permanently unreadable.** It is in this archive; verify
it after extracting:

```bash
grep -c N8N_ENCRYPTION_KEY /opt/fms/deploy/.env.n8n   # must print 1
```

---

## 4. Restore the applications

```bash
# --- code ---------------------------------------------------------------
git clone https://github.com/LaibaQaiser25/fms.git /opt/fms
git clone https://github.com/hanzla46/SamaanBox.git /opt/samaanbox/SamaanBox
```

Restore the `~/.cloudflared`, env and unit files **after** the clone (the clone
does not carry them).

```bash
# --- FMS ----------------------------------------------------------------
cd /opt/fms
docker compose up -d db
gh release download <newest fms_db-*> -R hanzla46/fms-db-backups -D /tmp/fms --clobber
docker exec -i fms-db-1 sh -c 'exec pg_restore -U fms_app -d fms_db --no-owner --no-privileges -Fc' \
  < /tmp/fms/*.dump
docker run --rm -v fms_n8n_data:/data -v /tmp/fms:/in alpine:3 \
  sh -c 'cd /data && tar -xzf /in/fms_n8n_data-*.tar.gz'      # if present
docker compose build backend
docker compose up -d

# --- SamaanBox ----------------------------------------------------------
cd /opt/samaanbox/SamaanBox/CustomApp
npm ci && npm run build
cd /opt/samaanbox/SamaanBox
gh release download <newest samaanbox-*> -R hanzla46/samaanbox-backups -D /tmp/sb --clobber
cd /tmp/sb && unzip -o age-key-material.zip -d key
age -d -i key/identity.txt -o /tmp/samaanbox.dump <timestamp>.dump.enc
# NOTE: swap the postgis image for an arm64-capable tag first (see §6)
docker compose -f CustomApp/deploy/production.compose.yml up -d db
docker exec -i samaanbox-marketplace-db sh -c \
  'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges -Fc' < /tmp/samaanbox.dump
sudo systemctl enable --now samaanbox-app samaanbox-backup.timer

# --- WordPress ----------------------------------------------------------
gh release download <newest wordpress-*> -R hanzla46/wordpress-site-backups -D /tmp/wp --clobber
mkdir -p ~/wordpress-site && tar -xzf /tmp/wp/wp-site-config.tar.gz -C ~/wordpress-site
cd ~/wordpress-site && docker compose up -d db
sleep 20
docker exec -i mysite-db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" wordpress' < /tmp/wp/wordpress.sql
docker run --rm -v wordpress-site_wordpress_data:/data -v /tmp/wp:/in alpine:3 \
  sh -c 'cd /data && tar -xzf /in/wp-content.tar.gz'
docker compose up -d
```

---

## 5. Hermes

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
gh release download <newest hermes-backup-*> -R hanzla46/hermes-backups
hermes import hermes-backup-*.zip
hermes doctor
sudo loginctl enable-linger myuser
systemctl --user daemon-reload && systemctl --user enable --now hermes-gateway
```

WhatsApp will ask for a QR re-scan — `journalctl --user -u hermes-gateway -f`.
Copy `~/.config/gh` from a working machine or `gh auth login` again.

---

## 6. Things that must be re-decided, not restored

- **Docker image tags.** `postgis/postgis:16-3.4` has no arm64 build — use
  `imresamu/postgis:16-3.5-alpine`. n8n must stay pinned to the version the
  dump came from.
- **TLS.** Caddy re-issues automatically once DNS points at the new IP.
- **DNS.** `app.samaanbox.com` is a direct A record — repoint it. Cloudflare
  tunnels need no change (credentials are in the config archive).
- **GUI / RustDesk.** Not part of the backup. Reinstall if wanted.
- **Chrome profiles / browser logins.** Never backed up (credentials are
  keyring-bound). Re-login by hand.

---

## 7. Gaps — be honest about these

- **FMS code** lives in `LaibaQaiser25/fms`. If that collaborator account goes
  away, the source is unrecoverable from here. Mirror it to `hanzla46`.
- **WordPress plugins** live in `wp-content` (backed up). **Elementor Pro** is a
  licensed plugin — reactivating it needs the licence key.
- **The e-commerce research folders** (`~/tiktok-suppliers`, `~/ebay-ukds`) are
  *not* in any backup. The harvested supplier catalogues cannot be re-scraped.
  This is the largest remaining DR gap.
- **Hermes skills** are in `hermes-backups`; **Hermes state.db** too. Fine.
- Last verified restore drills: WordPress release downloaded and opened
  (2026-11-20); SamaanBox key decrypted its dump (2026-11-20).
