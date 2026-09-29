# FMS desktop app (factory PC)

Windows installer that runs FMS offline on the factory PC: its own Postgres 16,
the normal backend and dashboard, and a one-way sync that uploads every change
to the VPS whenever there is internet. The factory is the only place data is
entered; `app.ittefaqbuilder.com` becomes view-only.

## Build

```
npm install      # also downloads the Electron binary (postinstall)
npm run dist     # -> dist/FMS Setup <version>.exe
npm start        # run from source (uses %APPDATA%/FMS - add --user-data-dir=<dir> via
                 # `npx electron . --user-data-dir=...` to keep test data separate)
```

A new dependency in `backend/package.json` must be added here too, or
`npm run stage` refuses to build.

## Switchover (one time)

Order matters: freeze the VPS first, then copy. Anything saved on the VPS after
the copy would never reach the factory.

1. **Deploy the backend** with the `/sync` routes (push to `main`; the GitHub
   Action deploys it).
2. **On the VPS**, add to `~/fms/backend/.env`:
   ```
   SYNC_TOKEN=<openssl rand -hex 32>
   READ_ONLY_MODE=true
   N8N_PUBLIC_WEBHOOK_URL=https://n8n.ittefaqbuilder.com/webhook/fms-alert
   ```
   then `sg docker -c "docker compose up -d backend"`. From now on the web
   dashboard only views data (saves return "This server is view-only").
3. **On the factory PC**, run the installer. The first launch asks for the sync
   key (the `SYNC_TOKEN` value) and copies all server data, logins included.
   Log in with the usual accounts.

The window title shows the sync state: "All changes uploaded", "Offline — N
changes waiting", or "Sync problem" (details in the log).

## Where things live on the factory PC

`%APPDATA%\FMS\`
- `pgdata\` — the database. **Back this folder up** (with FMS closed).
- `config.json` — sync key, server address, local secrets.
- `logs\fms.log` — everything: startup, sync, alerts, updates.

## Download link and updates

Installers are served by the VPS backend from `~/fms/downloads` (mounted into
the container, `backend/routes/downloads.js`):

- People get: **https://api.ittefaqbuilder.com/downloads/latest** — always
  redirects to the newest installer. (`/downloads/FMS-Setup.exe` does too, but
  Cloudflare lets browsers cache `.exe` URLs for 4 h, so it can lag a release.)
- The installed app checks `…/downloads/latest.yml` at start and every 4 h,
  downloads a newer version in the background and installs it when FMS is
  closed (or at once via "Restart now"). Data in `%APPDATA%\FMS` is kept.

To release a new version:

1. If it adds migrations, deploy the backend to the VPS **first** (push to
   `main`): the VPS rejects changes for columns it doesn't have yet (they wait
   in the factory queue, nothing is lost, but sync stalls until then).
2. Bump `version` in this `package.json`, then `npm run dist`.
3. Upload the three files from `dist/` (PowerShell, from `desktop/`):
   ```
   scp dist/FMS-Setup-<version>.exe dist/FMS-Setup-<version>.exe.blockmap dist/latest.yml myuser@158.220.94.68:~/fms/downloads/
   ```
   Upload `latest.yml` last (the scp above does, it goes in order) so the app
   never sees a version whose installer isn't there yet. Keep the previous
   version's `.blockmap` — it lets updates download only what changed.

## How sync works

- Triggers (`lib/syncCapture.js`) append every insert/update/delete to
  `sync_outbox` in the same transaction.
- `lib/sync.js` sends committed changes, in order, to `POST /sync/ingest`,
  which upserts/deletes by primary key (`backend/controllers/SyncController.js`).
  Re-sending a batch is harmless.
- WhatsApp alerts go to a local relay (`lib/alertRelay.js`) that queues them
  and forwards to n8n when online; alerts held up more than 10 minutes are
  marked "Delayed", ones older than 48 h are dropped.
