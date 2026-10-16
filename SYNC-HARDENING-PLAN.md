# FMS Sync Hardening — Final Plan (agent-executable)

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
| `report_dispatch_log` | VPS | migration 027 (T2.1) | ✅ | ✅ | ✅ |
| `whatsapp_dead` | factory | `alertRelay.js` (T1.6) | — | — | ✅ |
| `sync_quarantine` | factory | `syncCapture.js` (T1.4) | — | — | ✅ |

Migration 028 (T2.7) adds a constraint, not a table. VPS tables exist empty on the factory too
(F3); that is expected.

Current values: `PROTECTED_TABLES = new Set(['pgmigrations'])`;
`EXCLUDED_TABLES = ['pgmigrations','sync_outbox','sync_state','whatsapp_outbox']`;
`VPS_ONLY_TABLES` does not exist yet.

---

## 5. Progress ledger

| ID | Task | Deps | Status | Notes / evidence |
|---|---|---|---|---|
| T0.1 | Read-only mode off until go-live | — | NOT STARTED | ops |
| T0.2 | VPS nightly backup + restore drill | — | CODE DONE, CHECKS FAILING | script tested on a throwaway DB; production run + crontab not yet done |
| T0.3 | Cleanup bundle | — | CODE DONE, CHECKS FAILING | check 2 ✅ (local); check 1 needs the deploy |
| T1.0 | Automated sync checks | — | DONE | 4/4 pass; sabotage check fails as expected (16 Oct 2026) |
| T1.1 | One-PC lock + one-time setup code | T1.0 | CODE DONE, CHECKS FAILING | 8/8 `npm test` (4 new); observed checks need deploy + a factory install |
| T1.2 | Offline Setup page, form, read-only exception | T1.1 | CODE DONE, CHECKS FAILING | checks 1–5 seen on a local harness + headless Chrome; VPS deploy + check 6 (Windows install) pending |
| T1.3 | Bad-row quarantine — server | — | CODE DONE, CHECKS FAILING | 11/11 `npm test`; checks 1–5 seen on a local harness; VPS deploy pending |
| T1.4 | Bad-row quarantine — factory + retry | T1.3 | NOT STARTED | |
| T1.5 | Sync status on both versions + heartbeat | T1.1, T1.4, T1.6 | NOT STARTED | |
| T1.6 | WhatsApp relay state + `whatsapp_dead` | — | NOT STARTED | |
| T1.7 | Config `reason` + startup warning | T1.6 | NOT STARTED | |
| T1.8 | Test WhatsApp button + honest report button | T1.6, T1.7 | NOT STARTED | |
| T1.9 | Faster upload + final upload on quit | T1.4 | NOT STARTED | |
| T1.10 | Release 1.0.2 + first factory install | T0.2, T1.0–T1.9 | NOT STARTED | go-live |
| T2.1 | VPS send-only report scheduler | T1.10 | NOT STARTED | |
| T2.2 | Factory `DISABLE_CRON` | T2.1 | NOT STARTED | |
| T2.3 | Report freshness label + history view | T2.1, T1.5 | NOT STARTED | |
| T2.4 | Health endpoint + n8n watchdog | T1.5 | NOT STARTED | |
| T2.5 | Factory backups + restore drill | T1.10 | NOT STARTED | |
| T2.6 | UPS + Postgres durability check | — | NOT STARTED | ops |
| T2.7 | Non-negative stock | T1.3 | NOT STARTED | |
| T2.8 | Rebuild the online server from the factory | T1.1, T1.3 | NOT STARTED | |
| T3.1 | `desktop/host.js` entry point | T1.5 | NOT STARTED | |
| T3.2 | Service install + dedicated user + drain | T3.1 | NOT STARTED | |
| T3.3 | LAN bind + firewall + hostname | T3.2 | NOT STARTED | |
| T3.4 | Frontend relative API base + variant | T3.3 | NOT STARTED | |
| T3.5 | Concurrency audit + fixes | T3.3 | NOT STARTED | |

---

## 6. Phase 0 — now (server only, no installer)

### T0.1 — Read-only mode off until go-live (D5)

**Status:** NOT STARTED

**Do:** on the VPS, set `READ_ONLY_MODE=false` in `~/fms/backend/.env`, then
`sg docker -c "docker compose up -d backend"`. Effects: data can be entered on the dashboard
again, VPS cron jobs run again, and `GET /sync/snapshot` is refused (409), so no PC can set
itself up as a writer. T1.10 switches it back on.

**Checks:**
1. Backend log shows `✅ Cron jobs started`, not `🔒 READ_ONLY_MODE`.
2. A save on the dashboard succeeds.
3. `curl -i -H "X-Sync-Token: $SYNC_TOKEN" https://api.ittefaqbuilder.com/sync/snapshot` → `409`.

**Gate:** all three observed.

---

