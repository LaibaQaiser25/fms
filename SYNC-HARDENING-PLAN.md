# FMS Sync Hardening — Final Plan (agent-executable)

> **Remaining live checks, in order:** `GO-LIVE-CHECKLIST.md` (deploy, release 1.0.2, first
> factory install).
>
> **This is the single, final plan.** It merges the original sync hardening plan, the code review
> (R1–R5) and the owner's Offline Setup requirements (agreed 13–16 Oct 2026) into one ordered list
> of tasks. Every open option has been decided (§2). The review's corrections are built into the
> tasks they correct. Earlier versions of this file are in git history (`8f0dfda`, `7038ad5`,
> `a4196cf`, `a44e014`).

---

## 0. How to work this plan

### 0.1 Status markers

Put exactly one marker on each task's `Status:` line, and mirror it in the §5 ledger.

| Marker | Meaning |
|---|---|
| `NOT STARTED` | default |
| `IN PROGRESS` | being worked on now |
| `BLOCKED: <reason>` | cannot proceed; reason must be concrete and external |
| `CODE DONE, CHECKS FAILING` | implementation written, verification red |
| `DONE` | code + checks pass, gate evidence recorded in the task |

Do not mark `DONE` without executing the task's checks and pasting the observed result.
Do not mark `BLOCKED` for difficulty or uncertainty — only for a real external blocker.

### 0.2 Hard rules (violating any of these is a defect)

1. **VPS migrations and backend deploy first, factory app second.** Every phase.
2. **Every new table must be registered in all four places** (§4).
3. **No test framework for the app in general.** Verification is by observation (§0.3).
   **Exception:** automated checks for the sync code only, in `desktop/test/`, using Node's built-in
   test runner (`node --test`, no new dependency) — see T1.0.
4. **No other `test/`-like directories**, and do not change `desktop/scripts/stage.js`'s `SKIP` set.
   `desktop/test/` is not packed into the installer (`desktop/package.json` → `build.files` lists
   only `main.js`, `lib/**`, `setup/**`, `staged/**`, `package.json`); keep it that way.
5. **Never "fix" the intentional behaviours listed in §10.** They look like bugs and are not.
6. New frontend API files must import the shared axios instance from `./http`, not `axios`.
7. Do not rewrite `SalesController.createSale`'s stock logic into a conditional `UPDATE` — the
   `FOR UPDATE` + `needsProduction` branch is deliberate (T2.7 keeps it).
8. Keep every commit scoped to one task ID.
9. A new dependency in `backend/package.json` must also be added to `desktop/package.json`
   (`stage.js` refuses to stage otherwise).
10. **Every installer release** (T1.10 and later) only proceeds after `npm test` in `desktop/`
    passes (T1.0). Paste its output in the release task's evidence.

### 0.3 How to verify (observation; plus the sync checks of T1.0)

The automated sync checks (T1.0) are an extra safety net. They do **not** replace the observed
checks below: every task's gate still needs its observed result.

Every task is verified by **observing the running system** and pasting what you saw:

| Source | How | Good for |
|---|---|---|
| HTTP response | `curl -i` against the running backend | Status codes, headers, error bodies |
| Database | `psql "$DATABASE_URL" -c "..."` (on the VPS: `sg docker -c "docker compose exec -T db psql -U fms_app -d fms_db -c '...'"`) | Rows actually written, columns, constraints |
| Process output | backend stdout, or `%APPDATA%\FMS\logs\fms.log` on the factory | Warnings, sync messages, errors |
| UI | the running dashboard, the factory app's status bar | Anything the operator sees |
| Manual steps | numbered steps with exact commands | Service install, LAN, n8n, WhatsApp |

**Do not start a second copy of `backend/server.js` to test against** — it calls `listen()` on
import, so a second instance fights the running one for the port.

**Never paste a green result you did not run.** If a check cannot be run in the current
environment, mark the task `CODE DONE, CHECKS FAILING` and state which check is unverified and
what it needs.

---

## 1. Current state (checked 12 Oct 2026)

| Check | Result | What it means |
|---|---|---|
| VPS code version | `952c21e`, same as `main` | VPS is up to date |
| `READ_ONLY_MODE` | `true` (since 29 Sep) | VPS refuses all edits and runs **no** scheduled reports or digests |
| `SYNC_TOKEN`, `N8N_PUBLIC_WEBHOOK_URL` | both set | sync on; WhatsApp target configured |
| Newest sale on the VPS | 27 Sep 2026 | nothing has synced since the switchover |
| Factory using the app? | **No** (confirmed by the owner) | sync has never carried real data |
| Backups on the VPS | **none** (crontab only runs `keepalive.sh`) | the VPS database is the **only** copy of all data |
| Negative stock rows | 0 | nothing to clean up for T2.7 |
| Latest installer | 1.0.1, built 29 Sep | older than the repo |

Consequences:
- **Nobody can enter data anywhere.** The VPS is read-only and the factory isn't using the app.
  T0.1 fixes this until go-live.
- **The snapshot is open.** With read-only on and the token set, anyone given the sync key can
  download the whole database (user password hashes included) and start uploading as a second
  writer. T0.1 closes it until go-live; T1.1 closes it permanently.
- **No factory install exists**, so protocol changes need no compatibility with old installs.

---

## 2. Decisions (final) and rules

### 2.1 Decisions

