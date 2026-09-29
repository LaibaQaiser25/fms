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

## Releasing an update

1. Deploy the backend to the VPS **first** if the release adds migrations: the
   VPS rejects changes for columns it doesn't have yet (they wait in the queue
   and go through once it's updated, nothing is lost).
2. Bump `version` in this `package.json` and build.
3. Automatic updates need a `publish` target in `package.json` `build`
   (e.g. GitHub Releases). Until one is configured the app logs "automatic
   updates off" and new versions are installed by running the new installer
   over the old one — data in `%APPDATA%\FMS` is kept.

## How sync works

- Triggers (`lib/syncCapture.js`) append every insert/update/delete to
  `sync_outbox` in the same transaction.
- `lib/sync.js` sends committed changes, in order, to `POST /sync/ingest`,
  which upserts/deletes by primary key (`backend/controllers/SyncController.js`).
  Re-sending a batch is harmless.
- WhatsApp alerts go to a local relay (`lib/alertRelay.js`) that queues them
  and forwards to n8n when online; alerts held up more than 10 minutes are
  marked "Delayed", ones older than 48 h are dropped.