### T0.2 — VPS nightly backup + restore drill

**Status:** CODE DONE, CHECKS FAILING — checks 1, 2, 4 unverified on production: running the
script against the live `fms_db` and adding the crontab line need the owner's go-ahead

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
- ⏳ Production: `bash deploy/backup-db.sh`, `bash deploy/backup-db.sh --drill`,
  add `30 2 * * * bash ~/fms/deploy/backup-db.sh` to `crontab -e`, first weekly `scp` to the
  owner's PC.

---

### T0.3 — Cleanup bundle

**Status:** CODE DONE, CHECKS FAILING — check 1 unverified: needs this branch merged and deployed to the VPS

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
- Check 1 ⏳ — route removed in code; `curl -i https://api.ittefaqbuilder.com/testautodeployment` →
  404 still to be observed after deploy.

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
- ⏳ On the VPS after deploy: checks 1–5 with `curl -i` + `psql` (code from
  `scripts/createSetupCode.js`). ⏳ On a factory install: check 6's window title.

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

**Status:** CODE DONE, CHECKS FAILING — checks 1–5 observed with `curl` + `psql` against the real
`/sync` routes on a throwaway database and by `npm test`; not yet on the VPS (needs deploy).
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
- ⏳ The same on the VPS after deploy.

---

### T1.4 — Bad-row quarantine — factory + retry (D11)

**Status:** NOT STARTED
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

---

### T1.5 — Sync status on both versions + heartbeat

**Status:** NOT STARTED
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

---

### T1.6 — WhatsApp relay state + `whatsapp_dead`

**Status:** NOT STARTED

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

---

### T1.7 — Config `reason` + startup warning

**Status:** NOT STARTED
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

---

### T1.8 — Test WhatsApp button + honest report button

**Status:** NOT STARTED
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

---

### T1.9 — Faster upload + final upload on quit

**Status:** NOT STARTED
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

**Status:** NOT STARTED
**Deps:** T1.10

**Problem (F12):** reports and digests go out only if the factory PC is on at that minute.

**Migration 027 (VPS table, register per §4):**

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

---

### T2.2 — Factory `DISABLE_CRON`

**Status:** NOT STARTED
**Deps:** T2.1

**Do:** gate `startCronJobs()` in `server.js` behind `DISABLE_CRON=true`, and set it in the
factory app's backend environment (`desktop/main.js`, release 1.0.3, after `npm test` passes,
rule 10), so exactly one scheduler exists. Ship this **after** T2.1 is deployed and verified, or reports stop in the gap.

**Checks:** with `DISABLE_CRON=true` the factory log shows no cron start; across one full
scheduled window exactly **one** message arrives.

**Gate:** one delivery observed, and the factory log shows cron did not start.

---

### T2.3 — Report freshness label + history view (D2, D9)

**Status:** NOT STARTED
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

---

### T2.4 — Health endpoint + n8n watchdog

**Status:** NOT STARTED
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

---

### T2.5 — Factory backups + restore drill (D10, D15)

**Status:** NOT STARTED
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

---

### T2.6 — UPS + Postgres durability check (ops)

**Status:** NOT STARTED

**Do:** a UPS sized for the main PC, with graceful-shutdown signalling. The durability settings are
already at their safe defaults (F7) — **do not tune them off**.

**Checks:** `psql -c "SHOW fsync; SHOW synchronous_commit; SHOW full_page_writes;"` on the factory
→ all `on`.

**Gate:** output recorded, and who installed the UPS.

---

### T2.7 — Non-negative stock

**Status:** NOT STARTED
**Deps:** T1.3 (so a violating row is quarantined instead of stalling sync)

**Do — first fix the three paths that can push stock negative (F8):**
1. **Cancelling a completed production order** whose stock was already sold: refuse with a clear
   message instead of subtracting below zero (`ProductionController.js` ~252).
2. **Editing a stock item:** reject a negative quantity with a 400 (`StockController.updateStock`).
3. **A sale listing the same stock item twice:** add up the quantities per stock item before the
   `FOR UPDATE` check, keeping the `FOR UPDATE` + `needsProduction` branch (rule 7).

**Then migration 028:**

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

---

### T2.8 — Rebuild the online server from the factory (D17)

**Status:** NOT STARTED
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

**Phase 2 exit:** a scheduled report arrives with the factory off, labelled with data age, exactly
once; the watchdog alerts on real problems and stays quiet when the PC is off; the factory backup
drill is done; stock can't go negative; the online server can be rebuilt from the factory.

---

## 9. Phase 3 — extra factory PCs (D8)

*Largest, riskiest phase. T1.5 must be `DONE` first: the service removes the window title.*

### T3.1 — `desktop/host.js` entry point (D1, D4)

**Status:** NOT STARTED
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

---

### T3.2 — Service install + dedicated user + shutdown drain (D14)

**Status:** NOT STARTED
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