| ID | Decision |
|---|---|
| D1 | Once FMS runs as a service (T3.1), its data directory is `FMS_DATA_DIR`, default `%PROGRAMDATA%\FMS`. Moving from `%APPDATA%\FMS` is **copy, verify, then switch — never in place**. |
| D2 | Reports sent by the VPS are recorded only in `report_dispatch_log`, shown in a read-only history view. The mirror stays pure. |
| D3 | Gate-pass numbers: **gaps are accepted.** Record this in a comment in `GatePassController`. |
| D4 | Updates after the service move (T3.1): a **scripted update path**, written and documented in T3.1. Electron is not kept installed just as an updater. |
| D5 | `READ_ONLY_MODE` is switched **off now** (T0.1) and switched **on immediately before the first factory install** (T1.10). |
| D6 | **One-PC lock:** the VPS accepts uploads only from the one registered main PC, using that PC's own upload key, issued through a one-time setup code (T1.1). This replaces the original epoch / push-sequence / claim-window design. A push-sequence check is not part of this plan. |
| D7 | The **online browser version is view-only, always**, for every role (Owner, Manager, Guest). The Owner's Offline Setup saves (T1.2) are the only writes it accepts. |
| D8 | **Extra factory PCs are included** (Phase 3): they open the main PC in a browser on the factory network and install nothing. |
| D9 | VPS-sent reports end with "data as of `<last upload>`". If the factory hasn't uploaded for > 2 h, a stale-data warning is prefixed. If the last upload is earlier than the end of the report's period, the report is labelled **"period incomplete"**. |
| D10 | Factory backups use `pg_dump.exe` / `pg_restore.exe` from the **matching Postgres 16 Windows build**, shipped next to the embedded binaries (they aren't included today). |
| D11 | Retrying a rejected record happens **in the factory app** and re-sends the record **as it is now**. |
| D12 | Missing primary key on a table → a **warning in the factory status**, not a startup failure. |
| D13 | Desktop frontend build sets an explicit site variant (`VITE_SITE_VARIANT=app`), so any LAN hostname or IP shows the dashboard, not the marketing site. |
| D14 | Windows service wrapper: **NSSM**. |
| D15 | Off-site copies: VPS dumps are pulled to the owner's PC weekly (`scp`); factory backups are copied weekly to a USB drive kept off-site. |
| D16 | Not in this plan: installing on phones, two-way sync, editing from the online browser version, a custom installer built per download, and a push-sequence check. |
| D17 | Rebuilding the online server from the factory's data is **in the plan** (T2.8): the factory re-registers with a setup code made by a server-side script, keeps its own data, and resends everything. |

### 2.2 Rules that must always hold

- **One database decides everything:** the main factory PC.
- **Data copies one way only:** factory → online. Nothing travels from the online version back to
  the factory.
- **The online browser version is view-only for every role.** Offline Setup saves (T1.2) are the
  only exception.
- **Only the registered main PC may upload.**
- **The upload key never travels by hand.**
- **The factory database is never exposed** beyond the main PC.
- **Roles are checked by the server on every request**, from any device.

---

## 3. Facts about the code (verified — read before implementing)

| # | Fact | Where |
|---|---|---|
| F1 | The factory already sends each change's outbox id, as **`id`**; the server ignores it. The unknown-column check only looks at the keys inside `row_data`, so an extra field next to it is harmless. | `desktop/lib/sync.js` (selects `id, table_name, op, row_data`), `SyncController.ingest` |
| F2 | `/sync` is mounted **before** `readOnlyMode`, so routes in `routes/sync.js` are never blocked by read-only mode. `/api/*` writes **are** blocked. | `backend/server.js` lines 75 vs 84 |
| F3 | The factory runs the **same migrations** as the VPS, so "VPS-only" migration tables exist, empty, on the factory too. | `desktop/lib/database.js` `prepareSchema` |
| F4 | Snapshot import aborts on a server table the factory doesn't know. | `desktop/lib/snapshot.js` ~line 57 |
| F5 | On the factory, every `/sync/*` route returns 404 (`SYNC_TOKEN` isn't set there). | `middleware/requireSyncToken.js` |
| F6 | Alert relay: with no target, nothing is ever deleted (it returns before the 48 h delete); old alerts are dropped only once a target exists, and that is logged. An n8n/Meta rejection comes back as an error (the n8n workflow has no "continue on fail"), so the relay keeps the message. The truly silent case is Meta accepting a message and not delivering it (24-hour window). The "Send today's report" button says "sent" even when the message was only queued (factory) or failed (`sendWhatsApp` swallows errors). | `desktop/lib/alertRelay.js`, `n8n/fms-whatsapp-alerts.json`, `ReportsController.sendDailyReportWhatsApp` |
| F7 | The embedded Postgres contains only `initdb`, `pg_ctl`, `postgres` — **no `pg_dump`**. It starts with no extra flags, so `fsync`, `synchronous_commit`, `full_page_writes` are at their safe defaults. | `desktop/node_modules/@embedded-postgres/windows-x64` |
| F8 | Stock can go negative today: cancelling a completed production order whose stock was sold; editing stock to a negative quantity; a sale that lists the same stock item twice. | `ProductionController.js` ~252, `StockController.updateStock`, `SalesController.createSale` |
| F9 | The factory backend listens on `127.0.0.1` only. | `desktop/main.js` (`HOST`) |
| F10 | Factory sync health shows only in the Electron window title. Boot sync already exists (`SyncWorker.start()` → `schedule(0)`). | `desktop/main.js`, `desktop/lib/sync.js` |
| F11 | `frontend/src/config.js` picks the site variant from the hostname vs `VITE_APP_URL`; an unknown hostname falls to `'all'` (marketing routes). | `frontend/src/config.js` |
| F12 | In read-only mode the VPS starts no cron jobs, so reports and digests depend on the factory PC being on at that minute. | `backend/server.js` ~139 |
| F13 | The installer already lets the user choose the program's install folder (`oneClick: false`, `allowToChangeInstallationDirectory: true`). | `desktop/package.json` |
| F14 | The snapshot exports every table, including users' password hashes. | `SyncController.snapshot` |
| F15 | Any non-schema ingest error returns 500 and the worker retries the same batch every 30 s: one bad row stalls all sync. | `SyncController.ingest`, `desktop/lib/sync.js` |

---

## 4. New tables — register in all four places

| Place | File | What to add |
|---|---|---|
| 1. Creation | migration `022`+ (VPS tables) / `syncCapture.js` `SETUP_SQL` or `alertRelay.js` (factory tables) | `CREATE TABLE` |
| 2. Ingest guard | `SyncController.js` → `PROTECTED_TABLES` | ingest refuses writes to it |
| 3. Snapshot export | `SyncController.js` → new `VPS_ONLY_TABLES`, skipped in `snapshot()` | never copied to a factory |
| 4. Capture guard | `syncCapture.js` → `EXCLUDED_TABLES` | no change trigger on it |

| Table | Lives on | Created by | `PROTECTED_TABLES` | `VPS_ONLY_TABLES` | `EXCLUDED_TABLES` |
|---|---|---|---|---|---|
| `sync_writer` | VPS | migration 022 (T1.1) | ✅ | ✅ | ✅ |
| `setup_code` | VPS | migration 023 (T1.1) | ✅ | ✅ | ✅ |
| `offline_setup` | VPS | migration 024 (T1.2) | ✅ | ✅ | ✅ |
| `sync_rejected` | VPS | migration 025 (T1.3) | ✅ | ✅ | ✅ |
| `sync_heartbeat` | VPS | migration 026 (T1.5) | ✅ | ✅ | ✅ |
| `report_dispatch_log` | VPS | migration 028 (T2.1) | ✅ | ✅ | ✅ |
| `whatsapp_dead` | factory | `alertRelay.js` (T1.6) | — | — | ✅ |
| `sync_quarantine` | factory | `syncCapture.js` (T1.4) | — | — | ✅ |

Migration 027 (T2.7) adds a constraint, not a table. VPS tables exist empty on the factory too
(F3); that is expected.

Current values: `PROTECTED_TABLES = new Set(['pgmigrations'])`;
`EXCLUDED_TABLES = ['pgmigrations','sync_outbox','sync_state','whatsapp_outbox']`;
`VPS_ONLY_TABLES` does not exist yet.

---

## 5. Progress ledger

| ID | Task | Deps | Status | Notes / evidence |
|---|---|---|---|---|
| T0.1 | Read-only mode off until go-live | — | CODE DONE, CHECKS FAILING | ops; off since 16 Oct 11:35; checks 1, 3 ✅, check 2 (dashboard save) pending |
| T0.2 | VPS nightly backup + restore drill | — | CODE DONE, CHECKS FAILING | production backup + drill ✅, cron ✅ (ran by itself 17 Oct 02:30); copy to the owner's PC pending |
| T0.3 | Cleanup bundle | — | DONE | check 2 ✅ (local); check 1 ✅ on the VPS (17 Oct) |
| T1.0 | Automated sync checks | — | DONE | 4/4 pass; sabotage check fails as expected (16 Oct 2026) |
| T1.1 | One-PC lock + one-time setup code | T1.0 | CODE DONE, CHECKS FAILING | checks 1–4 + 5 (409 half) ✅ on the VPS (17 Oct); 5 (403 half) at go-live E1.1; 6 needs the factory install |
| T1.2 | Offline Setup page, form, read-only exception | T1.1 | CODE DONE, CHECKS FAILING | checks 1–5 seen on a local harness + headless Chrome; VPS deploy + check 6 (Windows install) pending |
| T1.3 | Bad-row quarantine — server | — | DONE | checks 2–5 ✅ on the VPS (17 Oct), test rows removed |
| T1.4 | Bad-row quarantine — factory + retry | T1.3 | CODE DONE, CHECKS FAILING | 13/13 `npm test`; Sync issues page + Retry seen in headless Chrome; Windows install pending |
| T1.5 | Sync status on both versions + heartbeat | T1.1, T1.4, T1.6 | CODE DONE, CHECKS FAILING | 15/15 `npm test`; checks 1–4 seen end to end on a local harness; VPS + Windows pending |
| T1.6 | WhatsApp relay state + `whatsapp_dead` | — | CODE DONE, CHECKS FAILING | checks 1–4 seen on the real relay + fake n8n; factory install pending |
| T1.7 | Config `reason` + startup warning | T1.6 | CODE DONE, CHECKS FAILING | checks 1–2 by `npm test`; check 3 (startup log) needs the deploy |
| T1.8 | Test WhatsApp button + honest report button | T1.6, T1.7 | CODE DONE, CHECKS FAILING | outcomes 1–2 seen with a fake n8n; 3 needs a real message to the owner's WhatsApp |
| T1.9 | Faster upload + final upload on quit | T1.4 | CODE DONE, CHECKS FAILING | 18/18 `npm test` (2.0 s to the server; 5 writes → 1 push; quit cap); real app quit needs Windows |
| T1.10 | Release 1.0.2 + first factory install | T0.2, T1.0–T1.9 | NOT STARTED | go-live |
| T2.1 | VPS send-only report scheduler | T1.10 | CODE DONE, CHECKS FAILING | 26/26 `npm test` (once per period, race, failed send, digests, no mirror writes) + grep; real WhatsApp at go-live |
| T2.2 | Factory `DISABLE_CRON` | T2.1 | CODE DONE, CHECKS FAILING | startup log seen on the real `server.js`; ships in 1.0.2 with send-only at E1; one delivery at go-live |
| T2.3 | Report freshness label + history view | T2.1, T1.5 | CODE DONE, CHECKS FAILING | 27/27 `npm test` (stale, fresh, period incomplete, history route); Sent to WhatsApp tab built, not yet seen in a browser; production pending |
| T2.4 | Health endpoint + n8n watchdog | T1.5 | CODE DONE, CHECKS FAILING | 22/22 `npm test`; watchdog seen on a scratch n8n 2.37.10 (alerts, no repeat, quiet when off, cleared); production deploy + provisioning + real WhatsApp pending |
| T2.5 | Factory backups + restore drill | T1.10 | CODE DONE, CHECKS FAILING | 29/29 `npm test` (dump during writes → drill matches; damaged / failed never kept; retention); scheduled + on-close backup seen in the real app (Linux, Xvfb); Windows `pg_dump.exe` run + drill on the factory PC pending |
| T2.6 | UPS + Postgres durability check | — | CODE DONE, CHECKS FAILING | ops; FMS now logs the three settings at start (seen on Linux) and goes red if one is off (`npm test` 30/30); UPS + the factory log line pending |
| T2.7 | Non-negative stock | T1.3 | CODE DONE, CHECKS FAILING | 20/20 `npm test` (1 new); checks 1–4 seen on a scratch database; migration 027 + check 2 ✅ on the VPS (17 Oct); factory install (1.0.2) pending |
| T2.8 | Rebuild the online server from the factory | T1.1, T1.3 | CODE DONE, CHECKS FAILING | 25/25 `npm test` (checks 1–5 in the harness); the app's menu + window need a real run |
| T3.1 | `desktop/host.js` entry point | T1.5 | CODE DONE, CHECKS FAILING | checks 1–2 seen on Linux (scratch VPS: sale uploaded; copy-data → original byte-identical, start from copy); Windows (`tools\node.exe`) pending; T1.5 must be `DONE` before Phase 3 ships |
| T3.2 | Service install + dedicated user + drain | T3.1 | CODE DONE, CHECKS FAILING | scripts parse + PSScriptAnalyzer clean; drain (Ctrl+C to the process group → upload, backup, clean stop) and the app's service mode seen on Linux; checks 1–4 need the factory PC |
| T3.3 | LAN bind + firewall + hostname | T3.2 | NOT STARTED | |
| T3.4 | Frontend relative API base + variant | T3.3 | NOT STARTED | |
| T3.5 | Concurrency audit + fixes | T3.3 | NOT STARTED | |

---

## 6. Phase 0 — now (server only, no installer)

### T0.1 — Read-only mode off until go-live (D5)

**Status:** CODE DONE, CHECKS FAILING — done on 16 Oct 2026; check 2 (a save on the dashboard)
needs the Owner

**Do:** on the VPS, set `READ_ONLY_MODE=false` in `~/fms/backend/.env`, then
`sg docker -c "docker compose up -d backend"`. Effects: data can be entered on the dashboard
again, VPS cron jobs run again, and `GET /sync/snapshot` is refused (409), so no PC can set
itself up as a writer. T1.10 switches it back on.

**Checks:**
1. Backend log shows `✅ Cron jobs started`, not `🔒 READ_ONLY_MODE`.
2. A save on the dashboard succeeds.
3. `curl -i -H "X-Sync-Token: $SYNC_TOKEN" https://api.ittefaqbuilder.com/sync/snapshot` → `409`.

**Gate:** all three observed.

**Evidence (16 Oct 2026, 11:35 CEST, run by Claude on the VPS):** `backend/.env` copied to
`backend/.env.bak-2026-10-16`, `READ_ONLY_MODE=false`, `docker compose up -d backend` → Started.
- Check 1 ✅ — `docker compose logs backend`: `✅ Cron jobs started`, no `🔒 READ_ONLY_MODE`;
  `fms-backend-1 Up`.
- Check 2 ⏳ — needs a real save by the Owner. Supporting (writes nothing): unauthenticated
  `POST /api/customers` → `401 {"error":"No token provided"}`, i.e. it reaches auth instead of the
  `403 This server is view-only`.
- Check 3 ✅ — `curl -H "X-Sync-Token: …" $API/sync/snapshot` → `409 {"error":"Turn on
  READ_ONLY_MODE=true on the server (and restart it) before copying data to the factory"}`.

---

### T0.2 — VPS nightly backup + restore drill

**Status:** CODE DONE, CHECKS FAILING — production backup, drill and cron done on 16 Oct 2026 (the cron ran by itself on 17 Oct: `2026-10-17 02:30:03 +0200 backup OK: fms_db-2026-10-17.dump (128K)`; crontab line now `30 2 * * * bash $HOME/fms/deploy/backup-db.sh`);
still open: a dump on the owner's PC (check 4), and the Owner accepting check 3 from the
throwaway run (or running it on production)

**Do:** `deploy/backup-db.sh`:
- dumps `fms_db` from the compose `db` container, which already has `pg_dump`:
  `sg docker -c "docker compose exec -T db pg_dump -U fms_app -d fms_db -Fc"` →
  `~/fms-backups/fms_db-YYYY-MM-DD.dump`;
- reads each new dump all the way through (`pg_restore -f /dev/null`) before keeping it;
- keeps 14 daily and 8 weekly dumps;
- logs a timestamped OK / FAILED line to `~/fms-backups/backup.log`;
- `--drill`: restores the newest dump into a throwaway database, compares every table's row count
  with `fms_db`, then drops it.

Schedule it nightly in the VPS crontab (`30 2 * * * bash ~/fms/deploy/backup-db.sh`). Pull the
dumps to the owner's PC weekly (D15):
`scp "<user>@<vps-ip>:fms-backups/fms_db-*.dump" D:\fms-backups\`.

**Checks:**
1. Run once → `backup OK` and a dump file.
2. `bash deploy/backup-db.sh --drill` → row counts match.
3. Stop the `db` container and run it → `FAILED` logged, no partial file left.
4. `crontab -l` shows the line; a dump exists on the owner's PC.

**Gate:** drill completes with matching counts.

**Evidence (16 Oct 2026)** — run against a throwaway compose project (`postgres:16-alpine`,
`fms_app` / `fms_db`, tables `products` 500 rows, `sales` 37, `"Odd Name"` 1), not production:
- Backup ✅ — `backup OK: fms_db-2026-10-16.dump (8.0K)`, exit 0. With 60 older dumps seeded,
  20 remain: the 14 newest + Sundays back to 23 Aug (8 Sundays in all).
- Drill ✅ — all three tables restored with matching counts, `drill OK: ... 3 tables, all row
  counts match fms_db`; the `fms_drill_*` database is gone afterwards.
- Drill mismatch ✅ — one row inserted after the dump → `< public.sales 38 / > public.sales 37`,
  `drill FAILED: row counts ... differ`, exit 1.
- Check 3 ✅ — `db` stopped → `service "db" is not running`, `backup FAILED: pg_dump failed`,
  exit 1, no `.partial` and no dump file left.

**Evidence — production (16 Oct 2026, run by Claude on the VPS; the script from the
`sync-hardening` worktree, whose compose file names the same project `fms`):**
- Check 1 ✅ — `2026-10-16 11:31:56 +0200 backup OK: fms_db-2026-10-16.dump (120K)`, exit 0;
  `~/fms-backups/fms_db-2026-10-16.dump` (119 613 bytes) and `backup.log`.
- Check 2 ✅ — `drill OK: fms_db-2026-10-16.dump restored, 33 tables, all row counts match fms_db`
  (customers 3, sales 6, invoices 7, users 3, reports 942, …); `fms_drill_*` gone afterwards.
- Check 3 — not repeated on production (stops the live database); observed on the throwaway run
  above.
- Check 4 — cron ✅: `30 2 * * * f=$HOME/fms/deploy/backup-db.sh; [ -f "$f" ] ||
  f=$HOME/fms/.claude/worktrees/sync-hardening/deploy/backup-db.sh; bash "$f" >/dev/null 2>&1`
  (the worktree copy until this branch is deployed; simplify to `bash ~/fms/deploy/backup-db.sh`
  after B in `GO-LIVE-CHECKLIST.md`). Dry run in a cron-like environment (`env -i … /bin/sh`) → exit
  0, `backup OK`. ⏳ the `scp` to the owner's PC.

---

### T0.3 — Cleanup bundle

**Status:** DONE — both checks observed; check 1 on the VPS after the deploy (17 Oct 2026)

**Do:**
1. **Restore `deploy/.env.n8n.example`** with placeholder values for exactly the keys
   `provision-n8n.js` demands: `META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID`,
   `WHATSAPP_TO_NUMBER`, `N8N_WEBHOOK_SECRET`, `WEBHOOK_URL`. `setup.sh` and `provision-n8n.sh`
   both require it.
2. Delete `GET /testautodeployment` (`backend/server.js` line 91).
3. Remove `BACKEND_WEBHOOK_SECRET` and `N8N_INBOUND_SECRET` from `backend/.env.example` (unused).
4. Gate-pass numbering (D3): add a comment in `GatePassController` that gaps are accepted
   (sequence values are not rolled back).

**Checks:**
1. `curl -i .../testautodeployment` → 404.
2. A fresh `deploy/setup.sh` run gets past step 1 (env-file validation).

**Gate:** both observed.

**Evidence (16 Oct 2026):**
- Check 2 ✅ — `setup.sh` step 1 run against copies of the example files: unfilled
  `deploy/.env.n8n` → `ERROR: deploy/.env.n8n still has placeholders` (exit 1); filled →
  `env files OK` (exit 0). The example has exactly `META_PHONE_NUMBER_ID META_WHATSAPP_TOKEN
  N8N_WEBHOOK_SECRET WEBHOOK_URL WHATSAPP_TO_NUMBER`.
- Check 1 ✅ (17 Oct 2026, on the VPS after the deploy of `a3c735c`) —
  `curl -s -o /dev/null -w "%{http_code}" https://api.ittefaqbuilder.com/testautodeployment` → `404`.

---

## 7. Phase 1 — before the first factory install

Order within the phase: deploy the VPS side of every task first, then release installer 1.0.2
(T1.10).

### T1.0 — Automated sync checks

**Status:** DONE

**Do:** `desktop/test/sync.test.js`, run with `npm test` in `desktop/` (add
`"test": "node --test \"test/*.test.js\""` to `desktop/package.json` scripts; no new dependency,
rule 3). *A bare `node --test test/` fails on Node 22+, which reads the argument as a file glob, so
the script names the files by glob; it needs Node 21 or later.*
- Each run starts a **throwaway** embedded Postgres in a temp folder (the same `embedded-postgres`
  package the app uses, via `lib/database.js`), loads the schema and migrations, installs change
  capture, and deletes the folder afterwards. Run it with the FMS app closed: it uses the same
  database port.
- The server side is exercised by calling `SyncController.ingest` / `snapshot` directly with a
  fake request and response (no second `server.js`, §0.3).
- Checks to cover from the start:
  1. a change at the factory lands in `sync_outbox` (insert, update, delete; a key change gives a
     delete + insert);
  2. applying the same upload twice gives the same result (idempotent upsert);
  3. a delete arrives and removes the row;
  4. the factory refuses to replace its data while changes are still waiting (`importSnapshot`).
- **Every later sync task adds its own check here:** T1.1 (a PC without the registered key is
  refused), T1.3/T1.4 (a bad row is set aside while the rest continues), T2.8 (resend everything
  leaves both sides identical).

**Checks:**
1. `npm test` in `desktop/` → all pass; paste the summary.
2. Break one rule on purpose (e.g. comment out the delete branch in ingest) → the matching check
   fails; restore it.
3. After the run, no throwaway database folder is left behind.

**Gate:** all three observed.

**Evidence (16 Oct 2026, Node 26.7.0, Linux):**
1. `npm test` → `tests 4 · pass 4 · fail 0` (≈5 s):
   `✔ a factory change lands in sync_outbox: insert, update, delete, key change` ·
   `✔ applying the same upload twice gives the same result (idempotent upsert)` ·
   `✔ the worker uploads the outbox, and a delete removes the row on the server` ·
   `✔ the factory refuses to replace its data while changes are still waiting`.
2. Delete branch in `ingest` commented out → only the delete check fails
   (`actual: ['Ali','Bilal'], expected: ['Bilal']`). `ON CONFLICT … DO UPDATE` removed → only the
   idempotent-upsert check fails. Both restored; `git diff` on `SyncController.js` empty.
3. After each run, no `fms-sync-test-*` folder is left in the temp directory and port 48621 is
   free.

Notes: the harness runs one embedded Postgres with two databases (`fms_db` = factory with
capture, `vps_db` = server) and routes `SyncWorker`'s `fetch` to `SyncController`. Backend
modules resolve from `desktop/node_modules` (`NODE_PATH`), like the staged copy in the app.

---

### T1.1 — One-PC lock + one-time setup code (D6)

**Status:** CODE DONE, CHECKS FAILING — checks 1–5 verified by `npm test` against throwaway
databases, not yet on the running VPS (needs this branch deployed); check 6's status text needs
a factory install (Windows)
**Deps:** T1.0

**Migrations 022 and 023 (VPS tables, register per §4):**

```sql
CREATE TABLE IF NOT EXISTS sync_writer (
  id              int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  writer_id       uuid,          -- the registered main PC; NULL = none yet
  upload_key_hash text,          -- hash of that PC's upload key
  registered_at   timestamptz,
  last_ingest_at  timestamptz
);
INSERT INTO sync_writer (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS setup_code (
  id         bigserial PRIMARY KEY,
  code_hash  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
```

**Do — server:**
1. **Create a setup code** (from the Offline Setup page, T1.2): a random code such as
   `K7QM-2XPA` from a cryptographically secure generator. Store only its **hash**, with
   `expires_at = now() + 1 hour`. Show the code to the Owner once.
2. **`POST /sync/register`** (on the `/sync` router, authenticated by the setup code, not by the
   sync token; rate-limited like `/auth/login`). Body: `{ code, writer_id }`. If the code matches,
   is unexpired and unused:
   - mark it used;
   - set `sync_writer.writer_id`, `upload_key_hash`, `registered_at` — this replaces any previous
     PC, whose key stops working (**the old main PC is blocked automatically**);
   - return a new upload key (shown only in this response) plus the setup name and logo (T1.2).
3. **`/sync/ingest`, `/sync/config`, `/sync/snapshot`** accept only the registered PC's upload
   key. Ingest with any other key → `403 WriterNotRegistered`, before anything is applied.
4. **`GET /sync/snapshot`** additionally requires `READ_ONLY_MODE=true` (as today) **and**
   `registered_at` within the last hour. A second machine can no longer download the data
   silently.
5. Each accepted ingest sets `sync_writer.last_ingest_at = now()` in the same transaction.

**Do — factory app:**
1. First-run setup asks for the **setup code** instead of the sync key. The app generates a
   `writer_id` (uuid), calls `/sync/register`, stores `writer_id` and the upload key in
   `config.json`, then downloads the snapshot with that key. Nobody copies a key by hand.
2. "Start with an empty database" stays as it is: such a PC never registers, so it never uploads.
3. `403 WriterNotRegistered` → stop the worker; state `blocked_not_writer`, shown distinctly from
   `offline` (red: "This PC is no longer the registered main PC").

**Do — runbooks** (in `desktop/README.md`):
- **Main PC dies:** Owner creates a setup code in Offline Setup → install FMS on the new PC →
  enter the code → it copies the VPS data. **Changes that never left the old PC do not reach the
  VPS**; they are recoverable only from that PC's disk or its backups (T2.5).
- **VPS lost, or restored from an older backup:** the mirror misses everything between that
  backup and the failure. Rebuild it from the factory with T2.8 (re-register + "Resend everything").

**Checks:**
1. Create a code → `SELECT code_hash, expires_at, used_at FROM setup_code` shows a hash only, no
   plain code.
2. Register with it → 200 with a key; `SELECT writer_id, registered_at FROM sync_writer` is set.
3. The same code again → refused. A wrong code → refused; repeated wrong codes → 429. An expired
   code (set `expires_at` in the past) → refused.
4. Ingest with no key / a wrong key → `403 WriterNotRegistered`; pick a table and confirm no rows
   were applied.
5. Snapshot with a key registered more than an hour ago → 403; with `READ_ONLY_MODE=false` → 409.
6. Register a second PC with a new code → the first PC's next push is refused and its status
   shows `blocked_not_writer`, distinct from `offline`.

**Gate:** checks 1–6 observed; 4 proves nothing was written.

**Implementation notes:**
- Upload key header: `X-Upload-Key`. `SYNC_TOKEN` stays, but only as the switch that turns `/sync`
  on (the factory's own backend leaves it unset, so `/sync/*` still 404s there, F5); its value is
  no longer a credential.
- Codes and keys are stored as SHA-256 hashes (`backend/services/syncWriter.js`). Creating a code
  expires any older unused one, so at most one code is valid at a time.
- Codes are created by `POST /api/offline-setup/setup-code` (Owner only; T1.2 adds the page and the
  read-only exception) or `node scripts/createSetupCode.js` on the VPS (for T2.8 and before T1.2).
- `requireSyncWriter` checks the key before `/ingest`, `/config`, `/snapshot`; ingest checks it
  again as its first statement in the transaction
  (`UPDATE sync_writer SET last_ingest_at = now() WHERE upload_key_hash = $1`), which also locks
  the row, so a registration can't slip in between check and commit.
- Snapshot outside the hour → `403 SnapshotWindowClosed`. The factory setup reuses a saved key if
  an earlier attempt registered but failed to download (the code is used up by then).
- Runbooks added to `desktop/README.md`; the `/downloads` install guide now asks for the setup code.

**Evidence (16 Oct 2026):**
- `npm test` in `desktop/` → `tests 8 / pass 8 / fail 0`. New checks:
  - *setup code stored only as a hash, works once, only while unexpired* — checks 1, 2, 3 (wrong,
    used, expired code → 401; a newer code cancels an older unused one);
  - *an upload without the registered key is refused and applies nothing* — check 4: no key, a
    wrong key, an empty key → `403 WriterNotRegistered`; `customers` on the server stays `[]`,
    `last_ingest_at` stays NULL; the right key → 200 and `last_ingest_at` set;
  - *the snapshot needs read-only mode and a registration less than an hour old* — check 5:
    `READ_ONLY_MODE=false` → 409; wrong key → 403; registered 61 min ago → `403
    SnapshotWindowClosed`; `sync_writer`, `setup_code`, `pgmigrations` absent from the snapshot;
  - *registering a second PC blocks the first* — check 6 (worker side): state
    `blocked_not_writer`, worker stopped, the change stays in the outbox, the new PC uploads.
- Sabotage: dropping ingest's in-transaction key check → only the check-4 test fails; disabling
  the hour window → only the check-5 test fails. Both restored.
- Check 3, rate limit: `routes/sync.js` alone in a throwaway Express app (no `server.js`), 12 wrong
  codes → `500 ×10` (that harness had no database) then `429 429`, body
  `Too many attempts, please try again in 15 minutes`.
- **On the VPS (17 Oct 2026)** (go-live checklist C1–C5):
  - Check 1 ✅ — `createSetupCode.js` → `Setup code: XXXX-XXXX` / `Valid once, until
    2026-10-17T16:26:43.745Z`; `setup_code`: 64-character hash, valid 01:00:00, `used_at` empty; the
    plain code found nowhere in the table.
  - Check 2 ✅ — `200 {"writerId":"a637e0df-…","uploadKey":"<64 hex>","setup":{…}}`; `sync_writer`
    `a637e0df-… | 2026-10-17 15:26:44 UTC` (a curl test PC; the real main PC replaces it at go-live).
  - Check 3 ✅ — the used code, a made-up code, and an expired code → `401 {"code":"BadSetupCode",
    "error":"That setup code is wrong, already used, or expired. …"}`; then 11 wrong codes →
    `401 ×6, 429 ×5` (the 10th attempt in 15 min is the last 401), `Too many attempts, please try
    again in 15 minutes`; `sync_writer` unchanged.
  - Check 4 ✅ — no key and a 64-zero key → `403 {"code":"WriterNotRegistered",…}`; customer 999999
    count 0. The old token-only snapshot call → 403 too.
  - Check 5, 409 half ✅ — registered key, `READ_ONLY_MODE=false` → `409 Turn on READ_ONLY_MODE=true
    …`. ⏳ 403 half: the same key after read-only is on (go-live E1.1).
- ⏳ On a factory install: check 6 (go-live E3/E5).

---

### T1.2 — Offline Setup page, form, read-only exception

**Status:** CODE DONE, CHECKS FAILING — checks 1–5 observed against the real routes and middleware
on a throwaway database, not yet on the VPS (needs deploy + the Vercel frontend); check 6 needs a
fresh factory install (Windows)
**Deps:** T1.1

**Migration 024 (VPS table, register per §4):**

```sql
CREATE TABLE IF NOT EXISTS offline_setup (
  id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  setup_name  text,
  logo        bytea,          -- 256 × 256 PNG; NULL = default logo
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO offline_setup (id) VALUES (1) ON CONFLICT DO NOTHING;
```

The logo is stored in the database because the backend container is rebuilt on every deploy, so a
file written to its disk would not survive.

**Do — page (Owner only):**
- Sidebar item **Offline Setup** on the online dashboard, shown only to the Owner. The server
  refuses every Offline Setup request from anyone else (`requireOwner`, as for Reports/Users).
  Hiding the menu is not the security. New API file `frontend/src/api/offlineSetupApi.js` imports
  from `./http`.
- **The page never disappears:**

| State | What the Owner sees |
|---|---|
| No main PC yet | The setup form |
| Main PC set up | An overview, with actions |

- **Overview, once a main PC is set up:**
  - **Main PC:** when it was set up, whether it's online now (🟢/🔴), and its last upload (T1.5);
  - **Setup name and logo:** view and change them; the main PC picks up the change through
    `/sync/config` (already refreshed hourly);
  - **Extra factory PCs:** the address to open on them, `http://fms-host:48620` (T3.3);
  - **Download installer again**, e.g. to reinstall the same PC;
  - **Replace main PC:** creates a new setup code (T1.1); using it on the new PC blocks the old
    one automatically.

**Do — setup form:**

| Field | Behaviour |
|---|---|
| Device type | "Main factory PC" (one only) or "Extra factory PC" |
| Setup name | Shown in the factory app's title bar and login screen |
| Logo | Upload an image, or choose "Default" (limits below) |
| One-time setup code | Created on request (T1.1); shown once |
| Replace current main PC | Shown only if a main PC is already registered. Confirming blocks the old PC once the new one registers. |
| Download | Main PC only: the one installer for everyone (`/downloads`). The app gets the name and logo when it registers. |
| Extra PC instructions | No download. Shows `http://fms-host:48620` (or the main PC's fixed number, e.g. `http://192.168.1.20:48620`). |

- **Logo upload limits** (checked by the server, not just the form):
  - **file type:** PNG or JPG only, checked from the file's actual contents, not its name;
  - **file size:** at most **1 MB**; anything larger is refused with a clear message;
  - **stored safely:** shrunk to 256 × 256 with an image library (`sharp`; add it to
    `backend/package.json` and `desktop/package.json`, rule 9), stored in `offline_setup.logo`,
    never under the uploaded file name; the old logo is replaced, not kept;
  - **Owner only.**
- **Not in the form, on purpose:** a download location (a website can't choose where the browser
  saves) and a data-folder choice (moving it risks data loss, D1). The installer already asks
  where to install the program (F13).

**Do — read-only exception (D7):** `readOnlyMode` lets through requests whose path starts with
`/api/offline-setup/`. Those routes sit behind `authMiddleware` + `requireOwner`. Every other write
still returns "This server is view-only".

**Checks:**
1. Owner sees and uses the page, both before and after a main PC is set up; after setup it shows
   the overview with live status, not the empty form.
2. Manager and Guest neither see it nor get a response from its endpoints (403).
3. Each device type shows the right outcome.
4. A non-image file, and an image over 1 MB, are refused.
5. With `READ_ONLY_MODE=true`: the Owner can save setup settings; any other save still returns
   "This server is view-only".
6. Name and logo appear on a freshly installed main PC.

**Gate:** checks 1–6 observed.

**Implementation notes:**
- Routes (`backend/routes/offlineSetup.js`, `requireOwner`): `GET /api/offline-setup` (main PC,
  name, logo as a data URL, extra-PC address), `PUT /settings`, `PUT /logo` (the image is the raw
  body), `DELETE /logo` (default), `POST /setup-code` (T1.1). They 404 where `SYNC_TOKEN` is unset,
  i.e. inside the factory app. `readOnlyMode` lets `/api/offline-setup/*` through.
- Logo: type from the first bytes (PNG/JPG signature), 1 MB cap (413 from the body parser, 400
  from the service), `sharp` → 256 × 256 PNG with transparent padding, stored in
  `offline_setup.logo`; `sharp` added to both `package.json` files (rule 9), loaded lazily.
- Factory: `/sync/register` and `/sync/config` return `setup: { name, logo }`; `main.js` keeps it
  in `config.json`, writes `branding.json`, uses the name as the window title, and the backend
  serves it at `GET /branding` (only when `FMS_BRANDING_FILE` is set) for the login screen.
- Frontend: `VITE_FMS_DESKTOP=1` in the desktop build (`stage.js` env only; `SKIP` untouched)
  hides the page and its route inside the factory app. "Online" = an upload in the last 2 min,
  until T1.5's heartbeat.

**Evidence (16 Oct 2026)** — the real `readOnlyMode`, `authMiddleware`, `requireOwner`,
`routes/offlineSetup`, `routes/customers`, `routes/sync` mounted in `server.js`'s order in a
throwaway Express app (not `server.js`) on a throwaway embedded Postgres, `READ_ONLY_MODE=true`:
- Check 1 ✅ — Owner, no main PC: `{"mainPc":null,...}` and the page shows the setup form
  (headless Chrome screenshot). After `/sync/register` + one ingest: `mainPc` set, page shows the
  overview (🟢 Online, last upload "just now", set-up time, name/logo editor, extra-PC address,
  installer link, "Replace main PC…").
- Check 2 ✅ — Manager and Guest: `GET` and `POST /setup-code` → `403 {"error":"Owner access
  required"}`; in the browser both land on `/dashboard`, no "Offline Setup" in the sidebar.
- Check 3 ✅ — Main PC: name/logo, code, installer steps; Extra PC: no download,
  `http://fms-host:48620`, warning to set up the main PC first; with a main PC registered the
  replace confirmation must be ticked before a code can be created.
- Check 4 ✅ — a text file named `.png` → `400 The logo must be a PNG or JPG image.`; a 4.3 MB JPG
  → `413 The logo must be 1 MB or smaller.`; an 800 × 400 PNG is stored as `png 256x256`.
- Check 5 ✅ — with read-only on, Owner `PUT /settings`, `PUT /logo`, `POST /setup-code` succeed;
  `POST /api/customers` → `403 This server is view-only...`.
- `npm test` → `tests 9 / pass 9` (new: register and `/sync/config` carry the name and a 256 × 256
  PNG logo; GIF and > 1 MB refused; `offline_setup` absent from the snapshot).
- ⏳ Check 6: name in the title bar and name + logo on the login screen of a freshly installed
  main PC.

---

### T1.3 — Bad-row quarantine — server

**Status:** DONE — checks 2–5 observed on the VPS on 17 Oct 2026 (go-live checklist C10–C11, test
rows removed in C13), after the same on a throwaway database and by `npm test`.
Until T1.4, the factory still deletes a rejected change from its outbox without quarantining it
(the VPS keeps it in `sync_rejected`) — T1.10 depends on T1.4, so no install sees this

**Problem (F15):** one bad row (typically a 23505 on a unique constraint) stalls all sync.

**Migration 025 (VPS table, register per §4):**

```sql
CREATE TABLE IF NOT EXISTS sync_rejected (
  id              bigserial PRIMARY KEY,
  received_at     timestamptz NOT NULL DEFAULT now(),
  outbox_id       bigint,
  table_name      text NOT NULL,
  op              char(1) NOT NULL,
  pk              jsonb,
  row_data        jsonb NOT NULL,
  code            text,
  constraint_name text,
  detail          text,
  resolved_at     timestamptz
);
```

**Do — `SyncController.ingest`:** run the existing schema checks (unknown table/column/op, missing
primary key) for **all** changes first; any failure → `409 SchemaMismatch`, nothing applied (as
today). Then apply each change in its own savepoint. The outbox id arrives as `id` (F1):

```js
const accepted = [], rejected = [];
for (const change of changes) {
  const { table_name: tableName, op, row_data: row, id: outboxId } = change;
  await client.query('SAVEPOINT chg');
  try {
    await applyChange(client, { tableName, op, row }, tables);
    await client.query('RELEASE SAVEPOINT chg');
    accepted.push(outboxId);
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT chg');
    if (e.code && /^(22|23)/.test(e.code)) {          // class 22 data, class 23 integrity
      rejected.push({ id: outboxId, table_name: tableName, op,
                      code: e.code, constraint: e.constraint || null, detail: e.detail || null });
      await client.query(
        `INSERT INTO sync_rejected (outbox_id, table_name, op, pk, row_data, code, constraint_name, detail)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [outboxId, tableName, op, JSON.stringify(pkOf(row, tables.get(tableName))), row,
         e.code, e.constraint || null, e.detail || null]);
    } else {
      throw e;                                        // whole batch rolls back, retryable
    }
  }
}
await client.query('COMMIT');
res.json({ applied: accepted.length, accepted, rejected });
```

- `pkOf(row, table)` extracts just the primary-key columns, mirroring the existing `missingPk`
  check.
- When a later change for the same table and primary key is accepted, set `resolved_at` on the
  matching open `sync_rejected` rows (retries arrive as new outbox rows, T1.4).
- **Code comment (required):** unique (23505), check (23514) and not-null (23502) still fire under
  `session_replication_role = replica`, but **FK violations do not**, so a rejected parent can
  leave an applied child. Acceptable for a view-only mirror; a retry repairs it.

**Checks:**
1. Create a `products` row on the VPS with a known `(name, type, size)`; create the same triple on
   the factory.
2. The factory's sync round succeeds (status not "Problem").
3. `SELECT table_name, op, code, constraint_name, detail FROM sync_rejected ORDER BY id DESC LIMIT 5`
   → exactly one row with `code = 23505`.
4. The other rows of the same action exist on the VPS.
5. A change with an unknown `op` via `curl -i` → `409`; `SELECT count(*) FROM sync_rejected`
   unchanged.

**Gate:** checks 2–5 observed.

**Implementation notes:** `validateChange` / `applyChange` / `pkOf` split out of `ingest`; all
schema checks run before any change is applied. A failing change is rolled back to its savepoint;
class 22/23 → `sync_rejected` + `rejected[]`, anything else → the whole batch rolls back (500,
retried). The response is `{ applied, accepted, rejected }`. Rejections are resolved by an
accepted change with the same table + primary key (only looked up for tables that have open
rejections; partial index `sync_rejected_open_idx`). `sync_rejected` registered in
`PROTECTED_TABLES`, `VPS_ONLY_TABLES`, `EXCLUDED_TABLES`.

**Evidence (16 Oct 2026)** — the real `routes/sync.js` (and the rest, in `server.js` order) in a
throwaway Express app on a throwaway embedded Postgres; registered with a setup code first:
- Check 1 — `products` row `900|Block|stock|6in` on the server; factory batch: customer 1,
  the same product as id 1, customer 2.
- Check 2 ✅ — `HTTP/1.1 200 OK`, `{"applied":2,"accepted":[101,103],"rejected":[{"id":102,
  "table_name":"products","op":"I","code":"23505","constraint":"products_name_type_size_idx",...}]}`.
  In `npm test` the factory's `SyncWorker` round over the same scenario reports `state: 'ok'`,
  `pending: 0` (not "Problem").
- Check 3 ✅ — `sync_rejected`: exactly one row, `products | I | 23505 |
  products_name_type_size_idx | Key (name, type, COALESCE(size, ''))=(Block, stock, 6in) already
  exists.`
- Check 4 ✅ — `customers` on the server: `1 Ali`, `2 Bilal`; `products`: only `900 Block`.
- Check 5 ✅ — a batch with op `"Z"` → `HTTP/1.1 409 Conflict {"error":"unknown op \"Z\""}`;
  `sync_rejected` count 1 before and after; the valid change in the same batch was not applied.
- `npm test` → `tests 11 / pass 11` (new: the 23505 scenario incl. resolving on a later accepted
  change; the 409 batch). Sabotage: treating every row error as fatal → only the 23505 test fails.
- **On the VPS (17 Oct 2026)**, with a curl test PC registered by a setup code (go-live C2):
  - Check 1 — `INSERT INTO products (id, name, type, size) VALUES (999001, 'ZZ Sync Test', 'stock',
    'test')`; batch: customer 999901, the same product as 999002, customer 999902.
  - Check 2 ✅ — `200 {"applied":2,"accepted":[901,903],"rejected":[{"id":902,"table_name":
    "products","op":"I","code":"23505","constraint":"products_name_type_size_idx",...}]}`.
  - Check 3 ✅ — `sync_rejected`: exactly one row, `products | I | 23505 |
    products_name_type_size_idx | Key (name, type, COALESCE(size, ''::character varying))=(ZZ Sync
    Test, stock, test) already exists.`
  - Check 4 ✅ — customers `999901 ZZ Sync Test A`, `999902 ZZ Sync Test B`; products: only 999001.
  - Check 5 ✅ — op `"Z"` → `409 {"error":"unknown op \"Z\""}`; `sync_rejected` 1 before and after;
    customer 999903 absent.
  - Cleanup: both customers deleted through ingest (`applied 2`), product 999001 deleted; `ZZ`
    customers 0, products 0, ledger rows 0.

**Fix (18 Oct 2026), found while building T2.8:** after applying a batch, ingest reset each
touched table's serial sequence with `setval(seq, GREATEST((SELECT max(pk) ...), 1)) FROM
pg_get_serial_sequence(...) WHERE seq IS NOT NULL`. For `report_schedules`, whose only key column
is `frequency` (varchar), Postgres rejects `GREATEST(text, 1)` when the statement is parsed, so the
`WHERE` never helps: `500 GREATEST types text and integer cannot be matched`. That is not a row
error (class 42), so the whole batch rolls back and the worker retries it forever. The factory's
cron updates `report_schedules.last_run_at` every time a scheduled report runs, so **the first
scheduled report after go-live would have stopped all uploads**. Ingest now looks the sequence up
first and skips keys without one; `setval(seq, max, true)` is unchanged (§10). New check in
`npm test`: "a change to report_schedules (text primary key) uploads instead of stalling sync" —
passes with the fix, fails with the old statement (`server replied 500: GREATEST types text and
integer cannot be matched`). Needs the backend deploy before the first factory install (T1.10).

---

### T1.4 — Bad-row quarantine — factory + retry (D11)

**Status:** CODE DONE, CHECKS FAILING — checks 2–6 verified by `npm test` (the real `SyncWorker`
against `SyncController`, throwaway databases) and the Retry page in headless Chrome; not yet on a
factory install with the deployed VPS (check 4's restart is simulated by a new worker)
**Deps:** T1.3

**Do:**
1. Add to `syncCapture.js` `SETUP_SQL`, and to `EXCLUDED_TABLES`:

```sql
CREATE TABLE IF NOT EXISTS public.sync_quarantine (
  id              bigserial PRIMARY KEY,
  outbox_id       bigint,
  table_name      text NOT NULL,
  op              char(1) NOT NULL,
  row_data        jsonb NOT NULL,
  code            text, constraint_name text, detail text,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
```

2. In `SyncWorker`, on a 2xx with `{ accepted, rejected }`, in **one local transaction**:
   - insert a `sync_quarantine` row per `rejected[]` entry (with its error fields);
   - `DELETE FROM sync_outbox WHERE id = ANY($1)` for accepted **∪** rejected;
   - `UPDATE sync_state SET last_synced_at = now() WHERE id = 1`.
3. **Retry** (factory app, Owner): for a quarantined row, read the live row from its table by
   primary key and insert it into `sync_outbox` (`U` with the current row, or `D` with the primary
   key if the row no longer exists); set `sync_quarantine.resolved_at`. There is no retry endpoint
   on the VPS (F5).
4. The number of open quarantined rows appears in the factory status (T1.5).

**Checks:**
1. Re-run T1.3's duplicate-product scenario.
2. `SELECT outbox_id, table_name, code, detected_at FROM sync_quarantine` → one row.
3. Same query on `sync_outbox` → that row is gone.
4. Restart the factory app → the rejected change is not re-sent; outbox stays empty.
5. An ordinary sale with nothing rejected → quarantine count unchanged, outbox drains.
6. Delete the conflicting `products` row on the VPS, press Retry → a new outbox row; the next sync
   applies it; `sync_quarantine.resolved_at` and the VPS `sync_rejected.resolved_at` are set.

**Gate:** checks 2–6 observed.

**Implementation notes:**
- `SyncWorker.settle()` does step 2 in one transaction; `push()` now returns the reply. A reply
  without `accepted`/`rejected` counts as all accepted; a reply that settles nothing ends the
  round instead of looping. `sync_quarantine` and `sync_rejected` added to `EXCLUDED_TABLES`.
- Retry: `backend/services/syncQuarantine.js` + `routes/syncQuarantine.js` at
  `/api/sync-quarantine` (Owner), mounted only when `FMS_FACTORY=1` (set by `desktop/main.js`;
  T3.1's `host.js` must set it too). Retry settles every open entry for the same row. Page
  **Sync issues** (factory build only, Owner): what, item, plain-language reason, Retry.
- Status (step 4): `SyncWorker` reports `quarantined`; the window title adds "N changes refused by
  the server (see Sync issues)". T1.5 moves it into the status bar.

**Evidence (16 Oct 2026):**
- `npm test` → `tests 13 / pass 13`. New:
  - *a refused change is quarantined on the factory, leaves the outbox, and is not re-sent* —
    checks 1–5: `sync_quarantine` one row (`outbox_id` = the product's outbox id, `products | I |
    23505 | products_name_type_size_idx`); the outbox no longer holds it; a new worker
    ("restart") sends nothing more (`sync_rejected` stays at 1); an ordinary customer insert
    drains, `quarantined` stays 1.
  - *Retry re-sends the row as it is now and settles both sides* — check 6: conflicting product
    deleted on the server → Retry → `{ op: 'U' }`, one outbox row carrying the later edit;
    the next round applies it, `quarantined: 0`, no open `sync_rejected` rows; a second Retry →
    nothing. A row deleted at the factory before Retry → `{ op: 'D' }`.
- Sabotage: skipping the quarantine insert → both new tests fail; restored.
- UI, factory-mode harness (change capture on, one quarantined product) + desktop Vite build in
  headless Chrome: Owner sees **Sync issues** in the sidebar (no Offline Setup), the row "New ·
  products | Block (#1) | Already exists on the online server (duplicate)", presses Retry → "Block
  (#1) will be uploaded again with the next sync", list empty; DB: `sync_outbox` `products | U |
  Block`, the quarantine entry resolved. Manager: redirected to `/dashboard`, API → `403 Owner
  access required`. A repeated retry → `404`.
- ⏳ On a factory install against the deployed VPS: the duplicate-product scenario end to end,
  including a real app restart.

---

### T1.5 — Sync status on both versions + heartbeat

**Status:** CODE DONE, CHECKS FAILING — checks 1–4 observed end to end with the real worker,
status reporter and routes on throwaway databases (time shifted for the 5-min / 30-min
thresholds); not yet on a factory install against the deployed VPS
**Deps:** T1.1, T1.4 (quarantine count), T1.6 (relay state)

**Migration 026 (VPS table, register per §4):**

```sql
CREATE TABLE IF NOT EXISTS sync_heartbeat (
  id                      int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  received_at             timestamptz NOT NULL DEFAULT now(),
  outbox_count            int,
  oldest_outbox_age_sec   int,
  quarantine_count        int,
  whatsapp_state          text,
  whatsapp_oldest_age_sec int,
  sync_state              text
);
```

**Do — factory:**
1. `GET /status` on the factory PC → `{ state, lastSyncedAt, outboxCount, oldestOutboxAge,
   quarantineCount, relayState, whatsappQueued, oldestWhatsappAge, tablesWithoutPk }`.
2. A status bar inside the factory app on every terminal, polling it (new
   `frontend/src/api/statusApi.js`, importing from `./http`): "Uploaded ✓" / "Waiting: N changes" /
   "Problem". Green; amber when the backlog is older than 5 min; red when blocked
   (`blocked_not_writer`), when records are quarantined, or when a table has no primary key (D12;
   `syncCapture.js` already detects these). This replaces the window title as the operator's sync
   indicator (F10); a Windows service has no window (Phase 3).
3. `POST /sync/heartbeat` every minute with the same counts (on the `/sync` router, so read-only
   mode doesn't block it — F2).

**Do — online dashboard:**
1. "Factory last updated X min ago", from `sync_heartbeat.received_at` and
   `sync_writer.last_ingest_at`. Green under 2 min; amber from 2 to 30 min; red at 30 min or more
   ("factory offline").
2. A permanent **"View-only"** label (D7).

**Checks:**
1. `curl -s .../status` on the factory returns the full shape.
2. Healthy → green; stop the VPS so the outbox backs up past 5 min → amber; register another PC so
   this one is blocked → red.
3. `SELECT received_at, outbox_count FROM sync_heartbeat` updates every minute.
4. Stop the factory → the online bar turns amber, then red.

**Gate:** checks 1–4 observed.

**Implementation notes:**
- `desktop/lib/status.js`: `collectStatus()` (the shape above plus `error`, `relayError`,
  `generatedAt`, `level`, `problems[]`) and `StatusReporter` (plain Node, for T3.1 too): rewrites
  `status.json` every 15 s and on every sync report, heartbeat every 60 s, none once blocked.
  `installSyncCapture` now returns `tablesWithoutPk`.
- Levels: red = `blocked_not_writer`, `not_registered`, `error`, open quarantine, a table without
  a primary key; amber = outbox older than 5 min, or WhatsApp alerts queued behind a relay
  problem (T1.6); else green. The bar turns red if `status.json` is older than 90 s.
- Factory backend: `GET /status` and `GET /branding` moved to `routes/factoryLocal.js` (public,
  only when `desktop/main.js` sets the files). VPS: `POST /sync/heartbeat` (upload key),
  `GET /api/sync-status` (any role, `routes/syncStatus.js`, `services/factoryStatus.js`), migration
  026 registered in all four places. Offline Setup's 🟢/🔴 now uses the heartbeat too.
- Registering a new PC clears `sync_heartbeat` (found during check 2: otherwise the online bar
  would report the replaced PC's last heartbeat).
- A heartbeat refused with `403 WriterNotRegistered` calls `SyncWorker.markNotWriter()` (via
  `StatusReporter`'s `onNotWriter`), so a replaced PC turns red within a minute even when it has
  nothing to upload; before, it found out only on its next upload. Once blocked, the worker
  reports nothing but `blocked_not_writer`.
- `frontend/src/components/SyncStatusBar.jsx` at the top of `<main>` in `Layout`; factory build
  polls `GET /status` every 10 s, online every 60 s with the "View-only" label.

**Evidence (16 Oct 2026)** — one script: throwaway embedded Postgres with a factory and a server
database; "server" = real `routes/sync.js` + `routes/syncStatus.js`; "factory" = real `SyncWorker`,
`StatusReporter` (refresh 2 s, heartbeat 3 s for the run) and `routes/factoryLocal.js`; both
dashboards via Vite (desktop and online builds) in headless Chrome:
- Check 1 ✅ — `curl` factory `/status` → `state, error, lastSyncedAt, outboxCount,
  oldestOutboxAge, quarantineCount, relayState, relayError, whatsappQueued, oldestWhatsappAge,
  tablesWithoutPk, generatedAt, level, problems, ageSec` (relay fields `null` in this run, which had
  no relay; with one they carry T1.6's `status()`, covered in `npm test`).
- Check 2 ✅ — healthy: `level green`, bar "● Uploaded ✓ Last upload just now". Server stopped, a
  sale, outbox aged to 379 s → `state offline, level amber`, bar "Waiting: 1 change … No internet
  — changes are waiting". Server back, a second PC registered → `state blocked_not_writer, level
  red`, bar "Not uploading … This PC is no longer the registered main PC — nothing is uploaded".
- Check 3 ✅ — `SELECT received_at, outbox_count, sync_state FROM sync_heartbeat` three times
  3.5 s apart: `10:42:46 | 1 | ok`, `10:42:49 | 0 | ok`, `10:42:52 | 0 | ok` (every 60 s in the
  app).
- Check 4 ✅ — factory worker and reporter stopped; heartbeat 5 min old → `/api/sync-status`
  `level amber`, bar "VIEW-ONLY Factory last updated 5 min ago"; 45 min → `level red`, "VIEW-ONLY
  Factory offline — last updated 45 min ago" (timestamps shifted, not waited out).
- Follow-up (16 Oct 2026): `npm test` → `tests 19 / pass 19`, new *an idle PC that was replaced
  finds out from its heartbeat: worker stops, status red* (state `blocked_not_writer`, level red,
  `status.json` updated). Sabotage: not calling `onNotWriter` → only that test fails.
- `npm test` → `tests 15 / pass 15`. New: heartbeat needs the key and drives green/amber/red, a new
  registration starts with no heartbeat; `collectStatus` green → amber (6-min backlog) → red
  (blocked / quarantine / table without key), amber for stuck WhatsApp alerts.
- ⏳ On a factory install against the deployed VPS, with real minutes.

---

### T1.6 — WhatsApp relay state + `whatsapp_dead`

**Status:** CODE DONE, CHECKS FAILING — checks 1–4 observed on the real `AlertRelay` (throwaway
database, fake n8n), not on a factory install with the VPS config changed; the 5-minute repeat of
the no-target error and "still present after 10 min" were not waited out

**Problem (F6):** relay failures are visible only in `fms.log`.

**Files:** `desktop/lib/alertRelay.js`

**Do:**
1. Track `relayState ∈ {ok, no_target, n8n_rejecting, offline}`; expose it to the status (T1.5).
2. **Never delete expired messages.** At 48 h move them to `whatsapp_dead` (kept 30 days) instead
   of `DELETE`. Keep the stale-skip policy for *sending*, not for storage.
3. On an n8n 4xx/5xx, keep messages queued, set `n8n_rejecting`, and store the response body
   (first 500 characters), so e.g. an unregistered Meta number is visible.
4. Log at error level every 5 min while `no_target` (not every 30 s flush).

**Checks:**
1. **No target:** unset `N8N_PUBLIC_WEBHOOK_URL` on the VPS, restart the factory app, make a sale →
   an error-level log line within 5 min, `relayState = no_target`, and the `whatsapp_outbox` row is
   still present after 10 min.
2. **n8n rejecting:** point the target at a URL that returns 403 → `n8n_rejecting`, response body
   in the log, row still queued.
3. **Recovery:** restore the correct target → the message flushes and the row is removed.
4. **Expiry:** temporarily lower the 48 h constant to 30 s → the row **moves to `whatsapp_dead`**
   with its content intact. Revert the constant.

**Gate:** all four observed; no code path deletes a `whatsapp_outbox` row without first inserting
into `whatsapp_dead`.

**Implementation notes:** `relay.status()` → `{ relayState, relayError, whatsappQueued,
oldestWhatsappAge, whatsappDead }` for T1.5. State changes are logged once (`ERROR alerts: ...`
for anything but `ok`). Expiry runs every round, with or without a target. Cloudflare's
502/503/504/530 count as `offline`, any other non-2xx as `n8n_rejecting`. `whatsapp_dead` is in
`EXCLUDED_TABLES`. `expireAfterMs` is a constructor option (default 48 h) so check 4 needs no
code edit.

**Evidence (16 Oct 2026)** — script driving the real `AlertRelay` (its HTTP endpoint on
`ALERT_PORT`), throwaway embedded Postgres, a fake n8n on 127.0.0.1:
- Check 1 ✅ — no target, a sale alert queued → `ERROR alerts: WhatsApp sending ok -> no_target:
  no WhatsApp target from the server (N8N_PUBLIC_WEBHOOK_URL)` and `ERROR alerts: no WhatsApp
  target configured on the server; ...`; status `relayState: "no_target"`, `whatsappQueued: 1`;
  the row is still in `whatsapp_outbox` after three rounds.
- Check 2 ✅ — target answering `403` → `ERROR alerts: WhatsApp sending no_target -> n8n_rejecting:
  n8n replied 403: {"error":{"message":"(#131030) Recipient phone number not in allowed
  list",...}}`; the same text in `status().relayError`; row still queued. Unreachable target →
  `offline`, row still queued.
- Check 3 ✅ — target answering 200 → `alerts: WhatsApp sending offline -> ok`, `alerts: sent 1
  WhatsApp alert`; `whatsapp_outbox` empty; n8n received `["New sale #41: Rs 52,000"]`.
- Check 4 ✅ — `expireAfterMs = 30 s`, no target: after 35 s → `ERROR alerts: 1 WhatsApp alert(s)
  were never sent in time and moved to whatsapp_dead`; `whatsapp_outbox` empty, `whatsapp_dead`
  `[{"id":"1","message":"Low stock: Cement (12 bags left)","last_error":"no WhatsApp target ..."}]`.
- Gate ✅ — `grep` finds two deletes from `whatsapp_outbox`, both in `alertRelay.js`: the expiry,
  which inserts into `whatsapp_dead` in the same statement (`WITH expired AS (DELETE ... RETURNING)
  INSERT INTO whatsapp_dead`), and the removal of an alert n8n has just accepted with a 2xx (sent,
  not lost). No other code path deletes or truncates it.
- ⏳ On a factory install: unset `N8N_PUBLIC_WEBHOOK_URL` on the VPS, wait out 5 and 10 min.

---

### T1.7 — Config `reason` + startup warning

**Status:** CODE DONE, CHECKS FAILING — checks 1–2 verified through the real `/sync/config`
route chain in `npm test`; check 3 is a line in `server.js`'s startup, not run here (§0.3: no
second `server.js`) — observe it in `docker compose logs backend` after deploy
**Deps:** T1.6

**Do:**
1. `SyncController.getConfig` returns `{ whatsapp: null, reason: 'N8N_PUBLIC_WEBHOOK_URL unset' }`
   instead of a bare `null`. Keep the key name `whatsapp`.
2. `backend/server.js` at startup: if `SYNC_TOKEN` is set and `N8N_PUBLIC_WEBHOOK_URL` is not, log
   a loud warning. **Do not exit and do not fail `setup.sh`** — sync on with alerts off is a valid
   configuration.

**Checks:**
1. `/sync/config` with the variable unset → `{"whatsapp":null,"reason":"N8N_PUBLIC_WEBHOOK_URL unset"}`.
2. Set it, restart, re-query → `whatsapp` populated, no `reason`.
3. Restart with it unset and `SYNC_TOKEN` set → the warning appears once in stdout and the process
   keeps running.

**Gate:** all three observed.

**Implementation notes:** the factory keeps the reason as `cfg.whatsappReason` and the relay
uses it as its `no_target` error (`getNoTargetReason`), so the status bar and T1.8's test button
show "N8N_PUBLIC_WEBHOOK_URL unset" rather than a guess. Before the first `/sync/config` the
relay says "no WhatsApp settings received from the server yet" (or "this PC is not registered").

**Evidence (16 Oct 2026):**
- Checks 1–2 ✅ — `npm test` (`tests 16 / pass 16`): unset → `{"whatsapp":null,"reason":
  "N8N_PUBLIC_WEBHOOK_URL unset",...}`; set → `whatsapp.url` populated, no `reason` key.
- ⏳ Check 3 — after deploy, with the variable unset: `⚠️⚠️⚠️  N8N_PUBLIC_WEBHOOK_URL is not set:
  ...` once in the backend log, process still up. (The VPS has it set today, §1.)

---

### T1.8 — Test WhatsApp button + honest report button

**Status:** CODE DONE, CHECKS FAILING — outcomes 1 and 2 observed with the real relay and routes
against a fake n8n; outcome 3 (a message actually arriving on the owner's WhatsApp through the
live n8n and Meta) has to be done by the owner on a factory install
**Deps:** T1.6, T1.7

**Do:**
1. A **"Send test WhatsApp"** control in the factory app (Owner), on a factory-only endpoint. It
   sends through the full path (backend → relay → n8n → Meta) and shows the real result: the
   `reason` when unconfigured, the n8n response body when rejected.
2. The existing "Send today's report" button reports what actually happened — "queued" on the
   factory, and a failure when sending fails — instead of always "sent" (F6).

**Checks (manual):**
1. Variable unset → the button reports "N8N_PUBLIC_WEBHOOK_URL unset".
2. Variable set but Meta token wrong → the button shows the n8n response body.
3. Everything correct → the message arrives on the owner's WhatsApp.

**Gate:** all three outcomes observed and recorded.

**Implementation notes:**
- Relay `POST /test` (same secret as `/alert`): one message straight to n8n, never queued,
  returns `{ ok, result: sent|no_target|rejected|offline, status, detail }` (`detail` = the
  server's reason, or n8n's reply, first 500 chars) and updates the relay state the status bar
  shows. Backend `POST /api/whatsapp-test` (Owner, factory only: `FMS_FACTORY=1`) builds a test
  message and calls it. UI: a "WhatsApp alerts" card on the factory's **Sync issues** page
  (sending state, queue size, **Send test WhatsApp**, result).
- `sendWhatsApp` still never throws, but now resolves `{ ok, queued }` / `{ ok: false, error }`.
  "Send Today's Report" returns 200 "queued on this PC…" on the factory, 200 "handed to WhatsApp
  (n8n accepted it)" on a server that talks to n8n directly, 502 "The report was not sent: …" on
  failure; the Reports page now shows that message (it showed nothing on success before).
- n8n's webhook is in "last node" mode without "continue on fail", so when the Meta call fails
  n8n answers `500 {"message":"Error in workflow"}`: the button shows that, not Meta's own text.
  The Meta detail is in the n8n execution log. Showing it in FMS would need an error branch in
  the n8n workflow — not in this task.

**Evidence (16 Oct 2026)** — the real `AlertRelay`, `routes/whatsappTest.js`,
`routes/reports.js`, `routes/factoryLocal.js` + `StatusReporter` on a throwaway database; a fake
n8n; the page in headless Chrome (desktop build):
- Outcome 1 ✅ — server reason `N8N_PUBLIC_WEBHOOK_URL unset` → `{"ok":false,"result":"no_target",
  "detail":"N8N_PUBLIC_WEBHOOK_URL unset"}`; card: "Sending: Not set up on the online server
  (N8N_PUBLIC_WEBHOOK_URL unset)", result "Not sent. N8N_PUBLIC_WEBHOOK_URL unset".
- Outcome 2 ✅ — n8n failing the Meta call → `{"ok":false,"result":"rejected","status":500,
  "detail":"{\"message\":\"Error in workflow\"}"}`; wrong webhook secret → `403 Authorization data
  is wrong!`; card: "Sending: Refused by WhatsApp (n8n replied 403: Authorization data is wrong!)",
  result "Not sent. Authorization data is wrong!".
- Outcome 3 (simulated) — n8n 200 → `{"ok":true,"result":"sent",...,"detail":"{\"status\":\"sent\",
  \"whatsappMessageId\":\"wamid...\"}"}`; card "Sending: Working", "Sent — check the owner's
  WhatsApp."
- Report button ✅ — via the relay → `200 {"success":true,"queued":true,"message":"Today's report is
  queued on this PC…"}`; relay unreachable → `502 {"error":"The report was not sent: fetch failed"}`.
- `npm test` → `tests 16 / pass 16` (no sync behaviour changed).
- ⏳ Outcome 3 for real, on a factory install, by the owner.

---

### T1.9 — Faster upload + final upload on quit

**Status:** CODE DONE, CHECKS FAILING — checks 1–4 verified on the real `SyncWorker` +
change-capture trigger + `SyncController` in `npm test`; not yet by quitting the real app on a
factory install against the deployed VPS
**Deps:** T1.4

**Do:**
1. After any business write, schedule a push within **2 s** (coalesced) using the existing
   `SyncWorker.kick()`. The idle poll stays 15 s.
2. On quit (`before-quit` in `desktop/main.js`, which already calls `syncWorker.stop()`): run one
   final upload, capped at **10 s**, before stopping. The full 45 s drain for the Windows service
   is part of T3.2.

**Checks:**
1. Create a sale, poll the VPS → the row appears within ~3 s.
2. Five sales in quick succession → the log shows a coalesced push, not five batches.
3. Network up: create a sale, quit immediately → the row is on the VPS.
4. Network down: create a sale, quit → the outbox still holds it; restore the network and start
   the app → it drains.

**Gate:** all four observed.

**Implementation notes:**
- `fms_sync_capture()` does `PERFORM pg_notify('fms_sync_outbox', '')` after each outbox insert:
  delivered only on commit, identical notifications in one transaction collapse.
- `SyncWorker` keeps one `LISTEN fms_sync_outbox` connection (reconnects after 5 s; the 15 s idle
  poll covers meanwhile). A notification starts a 2 s timer (`PUSH_DELAY_MS`); further ones in that
  window are ignored, then `kick()`. A kick during a running round queues one more round right
  after it, so nothing waits for the idle poll.
- `finalUpload(timeoutMs)`: stops scheduling, waits for a running round, runs one more, and an
  `AbortController` cuts the request in flight at the cap (`push()` uses
  `AbortSignal.any([timeout, abort])`). Skipped when this PC is blocked. `main.js` `before-quit`
  calls `finalUpload(10_000)` then `stop()`.

**Evidence (16 Oct 2026)** — `npm test` → `tests 18 / pass 18`:
- Check 1 ✅ — worker started and idle, one insert → on the server after **2038 ms** (idle poll
  15 s).
- Check 2 ✅ — five inserts in a row → the log shows exactly `["sync: pushed 5 change(s)"]`.
- Check 3 ✅ — insert, then `finalUpload(10000)` straight away → 0 left, the row is on the server.
- Check 4 ✅ — server never answering: `finalUpload(1000)` returns after ~1 s with 1 change left,
  state `offline`, the row still in `sync_outbox`; a fresh worker round with the server back
  drains it.
- Sabotage: trigger without `pg_notify` → only the check 1/2 test fails (the change waits for
  the 15 s poll); restored.
- ⏳ On a factory install: sale + immediate quit with the network up and down, using the real
  Electron `before-quit`.

---

### T1.10 — Release 1.0.2 + first factory install (go-live)

**Status:** NOT STARTED
**Deps:** T0.2, T1.0–T1.9

**Do:**
1. Confirm every VPS-side change of T1.1–T1.9 is deployed and migrations 022–026 are applied
   (`SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 5`).
2. Run `npm test` in `desktop/` → all pass (rule 10). Then build installer 1.0.2 (bump `desktop/package.json` version, `npm run dist`) and upload the
   installer, its `.blockmap` and `latest.yml` to the VPS `~/fms/downloads`.
3. On the VPS: set `READ_ONLY_MODE=true` in `~/fms/backend/.env`, then
   `sg docker -c "docker compose up -d backend"` (D5).
4. Owner: Offline Setup → set the name and logo → create a setup code.
5. Factory PC: install 1.0.2 → enter the setup code → the VPS data is copied.

**Checks:**
1. `npm test` output (all pass) pasted as evidence.
2. A sale at the factory appears on the VPS within seconds; factory status green.
3. The online bar shows green and "View-only".
4. A second PC with no code / a used code cannot register.

**Gate:** all four observed.

**Phase 1 exit:** no bad row can stall sync; only the registered PC can upload; sync health is
visible on both versions; alert failures are visible; the factory is live.

---

## 8. Phase 2 — at and after go-live

### T2.1 — VPS send-only report scheduler

**Status:** CODE DONE, CHECKS FAILING — checks 2, 3 (the race), 4 and 5 by `npm test` and grep
(18 Oct 2026); check 1 needs a real WhatsApp delivery, and the VPS needs migration 028 and
`REPORT_SENDER_MODE=send_only` at go-live
**Deps:** T1.10

**Problem (F12):** reports and digests go out only if the factory PC is on at that minute.

**Migration 028 (VPS table, register per §4):**

```sql
CREATE TABLE IF NOT EXISTS report_dispatch_log (
  id         bigserial PRIMARY KEY,
  frequency  text NOT NULL,
  period_key text NOT NULL,          -- e.g. 'daily:2025-06-01'
  sent_at    timestamptz NOT NULL DEFAULT now(),
  status     text NOT NULL,          -- 'sent' | 'failed'
  payload    jsonb,
  UNIQUE (frequency, period_key)
);
```

**Do:**
1. New `backend/services/sendOnlyScheduler.js`, enabled by `REPORT_SENDER_MODE=send_only` on the
   VPS (whose backend already runs in `Asia/Karachi`).
2. Every minute: read `report_schedules` from the mirror, find due schedules (keep the existing
   `>=` catch-up semantics from `cronJobs.js`), generate from **read-only queries only**, send via
   `sendWhatsApp`. Reuse `ReportsController.buildReportMessage` and `resolvePeriod`.
3. Record `report_dispatch_log` **after** a successful send. If the send fails, write no row — the
   next minute retries.
4. Digests (7:30 and 10:00 Asia/Karachi) move the same way, keyed `digest:0730:<date>`.
5. Header comment: this file never writes mirror tables; every statement except the dispatch-log
   insert is a `SELECT`. (Cron runs in-process, so it bypasses the read-only wall; this is enforced
   by review.)

**Checks:**
1. A schedule due in 2 minutes with the factory app **off** → the report arrives on WhatsApp.
2. `SELECT frequency, period_key, status, sent_at FROM report_dispatch_log` → exactly one row for
   that period.
3. Restart the VPS backend inside the same minute → still one row, no second message.
4. Point n8n at a failing URL → no dispatch row; fix it → the next minute sends once.
5. `grep -nE "INSERT|UPDATE|DELETE" backend/services/sendOnlyScheduler.js` → only the
   `report_dispatch_log` insert.

**Gate:** checks 1–5 observed.

**Built (18 Oct 2026):**
- Migration **028** `report_dispatch_log` (as above, with a comment), registered in all four places
  (§4): `PROTECTED_TABLES`, `VPS_ONLY_TABLES`, `EXCLUDED_TABLES`.
- `backend/services/sendOnlyScheduler.js`: every minute, `dueItems(now)` reads `report_schedules`
  (same `>=` catch-up, weekday / day-of-month rules as `cronJobs.js`) and builds with
  `resolvePeriod` + `generateSnapshot` + `buildReportMessage`. **Digests:** `digest:0730:<date>`
  is due from 07:30 until 10:00 and `digest:1000:<date>` from 10:00 until midnight, so a late
  start never sends both. `buildDailyDigest` was split out of `sendDailyDigest`
  (`stockAlerts.js`) so the scheduler sees the send result.
- **Once per period, even with two processes:** a cheap `SELECT` skips periods already sent. Then,
  in one transaction: `INSERT … ON CONFLICT DO NOTHING` (0 rows = someone else has it) → send →
  `COMMIT` only if the send worked, otherwise `ROLLBACK`, so no row is written and the next minute
  retries. A second process inserting the same key waits on that row, then skips. The row lands
  only after a successful send, as step 3 asks. A crash mid-send rolls back, and the next minute
  sends again (at least once).
- `server.js`: `REPORT_SENDER_MODE=send_only` starts this scheduler **instead of** `cronJobs.js`,
  with or without read-only mode. Otherwise nothing changes. Documented in
  `backend/.env.example`.

**Evidence (18 Oct 2026):**
- `npm test` → `send-only scheduler: a due report goes out once, a failed send retries, a racing
  second process does not double-send, the mirror is never written` ✔ (fake send, 150 ms each):
  nothing at 7:29; 9:15 + 9:16 → one `(7:30 AM)` digest; with that row removed, a start at 10:05
  → only the `(10:00 AM)` digest; daily at 21:00 with n8n failing → **no row** (check 4); 21:01
  twice **at the same time** + 21:02 + 23:59 → **one** message, one row `daily:<date> | sent`,
  `payload.message` = what was sent (checks 2, 3); `reports` count and `report_schedules`
  unchanged; no capture trigger on `report_dispatch_log` at the factory; ingest of it → 409;
  snapshot test now also asserts `sync_rejected`, `sync_heartbeat`, `report_dispatch_log` absent.
- Sabotage: send first, then insert without the transaction → the same test fails `exactly one
  report message for the day — actual: 2`. Restored.
- Check 5 ✅ — `grep -nE "INSERT|UPDATE|DELETE" backend/services/sendOnlyScheduler.js` →
  `83:      \`INSERT INTO report_dispatch_log (frequency, period_key, status, payload)` only.
- ⏳ Check 1 (a real WhatsApp delivery with the factory off) at go-live; check 3 against a real
  restart of the VPS backend.

---

### T2.2 — Factory `DISABLE_CRON`

**Status:** CODE DONE, CHECKS FAILING — the startup log observed on the real `server.js` (18 Oct
2026); the one-delivery check needs go-live (the factory on 1.0.2 + the VPS in send-only mode)
**Deps:** T2.1

**Do:** gate `startCronJobs()` in `server.js` behind `DISABLE_CRON=true`, and set it in the
factory app's backend environment (`desktop/main.js`, release 1.0.3, after `npm test` passes,
rule 10), so exactly one scheduler exists. Ship this **after** T2.1 is deployed and verified, or reports stop in the gap.

**Checks:** with `DISABLE_CRON=true` the factory log shows no cron start; across one full
scheduled window exactly **one** message arrives.

**Gate:** one delivery observed, and the factory log shows cron did not start.

**Built (18 Oct 2026):**
- `server.js`: a `DISABLE_CRON=true` branch after `REPORT_SENDER_MODE=send_only` and before the
  read-only branch, so it starts neither scheduler and logs
  `⏸️ DISABLE_CRON: no scheduled reports or digests from this server`.
- `desktop/main.js` sets `DISABLE_CRON: 'true'` in the backend's environment.
- **Release: 1.0.2, not 1.0.3.** No 1.0.2 install exists yet, so the factory has never been the
  sender. Both halves are switched on in the same sitting at go-live (`GO-LIVE-CHECKLIST.md` E1:
  `READ_ONLY_MODE=true` **and** `REPORT_SENDER_MODE=send_only`), so there is no gap with no sender
  and no time with two. Until E1 the VPS keeps its current cron jobs.

**Evidence (18 Oct 2026):**
- `env -i … DISABLE_CRON=true node server.js` (scratch port, no database) → `⏸️ DISABLE_CRON: no
  scheduled reports or digests from this server`, no `✅ Cron jobs started`; the same without the
  flag → `✅ Cron jobs started`.
- `npm test` 27/27.
- ⏳ At go-live: the factory log (1.0.2) shows the `DISABLE_CRON` line; across one scheduled window
  exactly one WhatsApp message arrives (T2.1 check 1).

---

### T2.3 — Report freshness label + history view (D2, D9)

**Status:** CODE DONE, CHECKS FAILING — checks 1–3 by `npm test` on the real scheduler and route
(18 Oct 2026); on production they need the deploy and the factory live, and the history page has
been built and linted but not yet opened in a browser
**Deps:** T2.1, T1.5

**Do:**
1. Every VPS-sent message ends with "data as of `<last_ingest_at>`" (from `sync_writer`).
2. If the factory hasn't uploaded for > 2 h, prefix a stale-data warning.
3. If `last_ingest_at` is earlier than the end of the report's period, label it **"period
   incomplete"**.
4. A read-only history view of `report_dispatch_log` on the dashboard.

**Checks:**
1. Factory off for > 2 h → the next scheduled message carries the stale warning and the correct
   timestamp.
2. Fresh sync → no warning; timestamp within a minute of the last upload.
3. The history view lists the sent reports.

**Gate:** all three observed.

**Built (18 Oct 2026):**
- `backend/services/reportFreshness.js`: `getDataAsOf()` = the later of `sync_writer.last_ingest_at`
  and the last heartbeat that reported an **empty outbox**. A factory with nothing new to upload is
  still current, so "data as of" doesn't age just because there were no changes. `withFreshness()`
  wraps the message:
  - `⚠️ *Old data:* the factory has not uploaded for N h.` first, when that is > 2 h old (or
    `No upload from the factory yet`);
  - `⚠️ *Period incomplete:* anything entered at the factory after <time> is not included.` for
    reports whose period ends (or `now`, if sooner) more than 10 min after "data as of". Digests
    have no period, so they never get this line;
  - `_Data as of <time>_` last, always.
- `sendOnlyScheduler.js` uses it for reports and digests and stores `dataAsOf` in the dispatch
  row's `payload` with what was sent.
- `GET /api/reports/dispatch-log?page=&limit=` (`ReportsController.listDispatchLog`, read-only).
  Online dashboard → Reports → **Sent to WhatsApp** tab (`SentReports.jsx`; hidden on the factory
  build, which sends none): sent time, kind, label, data as of; click a row for the message.

**Evidence (18 Oct 2026):**
- `npm test` → `server-sent reports say how fresh the data is …` ✔ (27/27): upload 1 min ago → no
  warning, ends with `_Data as of …_`. No upload for 5 h but a heartbeat 1 min ago with an empty
  outbox → no warning, as of = that heartbeat. Last upload 185 min ago (heartbeat 180 min, 4
  waiting) → `⚠️ *Old data:* … for 3 h.` + `Period incomplete`, `payload.dataAsOf` = the upload
  time. 30 min behind → `Period incomplete` only. A digest 10 h stale → the warning, no period
  line. `listDispatchLog` → 200, the three rows sent, each `message` exactly as sent.
- Frontend: `eslint` clean on the changed files, `vite build` OK.
- ⏳ Production: after the deploy and migration 028, with the factory live, a scheduled message
  carries the label (check 2), and one sent with the factory off > 2 h carries the warning (check
  1). The tab lists them (check 3).

---

### T2.4 — Health endpoint + n8n watchdog

**Status:** CODE DONE, CHECKS FAILING — checks 1–2 seen on a scratch n8n 2.37.10 (the production
version) with a stand-in health endpoint, and the rules by `npm test` (18 Oct 2026); on production
they need the deploy, `bash deploy/provision-n8n.sh`, and the factory PC sending heartbeats
**Deps:** T1.5

**Do:**
1. `GET /sync/health` (protected by `SYNC_TOKEN`) → `{ last_ingest_at, writer_registered,
   rejectedOpenCount, heartbeat }`.
2. An n8n workflow checks it every 10 min. Alert the owner when the heartbeat is **recent** and
   any of: `oldest_outbox_age_sec > 1800` · `quarantine_count > 0` · `whatsapp_state != 'ok'` ·
   `whatsapp_oldest_age_sec > 3600` · `sync_state` is `blocked_not_writer`.
3. A missing heartbeat means the factory PC is off — **normal, do not alert**.

**Checks:**
1. Force each alert condition one at a time → the WhatsApp alert fires.
2. **Negative case:** stop the factory PC for 20 minutes → **no** alert.

**Gate:** both observed, including the negative case.

**Built (18 Oct 2026):**
- `GET /sync/health` (`routes/sync.js`, before the upload-key check) behind
  `middleware/requireSyncToken.js`: `X-Sync-Token` must equal `SYNC_TOKEN` (timing-safe), else 403.
  Returns `{ last_ingest_at, writer_registered, rejectedOpenCount, heartbeat, heartbeat_recent,
  alerts: [{ key, message }] }`.
- The alert rules are in `backend/services/syncHealth.js`, not in n8n, so `npm test` covers them:
  `outbox_backlog` (oldest > 1800 s), `quarantine` (> 0), `whatsapp_state` (set and not `ok`; a
  missing state is not a fault), `whatsapp_backlog` (> 3600 s), `not_writer`. Every rule needs a
  heartbeat **younger than 5 minutes**; an older or missing one (PC off) gives no alerts.
  Note: `not_writer` rarely reaches the server, because a replaced PC's heartbeat is refused (403)
  before it is stored. It is kept for completeness.
- `n8n/fms-sync-watchdog.json`: every 10 min → GET the health URL (full response, never error,
  continue on error) → a Code node decides → POST `{ message }` to the existing alerts webhook with
  `X-FMS-Secret`, so it reuses the Meta credential. The Code node keeps what it last sent in the
  workflow's static data. It sends a new set of problems at once, the same set again only after
  6 h, and one "cleared" message when they are gone. A switched-off PC changes nothing. A health
  call that fails (non-200 / no reply) is an alert of its own (`health_unreachable`).
- `deploy/provision-n8n.js` provisions both workflows. New values: `SYNC_TOKEN` from
  `backend/.env`; `FMS_HEALTH_URL` (default `http://backend:5000/sync/health`, the compose
  network) and `WATCHDOG_ALERT_URL` (default `http://localhost:5678/webhook/fms-alert`), optional
  in `deploy/.env.n8n`.

**Evidence (18 Oct 2026):**
- `npm test` → `/sync/health needs SYNC_TOKEN, alerts on each problem with a recent heartbeat, and
  stays quiet when the PC is off` ✔ — wrong / missing / longer token → 403; each condition alone
  raises exactly its own key (and 1800 s exactly does not); heartbeat 20 min old with problems →
  `heartbeat_recent: false`, `alerts: []`; 4 min old → alerts again.
- Scratch n8n (`docker.n8n.io/n8nio/n8n` 2.37.10, own data dir, host network on 5681), the
  workflow imported as the provisioner builds it but every **1** minute; a stand-in
  `/sync/health` whose answer was switched every 65 s, and a stand-in alert webhook logging what
  arrived:

  | Step | Health answer | Arrived |
  |---|---|---|
  | 1 | healthy, recent | nothing |
  | 2 | `quarantine` | `⚠️ FMS sync watchdog • 2 change(s) were refused by the online server — open Sync issues on the factory PC` |
  | 3 | same | nothing (no repeat) |
  | 4 | `outbox_backlog` + `quarantine` | one message listing both |
  | 5–6 | PC off (`heartbeat_recent: false`), two runs | **nothing** (negative case) |
  | 7 | back on, healthy | `✅ FMS sync watchdog: the earlier problem has cleared.` |
  | 8 | health replies 500 | `⚠️ … The online server's health check failed (it replied 500)` |

  Every request carried `X-FMS-Secret`. Not observed: the "no reply at all" branch (connection
  refused).
- ⏳ Production: after the deploy, `bash deploy/provision-n8n.sh` → `workflow ready & active: FMS
  Sync Watchdog`; `curl -s -H "X-Sync-Token: …" $API/sync/health` → 200; with the factory live, one
  forced condition (e.g. a refused row) → the real WhatsApp message; factory PC off 20 min → none.

---

### T2.5 — Factory backups + restore drill (D10, D15)

**Status:** CODE DONE, CHECKS FAILING — backup, drill and retention by `npm test`, and the scheduled
+ on-close backups seen in the real Electron app on Linux (19 Oct 2026); the Windows `pg_dump.exe`
has not run yet: the drill on the factory PC (1.0.2 or later) is the gate
**Deps:** T1.10

**Do:**
1. Ship `pg_dump.exe` and `pg_restore.exe` from the matching Postgres 16 Windows build next to the
   embedded binaries (F7).
2. `desktop/scripts/backup.js`: `pg_dump -Fc` every 6 h plus one at shutdown, to a **second drive**
   (not the drive holding `pgdata`). Keep 14 daily and 8 weekly. A Windows scheduled task invokes
   it.
3. Weekly: copy the newest backup to a USB drive kept off-site.
4. **Restore drill:** restore a dump into a scratch instance and compare row counts. **An untested
   backup is an assumption**; run it at least once and record the result.

**Checks:** run the backup, then the drill; record row counts from both sides.

**Gate:** the drill completes with matching counts.

**Built (19 Oct 2026):**
- `desktop/scripts/fetch-tools.js` (`npm run fetch-tools`, part of `npm run dist`): reads
  `pg_dump.exe` and `pg_restore.exe` out of the EDB `postgresql-16.14-1-windows-x64-binaries.zip`
  with HTTP range requests (0.8 MB, not the 325 MB zip), checks each against a pinned SHA-256, into
  `desktop/tools/` (git-ignored; `tools/**` added to `build.files`). Same build as the embedded
  server: both carry `postgresql-packaging-foundation\postgresql-16.14` and report `16.14`. Their
  DLLs (`libpq`, `zlib1`, `liblz4`, `libzstd`, `libintl-9`, `libcrypto-3-x64`) are all in the
  embedded `bin`, so `lib/backup.js` runs them with that folder on `PATH` instead of shipping copies.
- `desktop/lib/backup.js` (plain Node, for `host.js` too):
  - every dump runs inside one `REPEATABLE READ` transaction that counts every table and exports
    its snapshot to `pg_dump --snapshot`, and the counts are saved as `<dump>.counts.json`. The
    drill compares against those, so it matches exactly even while the factory keeps working
    (comparing with the live database, as the VPS drill does, would not);
  - the dump is written as `.partial`, read all the way through (`pg_restore -f <null>`), then
    renamed; a failure leaves nothing. The password goes in `PGPASSWORD`, not on the command line;
  - keeps every dump of the last 24 h + the newest of each of the 14 newest days + the newest of
    each of the 8 newest weeks. **Not "Sundays" like the VPS**: the factory PC is likely off on
    Sundays, which would leave no weekly copies;
  - **drill:** restore into a throwaway `fms_drill_<ms>` database on the same server, count, drop.
- **Schedule: inside FMS, not a Windows scheduled task (deviation from step 2).** The database
  runs only while FMS runs, so a task would find nothing to dump when FMS is closed, and nothing
  changes then. `BackupScheduler`: first check 2 min after start, then every 10 min, backs up when
  the newest dump is ≥ 6 h old; one more when FMS closes (after the backend has stopped, at most
  60 s). Once FMS runs as a service (Phase 3) it is up around the clock anyway.
- Folder: `config.json` → `backupDir`, default `%APPDATA%\FMS\backups`. The status bar is amber
  while it is on the **same drive** as `pgdata` ("choose a folder on another drive") and when the
  last backup failed.
- Factory app: **FMS → Backups**: Back up now · Test the newest backup (restore drill) · Copy the
  newest backup to a USB drive… (D15, weekly) · Choose the backup folder… · Open the backup folder.

**Evidence (19 Oct 2026):**
- `npm test` 29/29, two new:
  - `backup: a dump taken while the factory keeps writing …` — customers inserted in a loop
    during the dump; drill `ok`, same tables and rows as the counts file; the live table has more
    rows than the dump (writes during the dump are not in it); no `fms_drill_*` database left. A
    counts file off by one → `mismatches: [{ table: 'public.customers', expected: n+1, restored: n }]`.
    A dump cut in half → `pg_restore failed`, no drill database left. `pg_dump` missing → `pg_dump
    failed`, backup folder empty. Scheduler: one scheduled + one on stop; status amber "Backups are
    on the same drive …", then "Last backup failed: pg_dump failed …".
  - `backup: keeps the last 24 h, the newest of 14 days and of 8 weeks …` — 120 days × 4 dumps,
    no Sundays: today's 4 kept, one per day back to 3 Oct, Saturdays 26 Sep → 5 Sep; counts files
    follow their dump; an unrelated file is left alone.
  - Sabotage: without `--snapshot` the first test fails (`expected 24, restored 87`). Restored.
- Real app (Electron 44 on Linux under Xvfb, scratch `--user-data-dir`, `npm run stage`):
  `backup OK (scheduled): …/backups/fms_db-2026-10-19_090710.dump (134 KB, 44 tables, 39 rows)` two
  minutes after start; Ctrl+Q → `backup OK (shutdown): …_090912.dump`, then Postgres `database
  system is shut down`.
- ⏳ On the factory PC: FMS → Backups → Back up now, then Test the newest backup → "restores
  correctly" with the row counts (the gate, with the Windows `pg_dump.exe`); choose a folder on a
  second drive; the first weekly USB copy.

---

### T2.6 — UPS + Postgres durability check (ops)

**Status:** NOT STARTED

**Do:** a UPS sized for the main PC, with graceful-shutdown signalling. The durability settings are
already at their safe defaults (F7) — **do not tune them off**.

**Checks:** `psql -c "SHOW fsync; SHOW synchronous_commit; SHOW full_page_writes;"` on the factory
→ all `on`.

**Gate:** output recorded, and who installed the UPS.

**Built (19 Oct 2026):** the factory PC has no `psql`, so FMS now checks for itself:
`checkDurability` (`desktop/lib/database.js`) logs `postgres durability: fsync=on,
full_page_writes=on, synchronous_commit=on` to `fms.log` at every start, and any that is off makes
the status bar **red** ("The database is set up unsafely (… off): a power cut can lose saved data").
The check above is then: that line from `%APPDATA%\FMS\logs\fms.log`.

**Evidence (19 Oct 2026):**
- `npm test` 30/30 — `durability: …` ✔: the log line with all three `on`; `ALTER SYSTEM SET fsync =
  off` + reload → `['fsync']` and status red with that message; reset afterwards.
- Real app on Linux (Xvfb): `postgres durability: fsync=on, full_page_writes=on,
  synchronous_commit=on`.
- ⏳ Ops: the UPS (sized for the main PC + monitor + router, with its USB cable so Windows shuts down
  on low battery: Power Options → Battery → critical action **Shut down**); who installed it; the
  same log line from the factory PC.

---

### T2.7 — Non-negative stock

**Status:** CODE DONE, CHECKS FAILING — checks 1–4 observed on a throwaway database; deployed to the
VPS and check 2 observed there (17 Oct 2026); on the factory it ships with installer 1.0.2
**Deps:** T1.3 (so a violating row is quarantined instead of stalling sync)

**Do — first fix the three paths that can push stock negative (F8):**
1. **Cancelling a completed production order** whose stock was already sold: refuse with a clear
   message instead of subtracting below zero (`ProductionController.js` ~252).
2. **Editing a stock item:** reject a negative quantity with a 400 (`StockController.updateStock`).
3. **A sale listing the same stock item twice:** add up the quantities per stock item before the
   `FOR UPDATE` check, keeping the `FOR UPDATE` + `needsProduction` branch (rule 7).

**Then migration 027 (numbered before T2.1's table, which ships later):**

```sql
-- 1. audit (on 12 Oct 2026 the VPS had 0 rows)
SELECT id, quantity FROM stock WHERE quantity < 0;

-- 2. add without validating
ALTER TABLE stock ADD CONSTRAINT stock_quantity_nonneg CHECK (quantity >= 0) NOT VALID;

-- 3. once the audit is clean:
ALTER TABLE stock VALIDATE CONSTRAINT stock_quantity_nonneg;
```

Deploy the VPS migration first, then the factory app.

**Checks:**
1. Each of the three paths now gives a clear message, not a 500.
2. `psql -c "INSERT INTO stock (name,unit_price,quantity) VALUES ('neg probe',0,-1)"` → rejected
   with `23514`.
3. A change carrying `quantity = -1` pushed through `/sync/ingest` → 200 with a rejection, one
   `sync_rejected` row with `code = 23514`, and the batch's other changes applied.
4. The factory status does not show "Problem" for the batch.

**Gate:** all four observed.

**Built (17 Oct 2026):**
- `ProductionController.updateStatus`: cancelling a completed order locks the stock row and, if
  less than `required_quantity` is left, rolls back with `409 Can't cancel: this order added N to
  stock, but only M are left — the rest has already been sold.` `ProductionList.jsx` now shows the
  server's message (it only logged errors before).
- `StockController.updateStock` and `addStock`: a negative quantity → `400 Quantity cannot be
  negative`.
- `SalesController.createSale`: tracks the stock left per `stock_id` across the sale's lines; a
  line that no longer fits goes to production. `FOR UPDATE` + `needsProduction` kept (rule 7).
- Migration **027** (`027-stock-quantity-nonneg.js`, not 028: node-pg-migrate refuses a lower
  number after a higher one has run, and T2.1's table ships later, so T2.1 takes 028). Adds
  `stock_quantity_nonneg` `NOT VALID`, then validates it only if no row is negative, else a
  `WARNING` with the count. Idempotent.
- Not changed: a purchase line with a negative quantity is not validated (none of F8's paths);
  if it would take stock below zero it now fails on the constraint (500) instead of saving.

**Evidence** — real controllers on a throwaway embedded Postgres with every migration (harness:
fake req/res, as T1.0):
- Migration: `stock_quantity_nonneg`, `convalidated: true`.
- Check 1 ✅ — stock edit to `-1` → `400 {"error":"Quantity cannot be negative"}`, stock still 5;
  add stock with `-3` → same 400. Sale with the same item twice (3 + 3, 5 in stock) → `201`,
  sale `pending`, stock 2 (first line from stock, second to production). Completed order (+10, stock
  2 → 12), stock then set to 4, cancel → `409 Can't cancel: this order added 10 to stock, but only
  4 are left — the rest has already been sold.`, stock still 4, order still `completed`; with
  12 in stock the cancel → `200`, stock 2.
- Check 2 ✅ — `INSERT INTO stock (name,unit_price,quantity) VALUES ('neg probe',0,-1)` → `23514
  new row for relation "stock" violates check constraint "stock_quantity_nonneg"`.
- Checks 3–4 ✅ — `npm test` (`tests 20 / pass 20`), new test "negative stock is refused locally
  (23514) and a negative change from sync is set aside": ingest → 200, `rejected` =
  `[[id, '23514', 'stock_quantity_nonneg']]`, one `sync_rejected` row `stock | I | 23514`, the
  customer in the same batch applied; through the real `SyncWorker` the round ends `state: ok`,
  0 pending.
- **On the VPS (17 Oct 2026)**, deploy of `0b8e5c6` (Action run 39045334969, success). Before:
  `SELECT count(*) FROM stock WHERE quantity < 0` → `0`. Backend log: `> - 027-stock-quantity-nonneg`,
  `Migrations complete!`, `✅ Cron jobs started`. `pgmigrations` newest → `027-stock-quantity-nonneg`;
  `pg_constraint` → `stock_quantity_nonneg | t` (validated). Check 2 inside `BEGIN … ROLLBACK` →
  `ERROR: new row for relation "stock" violates check constraint "stock_quantity_nonneg"`.
- ⏳ On the factory install (1.0.2): checks 1 and 4 in the real app (a sale listing one item twice;
  cancelling a completed order whose stock was sold → the message shows).

---

### T2.8 — Rebuild the online server from the factory (D17)

**Status:** CODE DONE, CHECKS FAILING — checks 1–5 by `npm test` against the real controllers and
SyncWorker (18 Oct 2026); the menu + window in the real app need a run of the app (Windows, or
Electron under Xvfb)
**Deps:** T1.1, T1.3

**Problem:** if the online server is lost, or restored from an older backup, its copy is missing
data, and normal sync only sends new changes — nothing fills the gap. The factory still has
everything.

**Do:**
1. **`backend/scripts/create-setup-code.js`** (runs inside the backend container, which has
   database access): creates a setup code with the same rules as T1.1 (stored as a hash, valid
   1 hour, single use) and prints it once. Needed because a fresh server has no users, so nobody
   can log in to Offline Setup. Run:
   `sg docker -c "docker compose exec backend node scripts/create-setup-code.js"`.
2. **Factory app, Owner action "Re-register and resend everything":**
   - enter the setup code → `/sync/register` with the PC's existing `writer_id`; store the new
     upload key. **No snapshot is downloaded; the factory keeps its own data.**
   - in one local transaction, queue every row of every captured business table into
     `sync_outbox` as `U` (`INSERT INTO sync_outbox (table_name, op, row_data) SELECT '<table>', 'U',
     to_jsonb(t) FROM <table> t`); the normal sync worker uploads them in batches. Ingest is an
     upsert, so running it twice does no harm.
   - once the outbox is empty, **prune:** for each table, send its list of primary keys to
     `POST /sync/prune` (upload-key protected); the server deletes rows the factory no longer has.
     This removes rows deleted at the factory after an old backup was taken.
3. Server-only tables (§4) are never resent or pruned.

**Checks:**
1. Scratch server with an empty database (migrations only) → create a code with the script →
   factory re-registers and resends → every table's row count matches on both sides.
2. Scratch server restored from an older dump → resend → newer rows appear, and rows deleted at the
   factory since that dump are gone.
3. Run it a second time → the same counts (no duplicates).
4. Factory row counts are the same before and after (nothing changed locally).
5. The T1.0 check "resend everything leaves both sides identical" passes.

**Gate:** checks 1–5 observed.

**Built (18 Oct 2026):**
- Step 1 already existed as `backend/scripts/createSetupCode.js` (T1.1), same rules; the command
  is `sg docker -c "docker compose exec backend node scripts/createSetupCode.js"`.
- `POST /sync/prune` (`SyncController.prune`, upload key, after `requireSyncWriter`): body
  `{ table_name, keys: [{ id: 7 }, …] }`; checks the key again under the `sync_writer` row lock
  like ingest, refuses `PROTECTED_TABLES` / `VPS_ONLY_TABLES` / unknown tables and keys without
  the primary key (409), then in replica mode `DELETE … WHERE NOT EXISTS (key in the list)`.
- `desktop/lib/rebuild.js` (plain Node, ready for `host.js`): `queueEverything` (one REPEATABLE
  READ transaction, every table that has the `fms_sync_capture` trigger, so exactly what sync
  carries) → the normal `SyncWorker` uploads → `pruneServer` (keys from one consistent snapshot,
  one request per table) → `resendAndPrune` runs the three and reports progress.
- **Race found while building it:** a row added at the factory and uploaded *between* reading the
  keys and the server's delete would be deleted there and never sent again. So the worker is
  **paused** while pruning (`SyncWorker.pause()` / `resume()`); new changes just wait in the
  outbox and go up after the prune.
- Factory app: menu **FMS → Rebuild the online server…** (the menu bar shows with Alt) opens
  `setup/rebuild.html`: setup code + server address → `registerWriter` with the **existing**
  `writerId`, new key saved to `config.json`, no snapshot; `startUploads()` (split out of `boot()`)
  restarts the worker and the heartbeat with the new key; then `resendAndPrune` with progress in
  the window; the window can't be closed while it runs.

**Evidence (18 Oct 2026):** `npm test` (harness: factory `fms_db` + server `vps_db`, real
`SyncController` / `requireSyncWriter` / `SyncWorker` / `registerWriter`):
- Checks 1, 3, 4, 5 ✅ — `rebuild: an empty new server gets every row; a second run changes
  nothing; the factory is untouched`: the server's synced tables truncated and `sync_writer`
  reset (a new server, migrations only); the factory's old key → `blocked_not_writer`; a code from
  `createSetupCode` + re-register with the same `writer_id` → every synced table identical row
  for row on both sides (users included, so the Owner can log in online again); factory rows
  unchanged; outbox empty; the server's `customers` sequence moved past the resent ids; a
  second run → identical again, 0 pruned.
- Check 2 ✅ — `rebuild: a server restored from an older backup gets the newer rows, and loses
  rows deleted since`: server back to Ali/Bilal/Chand while the factory has Ali Khan/Chand/Dawood
  → after the rebuild the server has Ali Khan, Chand, Dawood; `deleted.customers = 1` (Bilal).
- `prune: only the registered PC, never a server-only table; uploads wait while the worker is
  paused`: wrong key → 403; `sync_writer`, `pgmigrations` → 409; key without `id` → 409; no
  `keys` → 400; a row written while paused is not uploaded within 3 s, and is uploaded after
  `resume()`.
- Window: `setup/rebuild.html` rendered in headless Chrome with a stand-in bridge (code entered,
  progress, done line).
- ⏳ The menu item and window in the real app; a drill against a scratch server restored from a
  real `pg_dump`.

**Phase 2 exit:** a scheduled report arrives with the factory off, labelled with data age, exactly
once; the watchdog alerts on real problems and stays quiet when the PC is off; the factory backup
drill is done; stock can't go negative; the online server can be rebuilt from the factory.

---

## 9. Phase 3 — extra factory PCs (D8)

*Largest, riskiest phase. T1.5 must be `DONE` first: the service removes the window title.*

### T3.1 — `desktop/host.js` entry point (D1, D4)

**Status:** CODE DONE, CHECKS FAILING — both checks observed on Linux with `node host.js` against a
scratch server (19 Oct 2026); not yet on Windows with `tools\node.exe`. Phase 3 also waits for
T1.5 to be `DONE` (see the phase note).
**Deps:** T1.5

**Do:** a new entry point with **no Electron dependency**, reusing the Electron-free modules
`lib/database.js`, `lib/syncCapture.js`, `lib/sync.js`, `lib/alertRelay.js`, `lib/ports.js`. Move
the content of `main.js` `boot()`: Postgres start, schema, capture install, relay start, backend
fork, sync worker start.

- **Data directory (D1):** from `FMS_DATA_DIR`, default `%PROGRAMDATA%\FMS`. Document the move
  before writing code: copy `%APPDATA%\FMS`, verify, then switch. Moving `pgdata` incorrectly is
  the most likely way to lose data in this plan.
- **Updates (D4):** `electron-updater` no longer applies; write and document the scripted update
  path.

**Checks:**
1. `host.js` starts the full stack from a **clean** data dir; a sale created through it reaches
   the VPS.
2. Copy the existing `%APPDATA%\FMS` to `FMS_DATA_DIR` and start from the copy: the data is all
   there, and the **original directory is byte-identical afterwards** (file count + checksum of
   `pgdata` before/after).

**Gate:** both observed, including the unchanged-source check.

**Built (19 Oct 2026):**
- `desktop/lib/runtime.js` — `FactoryRuntime`: everything `main.js` `boot()` did without Electron
  (config, setup name/branding, Postgres, durability check, schema, capture, `ensureOwner`,
  backups, relay, backend, uploads + heartbeat, rebuild) and the shutdown order. **`main.js` now
  uses it too**, so the app and the service run one code path; `main.js` keeps the window, setup
  screen, rebuild window, menu, updater and dialogs. The backend is forked by whoever runs it
  (`utilityProcess` in the app, `child_process.fork` in the service).
- **Shutdown order, both:** backend first (no new business writes), then the final upload (10 s app,
  45 s service), then the closing backup, relay, `pg_ctl stop`. Before, the app uploaded before
  stopping the backend, so a save in those seconds waited for the next start.
- `desktop/host.js` (packed: `host.js` added to `build.files`), run with `tools\node.exe` (now in
  `scripts/fetch-tools.js`: Node v24.21.0, hash = nodejs.org `SHASUMS256.txt`). Commands: run
  (default) · `setup --code <c> [--server <url>]` / `setup --empty` · `copy-data --from <dir>` ·
  `rebuild --code <c>` · `backup` · `drill`. `FMS_DATA_DIR`, default `%PROGRAMDATA%\FMS` (D1);
  `FMS_BIND_HOST`, default `127.0.0.1` (T3.3 opens it). A data dir that isn't set up refuses to
  start and says which command to run.
- **Two Windows traps found while building it:**
  1. NSSM stops a service with Ctrl+C on its console, and Postgres on Windows takes Ctrl+C as
     *fast shutdown* — it would be gone before the drain. In the service Postgres is started
     **detached** (`database.js` `startDetached`: no console, own process group) and only `pg_ctl
     stop` ends it, last.
  2. `embedded-postgres` installs `async-exit-hook`, which answers SIGINT/SIGTERM/SIGHUP/SIGBREAK
     with "stop Postgres, `process.exit(130)`" — observed: the host died one line after "stopping".
     In the service those hooks are removed (the `exit` hook stays). The app is unchanged.
- Postgres now always starts with `-c listen_addresses=127.0.0.1` (was the `localhost` default),
  ahead of T3.3.
- **D1, the move (`desktop/README.md` → Running as a service):** `host.js copy-data
  --from <%APPDATA%\FMS>` refuses a non-empty target and an open database (`postmaster.pid`),
  checksums every file of the source, copies to `<target>.partial` (folder modes included),
  checksums the copy, checksums the source again, and only if all three match renames it into place
  and writes `copied-from.json`. The source is only read. The switch is installing the service on
  the copy (T3.2); the original stays until the service has run a while.
- **D4, updates:** `desktop/service/update-service.ps1` (T3.2).

**Evidence (19 Oct 2026, Linux; scratch "VPS" = Postgres on 55441 + the real `backend/server.js`
on 5057 with `SYNC_TOKEN` and `READ_ONLY_MODE=true`, an Owner and 2 customers):**
- Check 1 ✅ (Linux) — clean `FMS_DATA_DIR`: `host.js setup --code TWTC-PKPN --server …` →
  `registered as main PC 1cc1154d-…`, `snapshot: imported 9 rows from 32 tables`, Postgres
  `listening on IPv4 address "127.0.0.1", port 48621`, `postgres stopped cleanly`. `node host.js` →
  `host: ready`; `POST /auth/login` (owner) → token; `POST /api/sales` → `201`; 6 s later on the
  server: `1 | SALE-1792394300182-9c16c5 | 300.00`.
- Drain — a sale (`201`), then SIGINT to the whole process group at once, as the service's Ctrl+C
  reaches every process on the console: `host: SIGINT, stopping (final upload up to 45 s)` →
  `sync: pushed 5 change(s)` → `backup OK (shutdown)` → `postgres stopped cleanly` → `host:
  stopped`, exit 0; the server has `300.00, 50.00, 70.00`. (Before the two fixes: exit 130 right
  after "stopping", the last sale left in the outbox, Postgres still running.)
- Check 2 ✅ (Linux) — the Electron test profile (closed) as `%APPDATA%\FMS`: `copy-data` → `1560
  files; pgdata: 1494 files, sha256 adae7625…`, `copied and verified`. Independent check
  (`find | sort | sha256sum`): source `1cf44c89… 1494` before, after the copy, and after starting
  and stopping `host.js` on the copy; copy `1cf44c89… 1494`. Started from the copy: `host: ready`,
  `users = owner`, 28 migrations; `host: stopped`, exit 0. (First try: Postgres refused the copy,
  `data directory … has invalid permissions` — `cpSync` doesn't copy folder modes. Fixed.)
- The app after the refactor (Electron 44, Linux, Xvfb): boots (`postgres durability: …`, title
  `FMS — Upload to server not set up`, `/auth/me` → 401), Ctrl+Q → `backup OK (shutdown)` →
  Postgres `shutting down`.
- `npm test` 30/30 three runs in a row; one earlier run failed only the timing test "a write is
  uploaded within ~3 s" (3.5 s budget) while the machine was busy.
- ⏳ Windows: the same two checks with `tools\node.exe host.js` (and that `pg_ctl stop` ends the
  detached Postgres there); a sale reaching the real VPS.

---

### T3.2 — Service install + dedicated user + shutdown drain (D14)

**Status:** CODE DONE, CHECKS FAILING — scripts written, parse-checked and linted; the drain and the
app's service mode observed on Linux (19 Oct 2026). Checks 1–4 need Windows (NSSM, a reboot with
nobody logged in, ACLs)
**Deps:** T3.1

**Do:**
1. Register `host.js` with **NSSM**, start type Automatic, running as a **dedicated low-privilege
   Windows user**. Postgres refuses to start under an administrative account (LocalSystem counts).
   That user needs write access to the data directory only.
2. **Shutdown drain:** on service stop, stop accepting new business writes, then flush the outbox
   until empty or **45 s**, whichever is first. Set NSSM's `AppStopTimeout` to allow it.

**Checks:**
1. Reboot with nobody logged in → the service starts, Postgres accepts connections, the dashboard
   answers on 48620.
2. The Postgres log shows **no** administrative-account refusal.
3. `pgdata` is owned by the service user.
4. Network up: create a sale, stop the service → the row is on the VPS.

**Gate:** all four observed.

**Built (19 Oct 2026)** — `desktop/service/` (packed: `service/**` in `build.files`), ASCII-only so
Windows PowerShell 5.1 reads them right:
- `install-service.ps1` (as Administrator, FMS app closed): finds `nssm.exe` (`-Nssm`, next to the
  script, or PATH; NSSM isn't shipped — nssm.cc answered 503 when this was built, so there is no
  pinned download) → stops an earlier install and **waits** until it has stopped → copies
  `resources\app` to `C:\Program Files\FMS Service\app-<version>` (through `.partial`; the
  per-user install folder is in the admin's profile, unreadable for the service user, and the
  app's updater would replace files under it) → local user `fms-service`, random password given
  only to NSSM, refused if it is in Administrators → data: `host.js copy-data --from
  %APPDATA%\FMS` if `C:\ProgramData\FMS` is empty (D1), else uses what is there → `icacls`:
  inheritance off, SYSTEM + Administrators full, `fms-service` modify, owner `fms-service` (check
  3) → NSSM: `tools\node.exe "<app>\host.js"`, `FMS_DATA_DIR`, start Automatic, `ObjectName
  .\fms-service`, stop = console Ctrl+C with **75 s** (`AppStopMethodConsole`, NSSM's name for the
  plan's "AppStopTimeout": 45 s upload + backup + Postgres), then the process tree is ended;
  restart on exit (10 s delay); stdout/stderr to `logs\service.log`, rotated at 10 MB;
  `PreshutdownTimeout` 90 s → start → wait for the dashboard on `127.0.0.1:48620` (check 1) → no
  "administrative permissions" line in `fms.log` (check 2) → `C:\ProgramData\FMS-service.json` +
  `MOVED-TO-SERVICE.txt` in the old folder.
- `update-service.ps1` (D4): `-Installer FMS-Setup-x.exe` runs it with `/S` for the user and takes
  its folder from the Uninstall registry key → copies it to `app-<new>` next to the running version
  → stop (drain) → point NSSM at it → start → wait; if it doesn't answer within 2 min: back to the
  old version, started, and reported as failed. Keeps the previous version folder.
- `remove-service.ps1`: stop (drain), `nssm remove`, marker removed; data and program kept.
- `main.js`: with `FMS-service.json` present the app is only a window on the service's dashboard
  (no Postgres, no backend, no updater); with `MOVED-TO-SERVICE.txt` in its folder it refuses to
  start, so the out-of-date copy can never run or upload again (its `config.json` still holds the
  upload key).
- **Drain (step 2):** T3.1's `runtime.stop()` — backend stopped first ("stop accepting new business
  writes"), then `finalUpload(45 s)`, closing backup, `pg_ctl stop`. Postgres detached + the
  exit-hooks fix (T3.1) are what make NSSM's Ctrl+C reach `host.js` without killing the database.
- **Known limit:** at a normal Windows shutdown services get only a few seconds unless they take
  pre-shutdown; whether NSSM 2.24 does is unverified. If not, the upload/backup can be cut short at
  shutdown — the data is safe (Postgres recovery, the outbox), and both happen at the next start.

**Evidence (19 Oct 2026):**
- `pwsh` 7.6.7 (Linux): all four scripts parse; `Invoke-ScriptAnalyzer` → 0 errors/warnings (after
  removing the non-ASCII characters it flagged).
- Drain, Linux: see T3.1 (sale → Ctrl+C to the process group → `sync: pushed 5 change(s)`, `backup
  OK (shutdown)`, `postgres stopped cleanly`, exit 0).
- The app's service mode (Electron 44, Linux, Xvfb), with `host.js` running as the stand-in service
  and a marker file: window title `FMS`, the log only `service mode: FMS runs as the Windows service
  "FMS" …`, no `pgdata`, no Postgres/backend lines; closed with Ctrl+Q → the service still answers
  `200`. A profile with `MOVED-TO-SERVICE.txt` → `startup failed: Error: The FMS data on this PC was
  moved …`, no `pgdata` created.
- ⏳ Windows: checks 1–4 (reboot with nobody logged in → dashboard on 48620; no admin refusal in the
  log; `(Get-Acl C:\ProgramData\FMS\pgdata).Owner` = `…\fms-service`; a sale, `Stop-Service FMS`
  → the sale on the VPS), and one `update-service.ps1` run.

---

### T3.3 — LAN bind + firewall + hostname

**Status:** NOT STARTED
**Deps:** T3.2

**Do:**
1. The backend listens on the LAN interface on 48620 (today `HOST: '127.0.0.1'`, F9).
2. Postgres stays `127.0.0.1:48621`. **Never expose it.**
3. Firewall: inbound TCP 48620, Private profile, local subnet only.
4. A static IP / DHCP reservation plus the hostname `fms-host`.
5. `FRONTEND_URL` on the factory PC includes the LAN origin for CORS.

**Checks (from a second factory PC):**
1. The dashboard loads at `http://fms-host:48620`; login works and a save succeeds.
2. The WebSocket connects (`/ws` validates only the JWT query param).
3. Port 48621 is **refused** (`Test-NetConnection fms-host -Port 48621`).

**Gate:** all three observed.

---

### T3.4 — Frontend relative API base + variant (D13)

**Status:** NOT STARTED
**Deps:** T3.3

**Do:**
1. `desktop/scripts/stage.js`: set `VITE_API_URL=/api` instead of `http://127.0.0.1:48620/api`.
2. `frontend/src/config.js`: if `VITE_SITE_VARIANT` is set, use it; `stage.js` sets
   `VITE_SITE_VARIANT=app`. Comment why: a LAN hostname or IP otherwise falls to `'all'` and serves
   the marketing routes (F11).
3. Confirm `AUTH_BASE_URL` still resolves with a relative base (`/api` → `''`).

**Checks (from a second factory PC):**
1. `/` and `/login` resolve correctly; no marketing route is served, by name or by IP.
2. `/auth/login` succeeds and an authenticated `/api/*` call returns data.

**Gate:** both observed.

---

### T3.5 — Concurrency audit + fixes

**Status:** NOT STARTED
**Deps:** T3.3

**Already safe — verify, do not change:**
- sale stock decrement — `SalesController.js`, `FOR UPDATE`
- invoice allocation — `InvoiceController.js`, `FOR UPDATE`
- raw-material consumption — `RawMaterialConsumptionController.js`, `FOR UPDATE`
- gate pass — `nextval` inside the transaction

**Known unsafe — fix:** `StockController.updateStock` does a bare read-modify-write with no
transaction and no lock, and the pre-read feeding `alertIfNewlyLow` can be stale. Two terminals
editing one item: last save wins silently.

**Audit the same pattern in:** purchases, production, stock adjustments, cashbook, and every
ledger/balance update. Where the check is arithmetic, use:

```sql
UPDATE stock SET quantity = quantity - $1
 WHERE id = $2 AND quantity >= $1
 RETURNING quantity;   -- zero rows = insufficient
```

**Do not** apply this to `createSale` (rule 7).

**Add** an `updated_at` precondition on edit endpoints for key records (customers, products,
prices), so a concurrent edit returns "changed by someone else" instead of last-save-wins.

**Checks (two terminals, both logged in):**
1. Before the fix: reproduce check 3 as a silent overwrite (baseline).
2. Sell the last 5 units from both terminals at once → exactly 5 sold, stock never negative.
3. Open the same stock item in both terminals, change it in each, save both → the second gets a
   conflict error; the stored value matches the first save.

**Gate:** checks 1–3 observed, with check 1's baseline recorded.

**Phase 3 exit:** the service survives a reboot with nobody logged in; extra factory PCs work over
the factory network (`http://fms-host:48620`); the database port is unreachable from them; the
concurrent-edit conflict is reproduced and fixed.

---

## 10. Do NOT change these

They look like bugs and are deliberate. Changing them is a regression.

- **The two sequence-reset styles.** `SyncController.ingest` uses `setval(seq, max, true)`;
  `snapshot.js` uses `setval(seq, max + 1, false)`. Same next value.
- **`session_replication_role = replica` skipping FK checks and triggers** on ingest and snapshot
  import. The factory already enforced them; re-applying causes ordering failures and double
  cascades.
- **409 `SchemaMismatch` blocking a batch.** That is how a mirror behind on migrations is
  protected.
- **`READ_ONLY_MODE` blocking VPS writes** (only the Offline Setup routes are let through, T1.2).
- **The digest sending twice (7:30 and 10:00).** Deliberate, to survive Meta's 24 h free-text
  window.
- **`SalesController.createSale`'s `FOR UPDATE` + `needsProduction` branch.**
- **`routes/purchase.js` double-mounted** at `/api/purchase` and `/api/purchases`.
- **Sales/Purchase module parallelism.** A fix on one side usually needs the mirror on the other.
- **The commented-out block at the top of `frontend/src/App.jsx`.** Ask before removing.
- **`README.md` is a 3-line stub.** Product documentation lives in `desktop/README.md` and
  `CLAUDE.md`.
