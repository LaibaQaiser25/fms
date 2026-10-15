# FMS Sync Hardening — Implementation Plan (agent-executable)


---

## 0. How to work this plan

### 0.1 Status markers

Put exactly one marker on each task's `Status:` line, and mirror it in the §1 ledger.

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
2. **Every new table must be registered in all four places** (§3.1). Missing one is a bug, and
   C2 explains why skipping the snapshot list breaks bootstrap outright.
3. **Do not add test files or a test framework to this repo.** There is no test suite and this
   plan does not create one. Verification is by observation (§0.3).
4. **Do not add `test/`-like directories, and do not change `desktop/scripts/stage.js`'s `SKIP`
   set** — no new files should need staging.
5. **Never "fix" the intentional behaviours listed in §11.** They look like bugs and are not.
6. New frontend API files must import the shared axios instance from `./http`, not `axios`.
7. Do not rewrite `SalesController.createSale`'s stock logic into a conditional `UPDATE`
   (see P4-5) — the `FOR UPDATE` + `needsProduction` branch is deliberate.
8. Keep every commit scoped to one task ID.

### 0.3 How to verify (no test suite)

`backend/package.json` has no working `test` script and this plan does not add one. Every task is
verified by **observing the running system** and pasting what you saw. Use the cheapest source of
truth that can actually prove the task:

| Source | How | Good for |
|---|---|---|
| HTTP response | `curl -i` against the running backend | Status codes, headers, error bodies |
| Database | `psql "$DATABASE_URL" -c "..."` | Rows actually written, columns, constraints |
| Process output | backend stdout, or `%APPDATA%\FMS\logs\fms.log` on the factory | Warnings, sync messages, errors |
| UI | the running dashboard or the Electron window title | Anything the operator sees |
| Manual steps | numbered steps with exact commands | Service install, LAN, n8n, WhatsApp |

**Do not start a second copy of `backend/server.js` to test against** — it calls `listen()` on
import, so a second instance fights the running one for the port. Test against the single running
instance, or drive a controller function from `node -e`.

**Never paste a green result you did not run.** If a check cannot be run in the current
environment (no VPS access, no second machine), mark the task
`CODE DONE, CHECKS FAILING` and state precisely which check is unverified and what it needs.

---

## 1. Progress ledger

Update this table as you go. `Deps` = must be `DONE` before starting.

| ID | Task | Deps | Status | Notes / evidence |
|---|---|---|---|---|
| P1-1 | F2 server: savepoint quarantine + `sync_rejected` | P0-1 | NOT STARTED | |
| P1-2 | F2 wire: `outbox_id` in payload | P0-1 | NOT STARTED | prerequisite for P1-1/P1-3 |
| P1-3 | F2 client: `sync_quarantine` + ack handling | P1-1, P1-2 | NOT STARTED | |
| P1-4 | F2 replay endpoint | P1-1, P1-3 | NOT STARTED | |
| P1-5 | F3 relay: state + `whatsapp_dead` + n8n body | — | NOT STARTED | |
| P1-6 | F3 config `reason` + startup warning | P1-5 | NOT STARTED | |
| P1-7 | F3 "Send test WhatsApp" button | P1-5, P1-6 | NOT STARTED | |
| P1-8 | F1 epoch/seq: migration + ingest preflight | — | NOT STARTED | |
| P1-9 | F1 claim + snapshot authorization window | P1-8 | NOT STARTED | |
| P1-10 | F1 client headers + `sync_state` columns | P1-8 | NOT STARTED | |
| P1-11 | F1 `authorize-new-writer.js` + runbooks F7.6/F7.7 | P1-9 | NOT STARTED | |
| P2-1 | F4 shutdown drain | P1-3 | NOT STARTED | |
| P2-2 | F4 debounced post-commit push | P1-3 | NOT STARTED | |
| P2-3 | F4 status endpoint + UI strip | P2-1, P2-2 | NOT STARTED | **must land before P4** |
| P2-4 | F9 heartbeat + health + n8n watchdog | P2-3 | NOT STARTED | |
| P2-5 | F7 backups + restore drill | — | NOT STARTED | |
| P2-6 | F7 UPS + Postgres durability settings | — | NOT STARTED | ops task |
| P3-1 | F6 send-only scheduler + dispatch log | P2-1 | NOT STARTED | |
| P3-2 | F6 host `DISABLE_CRON` | P3-1 | NOT STARTED | single-scheduler invariant |
| P3-3 | F6 freshness label + history view | P3-1 | NOT STARTED | needs §10 decision D2 |
| P4-1 | F5 `desktop/host.js` entry point | P2-3 | NOT STARTED | needs §10 decision D1 |
| P4-2 | F5 service install + dedicated user | P4-1 | NOT STARTED | |
| P4-3 | F5 LAN bind + firewall + hostname | P4-2 | NOT STARTED | |
| P4-4 | F5 frontend relative API base + variant | P4-3 | NOT STARTED | C4 |
| P4-5 | F5 concurrency audit + fixes | P4-3 | NOT STARTED | |
| P5-1 | F8 non-negative stock constraint | P1-1 | NOT STARTED | |
| P5-2 | F10 cleanup bundle | — | NOT STARTED | |

---

## 2. Corrections applied to the earlier draft

Read this before implementing — these are why specific tasks exist as written.

| # | Draft said | Reality in code | Consequence if unchanged |
|---|---|---|---|
| C1 | Quarantine keys on `ch.outbox_id` | Payload is `{table_name, op, row_data}`; `outbox_id` is **never sent** (`desktop/lib/sync.js:63-69,98`) | Server can't tell the client which rows to quarantine → **F2 impossible** |
| C2 | "Add VPS tables to the snapshot exclusion list" (footnote) | `snapshot.js:57` **aborts bootstrap** on an unknown server table; `PROTECTED_TABLES` = only `pgmigrations`; `syncCapture` installs triggers on every PK table | New tables break the next bootstrap unless registered in all four places |
| C3 | `POST /sync/heartbeat` | `readOnlyMode` blocks **all** non-GET/HEAD/OPTIONS, whitelisting only `/auth/login`, `/auth/logout` | Heartbeat + replay return **403 forever** — silent failure, the exact class being fixed |
| C4 | Change `stage.js` API base | `frontend/src/config.js` resolves the site variant from `window.location.hostname` vs `VITE_APP_URL` | LAN hostname falls through to `'all'` → public marketing routes served on the LAN |
| C5 | "Add boot sync" | **Already exists** — `SyncWorker.start()` → `schedule(0)` (`desktop/lib/sync.js:28-30`) | Drop it; no task |
| C6 | Status strip = nice-to-have | Sync health renders into the **Electron window title** (`desktop/main.js`) | A service has no window → the operator loses all sync visibility unless P2-3 lands first |

Also corrected: the draft's "fail `setup.sh` when `N8N_PUBLIC_WEBHOOK_URL` is unset" would break a
valid config (sync on, alerts deliberately off). It becomes a startup warning — see P1-6.

---

## 3. Verified groundwork

### 3.1 New tables — register in all four places (C2)

| Place | File | What to add |
|---|---|---|
| 1. Creation | migration `022`+ (VPS) / `syncCapture.js` `SETUP_SQL` (factory) | `CREATE TABLE` |
| 2. Ingest guard | `SyncController.js` → `PROTECTED_TABLES` | ingest refuses writes to it |
| 3. Snapshot export | `SyncController.js` → new `VPS_ONLY_TABLES`, skipped in `snapshot()` | never exported to a factory |
| 4. Capture guard | `syncCapture.js` → `EXCLUDED_TABLES` | no trigger installed on it |

| Table | Lives on | Migration | `PROTECTED_TABLES` | `VPS_ONLY_TABLES` | `EXCLUDED_TABLES` |
|---|---|---|---|---|---|
| `sync_writer` | VPS | 022 | ✅ | ✅ | ✅ |
| `sync_rejected` | VPS | 023 | ✅ | ✅ | ✅ |
| `report_dispatch_log` | VPS | 024 | ✅ | ✅ | ✅ |
| `sync_heartbeat` | VPS | 025 | ✅ | ✅ | ✅ |
| `whatsapp_dead` | factory | in `alertRelay.js` | — | — | ✅ |
| `sync_quarantine` | factory | in `syncCapture.js` | — | — | ✅ |

Current values: `PROTECTED_TABLES = new Set(['pgmigrations'])`;
`EXCLUDED_TABLES = ['pgmigrations','sync_outbox','sync_state','whatsapp_outbox']`;
`VPS_ONLY_TABLES` does not exist yet.

### 3.2 Wire protocol change (C1) — **do this before P1-1**

`sync_outbox` already has a serial `id`. Send it, and strip it server-side.

```js
// desktop/lib/sync.js — push()
body: JSON.stringify({
  changes: rows.map((r) => ({
    outbox_id: r.id, table_name: r.table_name, op: r.op, row_data: r.row_data,
  })),
})
```

```js
// SyncController.ingest — destructure it OUT before computing cols
const { table_name: tableName, op, row_data: row, outbox_id: outboxId } = change || {};
```

**Trap:** if `outbox_id` stays in the object, the existing unknown-column check rejects every
change with *"column(s) outbox_id missing on ..."*. This is the single most likely way to break
sync while implementing F2.

### 3.3 Read-only allowlist (C3)

```js
// backend/middleware/readOnlyMode.js
const ALLOWED_WRITES = new Set([
  '/auth/login',
  '/auth/logout',
  '/sync/heartbeat',        // P2-4
  '/sync/retry-rejected',   // P1-4
]);
```

`req.path` inside a root-mounted middleware is the full path, so the `/sync/...` entries must be
written in full. `GET /sync/health` needs no entry (read-only method).

---

## 4. Phase 1 — stop the silent failure classes

Ship F2, F3, F1 together. Order within the phase matters: **P1-2 before P1-1**, and F1 last
because it changes the wire protocol again.

### P1-1 — F2 server: savepoint quarantine + `sync_rejected`

**Status:** NOT STARTED
**Deps:** P1-2
**Fixes:** architecture doc §2.3

**Problem.** Any non-409 error becomes a 500, the worker retries the same batch forever, and all
sync stops behind one bad row (typically a 23505 on a unique constraint).

**Migration `023-sync-rejected.js` (VPS only):**

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

**`SyncController.ingest` — restructure the per-change loop:**

```js
const accepted = [], rejected = [];
for (const change of changes) {
  const { table_name: tableName, op, row_data: row, outbox_id: outboxId } = change || {};
  await client.query('SAVEPOINT chg');
  try {
    await applyChange(client, { tableName, op, row, outboxId }, tables);
    await client.query('RELEASE SAVEPOINT chg');
    accepted.push(outboxId);
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT chg');
    if (e.code && /^(22|23)/.test(e.code)) {          // class 22 data, class 23 integrity
      rejected.push({ outbox_id: outboxId, table_name: tableName, op,
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

Keep `SchemaMismatch` as-is: the existing 409 preflight for unknown table/column/op runs
**before** the savepoint loop and stays non-retryable.

**`pkOf(row, table)`** — extract just the PK columns, mirroring the existing `missingPk` check.

**Register the table:** §3.1, all four places.

**Documented limitation (must appear as a code comment):** unique (23505), check (23514) and
not-null (23502) still fire under `session_replication_role = replica`, but **FK violations do
not** (replica disables FK triggers), so a rejected parent can leave an applied child. Acceptable
for a view-only mirror; replay repairs it.

**Checks — observe, don't test:**

1. Create a `products` row on the VPS with a known `(name, type, size)`, e.g.
   `psql "$DATABASE_URL" -c "INSERT INTO products (name,type,size,quantity) VALUES ('ZZ Probe','stock','1','0')"`
   (adjust columns to the real schema). Create the **same** triple on the factory.
2. Watch the factory log: the sync round must report success, and the title must return to
   "All changes uploaded" — **not** "Sync problem". Before this task it would have stalled here.
3. Confirm the child rows landed:
   `psql "$DATABASE_URL" -c "SELECT table_name, op, code, constraint_name, detail FROM sync_rejected ORDER BY id DESC LIMIT 5"`
   Expect exactly one row with `code = 23505`.
4. Confirm the rest of the batch applied: the other rows created in the same sale/action exist on
   the VPS.
5. Confirm a genuinely broken batch still rolls back whole: send a change with an unknown `op`
   via `curl -i` and expect **409**, with `SELECT count(*) FROM sync_rejected` unchanged.

**Gate:** checks 2–5 observed and pasted. Specifically: a duplicate row is rejected with a `23505`
recorded, the batch still completes, and a bad `op` still 409s.

**Evidence:**
```
<paste the log line(s) + the psql output>
```

---

### P1-2 — F2 wire: send `outbox_id`

**Status:** NOT STARTED

**Do:** apply §3.2 exactly. Both sides. No behaviour change yet — the server ignores the field
until P1-1 lands.

**Checks:** with the factory running, `psql` the local DB and confirm the newest `sync_outbox` ids
are contiguous; then confirm the title bar goes back to "All changes uploaded" after a sale (i.e.
the server did not reject the batch for an unexpected `outbox_id` column).

**Gate:** a sale made after this change reaches the VPS, and no
`column(s) outbox_id missing` message appears in the factory log.

---

### P1-3 — F2 client: `sync_quarantine` + ack handling

**Status:** NOT STARTED
**Deps:** P1-1, P1-2

**Files:** `desktop/lib/syncCapture.js`, `desktop/lib/sync.js`

**Do:**
1. Add `sync_quarantine` to `syncCapture.js` `SETUP_SQL` and to `EXCLUDED_TABLES`:

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
   - insert a `sync_quarantine` row per `rejected[].outbox_id` (with its error fields);
   - `DELETE FROM sync_outbox WHERE id = ANY($1)` for accepted **∪** rejected;
   - `UPDATE sync_state SET push_seq = push_seq + 1, last_synced_at = now() WHERE id = 1`
     (the `push_seq` column arrives in P1-10; until then just `last_synced_at`).
3. Backwards compatibility: if the response body has no `accepted`/`rejected` keys (old server),
   fall back to deleting the sent rows as today.

**Checks:**
1. Re-run P1-1's duplicate-product scenario.
2. On the factory: `psql "$DATABASE_URL" -c "SELECT outbox_id, table_name, code, detected_at FROM sync_quarantine"`
   → one row for the rejected change.
3. Same query on `sync_outbox` → that row is **gone** (quarantined, not retried forever).
4. Restart the factory app and confirm the rejected change is **not** re-sent (outbox stays empty
   and the title stays "All changes uploaded").
5. Make an ordinary sale with nothing rejected → `sync_quarantine` count unchanged, outbox drains.

**Gate:** checks 2–5 observed.

**Evidence:**
```
<paste psql output from both tables>
```

---

### P1-4 — F2 replay endpoint

**Status:** NOT STARTED
**Deps:** P1-1, P1-3

**Do:** add `POST /sync/retry-rejected`:
- accepts `{ ids: [<sync_quarantine.id>, ...] }`;
- verifies `X-Sync-Token` (existing middleware);
- **source of truth is the factory** — the endpoint re-inserts the stored `row_data` into
  `sync_outbox` and sets `sync_quarantine.resolved_at`. It does **not** apply data directly.
- **add the path to `ALLOWED_WRITES`** (§3.3) or it 403s on the read-only VPS.
- mark the matching VPS `sync_rejected` rows `resolved_at = now()` when the replay later
  succeeds — simplest correct approach: match on `outbox_id` during the next accepted ingest.

**One replay path only.** Do not build a second replay that applies payloads server-side, or the
same change can apply twice.

**Checks:**
1. `curl -i -X POST .../sync/retry-rejected` with no token → 401.
2. Same call **with** the token but a malformed body → 400.
3. Delete the conflicting `products` row on the VPS, then POST the quarantined id with the token
   → 200, and a new `sync_outbox` row appears on the factory.
4. The next sync round applies it: the row now exists on the VPS and
   `sync_quarantine.resolved_at` is set.
5. Confirm `ALLOWED_WRITES` contains the path by POSTing while `READ_ONLY_MODE=true` on the VPS —
   it must not return the *"This server is view-only"* 403.

**Gate:** checks 2–5 observed.

---

### P1-5 — F3 relay: state + `whatsapp_dead` + n8n body capture

**Status:** NOT STARTED
**Fixes:** architecture doc §2.1 (alert half)

**Problem.** `if (!target) return;` queues forever, then silently drops at 48 h
(`desktop/lib/alertRelay.js:83,86-90`).

**Files:** `desktop/lib/alertRelay.js`

**Do:**
1. Track `relayState ∈ {ok, no_target, n8n_rejecting, offline}`; expose via a getter.
2. **Never delete expired messages.** At 48 h move to `whatsapp_dead` (retain 30 days) instead of
   `DELETE`. Keep the stale-skip policy for *sending*, not for storage.
3. On n8n 4xx/5xx, keep messages queued, set `n8n_rejecting`, and store the response body
   (truncated, e.g. 500 chars) so an unregistered Meta number is visible.
4. Log at error level every 5 min while `no_target` (not every 30 s flush).

**Checks:**
1. **No target:** unset `N8N_PUBLIC_WEBHOOK_URL` on the VPS, restart the factory app, make a sale.
   Expect: an error-level log line within 5 minutes, `relayState = no_target`, and a
   `whatsapp_outbox` row that is still present after 10 minutes (not dropped). Before this task
   there was silence.
2. **n8n rejecting:** point the target at a URL that returns 403. Expect `n8n_rejecting` and the
   response body captured in the log; the queued row must still be there.
3. **Recovery:** restore the correct target → the queued message flushes and the row is removed.
4. **Expiry:** temporarily lower the 48 h constant to 30 s and confirm the row **moves to
   `whatsapp_dead`** with the original content intact — it must not vanish. Revert the constant.

**Gate:** all four observed; no code path deletes a `whatsapp_outbox` row without first inserting
into `whatsapp_dead`.

**Evidence:**
```
<paste log lines + psql output for whatsapp_outbox / whatsapp_dead>
```

---

### P1-6 — F3 config `reason` + startup warning

**Status:** NOT STARTED
**Deps:** P1-5

**Do:**
1. `SyncController.getConfig` returns `{ whatsapp: null, reason: 'N8N_PUBLIC_WEBHOOK_URL unset' }`
   instead of a bare `null`. Keep the key name `whatsapp` so existing clients don't break.
2. `backend/server.js` at startup: if `SYNC_TOKEN` is set and `N8N_PUBLIC_WEBHOOK_URL` is not,
   log a loud warning. **Do not exit and do not fail `setup.sh`** — sync-on/alerts-off is a
   legitimate configuration. *(This corrects the earlier draft.)*

**Checks:**
1. `curl -s -H "X-Sync-Token: $SYNC_TOKEN" .../sync/config` with the variable unset →
   `{"whatsapp":null,"reason":"N8N_PUBLIC_WEBHOOK_URL unset"}`.
2. Set the variable, restart, re-curl → `whatsapp` populated, no `reason` (or `reason: null`).
3. Restart the backend with the variable unset and `SYNC_TOKEN` set → the warning appears **once**
   in stdout, and the process keeps running.

**Gate:** all three observed.

---

### P1-7 — F3 "Send test WhatsApp" button

**Status:** NOT STARTED
**Deps:** P1-5, P1-6

**Do:** a settings-page control that POSTs through the full path (backend → relay → n8n → Meta)
and shows the real result — including the `reason` when unconfigured, and the n8n response body
when rejected. Requires a new endpoint; **add it to `ALLOWED_WRITES`** if it is a POST on the VPS,
or place it on the host-only status router.

**Checks (manual, three outcomes):**
1. Variable unset → button reports *"N8N_PUBLIC_WEBHOOK_URL unset"*.
2. Variable set but Meta token wrong → button shows the n8n response body.
3. Everything correct → the message arrives on the owner's WhatsApp.

**Gate:** all three outcomes observed and recorded.

---

### P1-8 — F1 epoch/seq: migration + ingest preflight

**Status:** NOT STARTED
**Fixes:** architecture doc §2.2, §2.4

**Migration `022-sync-writer.js` (VPS only):**

```sql
CREATE TABLE IF NOT EXISTS sync_writer (
  id              int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  epoch           bigint NOT NULL DEFAULT 0,
  last_push_seq   bigint NOT NULL DEFAULT 0,
  authorize_until timestamptz,
  last_ingest_at  timestamptz
);
INSERT INTO sync_writer (id) VALUES (1) ON CONFLICT DO NOTHING;
```

**Ingest preflight**, inside the transaction, before any change is applied:

```js
const { rows: [w] } = await client.query(
  'SELECT epoch, last_push_seq FROM sync_writer WHERE id = 1 FOR UPDATE');
const epoch = Number(req.get('X-Writer-Epoch'));
const seq   = Number(req.get('X-Push-Seq'));
if (epoch !== Number(w.epoch))                     return reject(403, 'WriterEpochMismatch');
if (seq < Number(w.last_push_seq))                 return reject(409, 'PushSeqRegressed');
if (seq > Number(w.last_push_seq) + 1)             return reject(409, 'PushSeqGap');
// ... apply changes ...
await client.query(
  'UPDATE sync_writer SET last_push_seq = $1, last_ingest_at = now() WHERE id = 1', [seq]);
```

| Condition | Response | Client behaviour |
|---|---|---|
| epoch differs | `403 WriterEpochMismatch` | stop worker, `blocked_not_writer`, red banner |
| `seq < last` | `409 PushSeqRegressed` | stop, `blocked_regressed` ("restored from an older backup?") |
| `seq > last + 1` | `409 PushSeqGap` | stop, alert owner |
| `seq ∈ {last, last+1}` | apply | proceed |

`seq == last` is a legitimate retry after a lost reply — safe because ingest is an idempotent
upsert and a resend may carry extra rows.

**Rollout safety:** to avoid a hard cutover, treat **absent** headers as epoch `0` /
seq `last_push_seq` for one release, and log a deprecation warning. Note this in the commit
message.

**Checks (curl, against the running backend):**
1. Baseline: `psql "$DATABASE_URL" -c "SELECT epoch,last_push_seq,last_ingest_at FROM sync_writer"`.
2. Correct headers, `seq = last + 1` → `200`; re-query and confirm `last_push_seq` advanced and
   `last_ingest_at` updated.
3. Wrong epoch → `403` with `WriterEpochMismatch`; confirm `last_push_seq` **unchanged**.
4. `seq = last + 1 + 5` → `409 PushSeqGap`; confirm **no rows applied** (pick a table and count).
5. `seq = last - 1` → `409 PushSeqRegressed`; confirm nothing applied.
6. `seq = last` (retry) → `200` and **no duplicate rows**.

**Gate:** checks 2–6 observed, and 3–5 prove nothing was written.

**Evidence:**
```
<paste curl -i output + psql output for each>
```

---

### P1-9 — F1 claim + snapshot authorization window

**Status:** NOT STARTED
**Deps:** P1-8

**Do:**
1. `POST /sync/claim?current=<epoch>` — requires an open `authorize_until` window. One
   transaction:
   ```sql
   UPDATE sync_writer SET epoch = epoch + 1, last_push_seq = 0, authorize_until = NULL
    WHERE id = 1 RETURNING epoch;
   ```
   Returns `{ epoch }`. The client writes `epoch` and `push_seq = 0` into `sync_state`.
   - `current=<epoch>` lets a legitimate host that lost its `config.json` re-claim. A host whose
     epoch is already **older** than the server's must not silently take over: the authorizing
     script prints both epochs and requires `--force`.
2. `GET /sync/snapshot` now requires **both** `READ_ONLY_MODE=true` **and** an open window, else
   403. This is what closes §2.4 — a second machine can no longer bootstrap silently.
3. An existing install adopting the scheme calls claim **without** importing a snapshot.

**Checks (curl):**
1. `GET /sync/snapshot` with no window → `403`.
2. `POST /sync/claim` with no window → `403`.
3. Open a window (`UPDATE sync_writer SET authorize_until = now() + interval '10 min'`), claim →
   `200`, epoch incremented, `last_push_seq` back to `0`.
4. Claim again with a stale `current` → refused; with `--force` from the script → succeeds.

**Gate:** all four observed.

---

### P1-10 — F1 client headers + `sync_state` columns

**Status:** NOT STARTED
**Deps:** P1-8

**Do:**
1. `syncCapture.js` `SETUP_SQL`, using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` so existing
   installs upgrade in place:
   ```sql
   ALTER TABLE public.sync_state ADD COLUMN IF NOT EXISTS epoch    bigint NOT NULL DEFAULT 0;
   ALTER TABLE public.sync_state ADD COLUMN IF NOT EXISTS push_seq bigint NOT NULL DEFAULT 0;
   ```
2. `sync.js` sends `X-Writer-Epoch` and `X-Push-Seq` on every push, read from `sync_state`.
3. **Increment `push_seq` only after a 2xx**, in the same local transaction that deletes the
   shipped rows (P1-3's transaction).
4. `desktop/main.js`: claim on first run / after setup, store the returned epoch.
5. New states `blocked_not_writer` / `blocked_regressed` must render distinctly.

**Checks:**
1. After a successful push: `psql "$DATABASE_URL" -c "SELECT epoch, push_seq, last_synced_at FROM sync_state"`
   → `push_seq` incremented by exactly 1, `epoch` matches `sync_writer.epoch` on the VPS.
2. Make a push fail (stop the VPS backend briefly, or point the URL at a closed port): confirm
   `push_seq` did **not** change.
3. Restore connectivity → next push succeeds and `push_seq` advances once (not twice).
4. On the VPS, set `epoch = epoch + 1` manually → the next factory push returns 403 and the
   window title/status shows the `blocked_not_writer` state, distinct from `offline`.

**Gate:** all four observed.

**Evidence:**
```
<paste psql output before/after + the visible state text>
```

---

### P1-11 — F1 authorizing script + failure runbooks

**Status:** NOT STARTED
**Deps:** P1-9

**Why in phase 1:** F1 converts host replacement from a manual process into an enforced 403.
Without the runbook the first re-authorization looks like an outage.

**Do:**
1. `deploy/authorize-new-writer.js` — sets `authorize_until = now() + interval '60 minutes'`.
   Prints current epoch, the newly authorized window, and the exact next commands. Refuses
   without `--force` when the caller's `--current-epoch` is older than the server's.
2. **Host-dies runbook** (F7.6): authorize → bootstrap the new host from the mirror snapshot →
   claim. State explicitly that **writes stranded on a de-authorized host do not drain** and are
   recoverable only through this runbook.
3. **VPS-restore runbook** (F7.7): if the VPS is restored from an older backup the host is ahead
   and the fence returns `PushSeqGap`. Document the `resync-mirror` procedure (factory re-sends
   all rows as upserts after an admin resets `last_push_seq`) and mark it **not built**.

**Checks:**
1. Run the script against a scratch DB: window opens (`authorize_until` in the future in
   `sync_writer`), epoch printed, next commands printed.
2. Run it again with a stale `--current-epoch` → refused; with `--force` → proceeds.

**Gate:** both observed; both runbooks exist in `desktop/README.md` or a `RUNBOOK.md`.

---

## 5. Phase 2 — visibility and data protection

### P2-1 — F4 shutdown drain

**Status:** NOT STARTED
**Deps:** P1-3

**Do:** on service stop / `before-quit`, stop accepting new business writes, then flush the
outbox until empty or **45 s**, whichever is first. The current handler in `desktop/main.js`
already calls `syncWorker.stop()` — extend it to drain first. Configure the service wrapper's
pre-shutdown timeout (NSSM `AppStopTimeout` or equivalent) and test it.

**Checks:**
1. Network up: create a sale, quit immediately, confirm the row exists on the VPS
   (`psql` on the mirror).
2. Network down: create a sale, quit. Confirm the outbox still holds it locally; restore the
   network and start the app → it drains and the mirror has the row.

**Gate:** both observed.

---

### P2-2 — F4 debounced post-commit push

**Status:** NOT STARTED
**Deps:** P1-3

**Do:** after any business write, schedule a push within **2 s** (coalesced) using the existing
`SyncWorker.kick()`. Idle poll stays 15 s. Today a sale can take up to 15 s to reach the mirror.

**Checks:** create a sale, then poll the VPS — the row must appear within ~3 s. Create five sales
in quick succession and confirm the log shows a coalesced push (not five separate batches).

**Gate:** both observed.

---

### P2-3 — F4 status endpoint + UI strip  *(must land before P4)*

**Status:** NOT STARTED
**Deps:** P2-1, P2-2

**Do:**
1. `GET /status` on the host → `{ state, lastSyncedAt, outboxCount, oldestOutboxAge,
   quarantineCount, relayState, whatsappQueued, oldestWhatsappAge, epoch, pushSeq }`.
2. Status strip in the UI on **every terminal**, polling that endpoint. Green / amber (backlog
   > 5 min) / red (blocked or degraded).
3. **This replaces the Electron window title as the operator's sync health indicator.** It is
   required before P4-1 because a Windows service has no window.

**Checks:**
1. `curl -s .../status` returns the full shape.
2. Induce each state and observe the colour within one poll: healthy → green; stop the VPS so the
   outbox backs up past 5 min → amber; force `blocked_not_writer` (bump the VPS epoch) → red.

**Gate:** all three colours observed; the new `frontend/src/api/statusApi.js` imports from `./http`.

---

### P2-4 — F9 heartbeat + health + n8n watchdog

**Status:** NOT STARTED
**Deps:** P2-3

**Migration `025-sync-heartbeat.js` (VPS only):**

```sql
CREATE TABLE IF NOT EXISTS sync_heartbeat (
  id                      int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  received_at             timestamptz NOT NULL DEFAULT now(),
  outbox_count            int,
  oldest_outbox_age_sec   int,
  quarantine_count        int,
  whatsapp_state          text,
  whatsapp_oldest_age_sec int,
  epoch                   bigint,
  push_seq                bigint
);
```

**Do:**
1. Host `POST /sync/heartbeat` every minute — **must be in `ALLOWED_WRITES`** (§3.3).
2. `GET /sync/health` (token-protected) → `{ last_ingest_at, epoch, last_push_seq,
   rejectedOpenCount, heartbeat }`.
3. n8n workflow every 10 min checks health. Alert the owner when the heartbeat is **recent** and
   any of: `oldest_outbox_age_sec > 1800` · `quarantine_count > 0` · `whatsapp_state != 'ok'` ·
   `whatsapp_oldest_age_sec > 3600` · state is `blocked_not_writer` / `blocked_regressed` /
   `degraded`.
4. A missing heartbeat means the host is off — **normal, do not alert**. Optional single
   informational message if the host is expected on (working hours) and silent > 2 h.

**Checks:**
1. Confirm the heartbeat row updates every minute:
   `psql -c "SELECT received_at, outbox_count, push_seq FROM sync_heartbeat"`.
2. Force each alert condition one at a time and confirm the WhatsApp alert fires.
3. **Negative case:** stop the host completely for 20 minutes → confirm **no** alert.

**Gate:** all three observed, including the negative case.

---

### P2-5 — F7 backups + restore drill

**Status:** NOT STARTED
**Do:**
1. `desktop/scripts/backup.js` — `pg_dump -Fc` every 6 h plus one at shutdown, to a second drive,
   then copy off-machine. Keep 14 daily, 8 weekly. Windows scheduled task to invoke it.
2. **Restore drill** — restore a dump into a scratch instance and verify row counts. **An
   untested backup is an assumption**; run it at least once and record the result.

**Checks:** run the backup, then the drill; record row counts from both sides.

**Gate:** drill completes with matching counts.

---

### P2-6 — F7 UPS + Postgres durability

**Status:** NOT STARTED

**Do:** UPS sized for the host with graceful-shutdown signalling. Confirm `fsync = on`,
`synchronous_commit = on`, `full_page_writes = on` in the host's Postgres config. **Do not tune
them off.**

**Checks:** `psql -c "SHOW fsync; SHOW synchronous_commit; SHOW full_page_writes;"` → all `on`.

**Gate:** output recorded. This is an ops task — record who performed it.

---

## 6. Phase 3 — reports and digests move to the VPS

*Order note: this phase fixes the original reported symptom and does **not** depend on LAN
terminals. It deliberately precedes the service/LAN rewrite (Phase 4) so the smaller fix ships
first.*

### P3-1 — F6 send-only scheduler + dispatch log

**Status:** NOT STARTED
**Deps:** P2-1
**Fixes:** architecture doc §2.1 (cron half)

**Migration `024-report-dispatch-log.js` (VPS only):**

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
1. New `backend/services/sendOnlyScheduler.js`, enabled by `REPORT_SENDER_MODE=send_only`.
2. Every minute: read `report_schedules` from the mirror, find due schedules (keep the existing
   `>=` catch-up semantics from `cronJobs.js`), generate from **read-only queries only**, send via
   `sendWhatsApp`. Reuse `ReportsController.buildReportMessage` and `resolvePeriod` so the two
   schedulers cannot drift.
3. Record `report_dispatch_log` **after** a successful send. If the send fails, write no row — the
   next minute retries. This replaces the host's `last_run_at` guard as the dedupe mechanism.
4. Digests (7:30 and 10:00 Asia/Karachi) move the same way, keyed `digest:0730:<date>`.
5. **Discipline, not a guarantee:** cron runs *in-process*, so it bypasses the HTTP read-only wall
   entirely. The "never write mirror tables" rule must be enforced by review — write it as a
   header comment and keep every statement in this file a `SELECT`.

**Checks:**
1. Set a schedule due in 2 minutes with the host **off**. Confirm the report arrives on WhatsApp.
2. `psql -c "SELECT frequency, period_key, status, sent_at FROM report_dispatch_log"` → exactly
   one row for that period.
3. Restart the VPS inside the same minute window → still exactly one row and **no second
   message**.
4. Point n8n at a failing URL so the send fails → no dispatch row is written; fix it and confirm
   the next minute sends once.
5. `grep -nE "INSERT|UPDATE|DELETE" backend/services/sendOnlyScheduler.js` → no writes to
   business tables.

**Gate:** checks 1–5 observed.

**Evidence:**
```
<paste psql output + the received WhatsApp message>
```

---

### P3-2 — F6 host `DISABLE_CRON`

**Status:** NOT STARTED
**Deps:** P3-1

**Do:** gate `startCronJobs()` in `server.js` behind `DISABLE_CRON=true` so exactly one scheduler
exists. Ship this **after** P3-1 is deployed and verified, or reports stop in the gap.

**Checks:** with `DISABLE_CRON=true` the host logs no cron start; across one full scheduled window
exactly **one** message arrives (not two).

**Gate:** one delivery observed, and the host log shows cron did not start.

---

### P3-3 — F6 freshness label + history view

**Status:** NOT STARTED
**Deps:** P3-1, §10 decision D2

**Do:**
1. Every VPS-generated message ends with *"data as of `<last_ingest_at>`"* (from `sync_writer`).
2. If the host has not synced for > 2 h, prefix a stale-data warning.
3. **Decide and state** whether an incomplete period is labelled *"period incomplete"* rather
   than only *"data as of"* — a 7:30 AM daily report from a mirror last updated yesterday evening
   is honestly labelled but still not a report of today.
4. Implement the history decision D2.

**Checks:**
1. Host off for > 2 h → the next scheduled message carries the stale warning and the correct
   timestamp.
2. Fresh sync → no warning, timestamp within a minute of the last ingest.

**Gate:** both messages inspected.

---

## 7. Phase 4 — host service and LAN terminals

*Largest, riskiest phase. P2-3 must be `DONE` first — the service removes the window title that
currently reports sync health.*

### P4-1 — F5 `desktop/host.js` entry point

**Status:** NOT STARTED
**Deps:** P2-3, §10 decision D1

**Do:** new entry point with **no Electron dependency**, reusing the already Electron-free modules
`lib/database.js`, `lib/syncCapture.js`, `lib/sync.js`, `lib/alertRelay.js`, `lib/ports.js`. Move
the content of `main.js` `boot()` (lines ~304-371): Postgres start, schema, capture install, relay
start, backend fork, sync worker start.

**Config path — the highest-risk item in this phase.** `main.js` uses `app.getPath('userData')`.
A service has no Electron and typically runs as a different user, so `host.js` must take the data
directory from an explicit `FMS_DATA_DIR` env var. **Decide the location (D1) and document the
migration before writing code**; moving `pgdata` incorrectly is the most likely way to lose data
in this whole plan.

**Updates:** `electron-updater` no longer applies. Choose and document either a scripted update
path or keeping Electron installed solely as the updater.

**Checks:**
1. `host.js` starts the full stack from a **clean** data dir; a sale created through it reaches
   the mirror.
2. Copy the existing `%APPDATA%\FMS` to `FMS_DATA_DIR` and start from the copy: the pre-existing
   data is all there, and the **original directory is byte-identical afterwards** (no in-place
   migration damage). Compare with a file count and a checksum of `pgdata` before/after.

**Gate:** both observed, including the unchanged-source check.

---

### P4-2 — F5 service install + dedicated user

**Status:** NOT STARTED
**Deps:** P4-1

**Do:** register `host.js` with a service wrapper, start type Automatic, running as a **dedicated
low-privilege Windows user**. Postgres refuses to start under an administrative account, and
LocalSystem counts. That user needs write access to the data directory only.

**Checks:**
1. Reboot with nobody logged in → the service starts, Postgres accepts connections, the dashboard
   answers on 48620.
2. The Postgres log shows **no** administrative-account refusal.
3. `pgdata` is owned by the service user, not the interactive user.

**Gate:** all three observed.

---

### P4-3 — F5 LAN bind + firewall + hostname

**Status:** NOT STARTED
**Deps:** P4-2

**Do:**
1. Backend listens on the LAN interface on 48620 (today the desktop sets `HOST: '127.0.0.1'` —
   one-line change plus firewall).
2. Postgres stays `127.0.0.1:48621`. **Never expose it.** Verify from a second machine that 48621
   is unreachable.
3. Firewall: inbound TCP 48620, Private profile, local subnet only.
4. Static IP / DHCP reservation plus hostname `fms-host`.
5. `FRONTEND_URL` on the host must include the LAN origin for CORS.

**Checks (from a second machine):**
1. Dashboard loads at `http://fms-host:48620` and login works.
2. The WebSocket connects (`/ws` validates only the JWT query param, so no origin fix is needed).
3. Port 48621 is **refused** (`Test-NetConnection fms-host -Port 48621`).

**Gate:** all three observed.

---

### P4-4 — F5 frontend relative API base + variant (C4)

**Status:** NOT STARTED
**Deps:** P4-3

**Do:**
1. `desktop/scripts/stage.js`: set `VITE_API_URL=/api` instead of
   `http://127.0.0.1:48620/api`.
2. Handle the variant resolution in `frontend/src/config.js`: on a LAN hostname it currently
   returns `'all'`, which serves the public marketing routes. Either set `VITE_APP_URL` to the LAN
   origin (`http://fms-host:48620`) at build time, or add an explicit `VITE_SITE_VARIANT` override.
   Pick one and comment why.
3. `AUTH_BASE_URL` is derived by stripping the `/api` suffix — confirm a relative base still
   resolves (`/api` → `''`), or the auth calls break.

**Checks (from a second machine):**
1. `/` and `/login` resolve correctly, no public marketing route is served.
2. `/auth/login` succeeds and an authenticated `/api/*` call returns data (proves
   `AUTH_BASE_URL`/`API_BASE_URL` still resolve).

**Gate:** both observed.

---

### P4-5 — F5 concurrency audit + fixes

**Status:** NOT STARTED
**Deps:** P4-3

**Already safe — verify, do not change:**
- sale stock decrement — `SalesController.js:60`, `FOR UPDATE`
- invoice allocation — `InvoiceController.js:128`, `FOR UPDATE`
- raw-material consumption — `RawMaterialConsumptionController.js:27`, `FOR UPDATE`
- gate pass — `nextval` inside the transaction

**Known unsafe — fix:** `StockController.updateStock` does a bare read-modify-write with no
transaction and no lock, and the pre-read feeding `alertIfNewlyLow` can be stale. Two terminals
editing one item last-save-wins silently.

**Audit the same pattern in:** purchases, production, stock adjustments, cashbook, and every
ledger/balance update.

**Preferred form where the check is arithmetic:**
```sql
UPDATE stock SET quantity = quantity - $1
 WHERE id = $2 AND quantity >= $1
 RETURNING quantity;   -- zero rows = insufficient
```
**Do not** apply this to `createSale` — its `FOR UPDATE` + `needsProduction` branch is deliberate
and converting it changes behaviour.

**Add** an `updated_at` precondition on edit endpoints for key records (customers, products,
prices) so concurrent edits return "changed by someone else" instead of last-save-wins.

**Checks (two real terminals, both logged in):**
1. Sell the last 5 units from both terminals at once → exactly 5 sold, stock never negative.
   Verify with `psql -c "SELECT quantity FROM stock WHERE id = <id>"`.
2. Open the same stock item in both terminals, change the quantity in each, save both → the
   second gets a conflict error, not a silent overwrite. Confirm the stored value matches the
   first save.
3. Before the fix, reproduce check 2 as a silent overwrite so the fix is demonstrably a change.

**Gate:** checks 1–3 observed. Record check 3's pre-fix result as the baseline.

---

## 8. Phase 5 — constraint and cleanup

### P5-1 — F8 non-negative stock

**Status:** NOT STARTED
**Deps:** P1-1 (quarantine must exist first, so a violating row is rejected instead of stalling)

**Migration `026-stock-nonneg.js`:**

```sql
-- 1. audit first, out loud
SELECT id, quantity FROM stock WHERE quantity < 0;

-- 2. add without validating
ALTER TABLE stock ADD CONSTRAINT stock_quantity_nonneg CHECK (quantity >= 0) NOT VALID;

-- 3. after fixing any audited rows, in a follow-up migration or manual step:
ALTER TABLE stock VALIDATE CONSTRAINT stock_quantity_nonneg;
```

**Deploy the VPS migration first**, then the factory app.

**Checks:**
1. `psql -c "INSERT INTO stock (name,unit_price,quantity) VALUES ('neg probe',0,-1)"` →
   rejected with `23514`.
2. Push a change carrying `quantity = -1` through `/sync/ingest` via `curl -i` → **200 with a
   rejection** (not 500), one `sync_rejected` row with `code = 23514`, and the batch's other
   changes still applied.
3. Confirm the factory title does **not** show "Sync problem".

**Gate:** all three observed — check 2 is the whole reason this task is last.

---

### P5-2 — F10 cleanup bundle

**Status:** NOT STARTED

**Do:**
1. **Restore `deploy/.env.n8n.example`** with placeholder values for exactly the keys
   `provision-n8n.js:38-45` demands: `META_WHATSAPP_TOKEN`, `META_PHONE_NUMBER_ID`,
   `WHATSAPP_TO_NUMBER`, `N8N_WEBHOOK_SECRET`, `WEBHOOK_URL`. Confirmed missing from the repo
   while **both** `setup.sh:19` and `provision-n8n.sh:16` require it.
2. Delete `GET /testautodeployment` (`backend/server.js:90`).
3. Remove `BACKEND_WEBHOOK_SECRET` and `N8N_INBOUND_SECRET` from `backend/.env.example` (dead
   since `routes/webhooks.js` was deleted).
4. **Gate pass numbering:** moving `nextval` into a transaction does **not** stop gaps — sequence
   values are not rolled back. If gapless numbers matter, use
   `UPDATE counters SET n = n + 1 WHERE name = 'gate_pass' RETURNING n` inside the transaction
   (serializes by row lock). If not, **accept gaps and record the decision** in a comment. Do not
   leave it ambiguous.
5. **Enforce the PK rule:** add a startup check that **fails loudly** instead of `syncCapture.js`
   merely logging "never syncing".

**Checks:**
1. `curl -i .../testautodeployment` → 404.
2. A fresh `deploy/setup.sh` run gets past step 1 (the env-file validation passes with the
   restored example).
3. Add a table without a primary key in a scratch DB and start the host → it fails loudly (or
   logs the new explicit error), rather than silently never syncing.

**Gate:** all three observed.

---

## 9. Phase checklist

| Phase | Items | Exit criterion |
|---|---|---|
| **1** | P1-1 … P1-11 + runbooks | No data error can stall sync; alert loss is visible; a second writer is refused. Observed: a duplicate row is quarantined while the batch completes, and both fence responses block without writing |
| **2** | P2-1 … P2-6 | Status strip live on terminals; heartbeat alerts on real problems and stays quiet when the host is off; backup drill completed |
| **3** | P3-1 … P3-3 | A scheduled report arrives with the host off, labelled with data age; exactly one delivery |
| **4** | P4-1 … P4-5 | Service survives reboot with nobody logged in; N terminals work over the LAN; the concurrent-edit conflict is reproduced and fixed |
| **5** | P5-1 … P5-2 | Negative stock is impossible and quarantined, not fatal; `setup.sh` runs clean on a fresh machine |

---

## 10. Open decisions — resolve before the dependent task

| ID | Decision | Needed by | Recommendation |
|---|---|---|---|
| **D1** | Where does the host's data directory live once Electron is gone? | P4-1 | `FMS_DATA_DIR`, default `%PROGRAMDATA%\FMS`, with a documented copy procedure from `%APPDATA%\FMS`. **Never** migrate in place — copy, verify, then switch. |
| **D2** | Report history: VPS-sent reports appear only in `report_dispatch_log` with a read-only view, or does the host write `reports` rows on demand? | P3-3 | (a) dispatch log + read-only history view — keeps the mirror pure. Choose (b) only if UI history outweighs that. |
| **D3** | Gate pass numbers: gapless counter table, or accept gaps? | P5-2 | Accept gaps; a counter table adds a contention point for cosmetic benefit. Record the decision in a comment. |
| **D4** | Updates after F5: scripted path, or keep Electron installed purely as the updater? | P4-1 | Scripted; keeping Electron for one job doubles the install surface. |

---

## 11. Do NOT change these

They look like bugs and are deliberate. Changing them is a regression.

- **The two sequence-reset styles.** `SyncController.ingest` uses `setval(seq, max, true)`;
  `snapshot.js` uses `setval(seq, max + 1, false)`. Different styles, same next value.
- **`session_replication_role = replica` skipping FK checks and triggers** on both ingest and
  snapshot import. The factory already enforced them; re-applying causes ordering failures and
  double cascades.
- **409 `SchemaMismatch` blocking a batch.** That is how a behind-on-migrations mirror is
  protected.
- **`READ_ONLY_MODE` blocking VPS writes.** That is the point of the switchover.
- **The digest sending twice (7:30 and 10:00).** Deliberate, to survive Meta's 24 h free-text
  window.
- **`SalesController.createSale`'s `FOR UPDATE` + `needsProduction` branch.**
- **`routes/purchase.js` double-mounted** at `/api/purchase` and `/api/purchases`.
- **Sales/Purchase module parallelism.** A fix on one side usually needs the mirror on the other.
- **The commented-out block at the top of `frontend/src/App.jsx`.** Ask before removing.
- **`README.md` is a 3-line stub.** Product documentation lives in `desktop/README.md` and
  `CLAUDE.md`; do not "helpfully" expand the root README.

<!-- ════════════════════════════════════════════════════════════════════════
     END OF THE ORIGINAL PLAN. Everything below was added afterwards as a
     review. Nothing above this line has been changed.
     ════════════════════════════════════════════════════════════════════════ -->

---
---

# 🔍 REVIEWER'S REFLECTIONS — not part of the original plan

> **Who / when:** Claude (AI review), 13 Oct 2026, after checking every task against the code in
> this repo and against the live VPS (commands run by the owner on 12 Oct 2026).
>
> **How to read this:** sections 0–11 above are the original plan, word for word. This part
> points out where the plan doesn't match the real code, what the live system showed, and a
> suggested order. Where the plan and this review disagree, check the code: it beats both.
>
> **Status markers in §1 are untouched.** Nothing in this review has been implemented.

---

## R1. Where the plan is wrong

Each item: what the plan says → what the code actually does → what to do instead.

### R1.1 "The outbox id is never sent" (C1, §3.2, P1-2)
- **Plan says:** the factory sends changes without their outbox id, so the server can't say which
  ones failed, and adding `outbox_id` would make every upload fail the unknown-column check.
- **Actually:** the factory already sends it, as `id`: `desktop/lib/sync.js` selects
  `id, table_name, op, row_data` and pushes those rows as they are. The server just ignores it
  (`SyncController.ingest` only reads `table_name`, `op`, `row_data`). The unknown-column check
  only looks at the keys inside `row_data`, so the "trap" in §3.2 doesn't exist.
- **Instead:** have the server read `change.id` (or rename it, either is safe). P1-2 is close to
  a no-op.

### R1.2 "New /sync routes will be blocked by read-only mode" (C3, §3.3)
- **Plan says:** `readOnlyMode` blocks every POST, so heartbeat and retry would return 403
  forever unless added to `ALLOWED_WRITES`.
- **Actually:** `server.js` mounts `/sync` (line 75) **before** `readOnlyMode` (line 84). Any
  route defined in `routes/sync.js` answers before the read-only check runs.
- **Instead:** skip the `ALLOWED_WRITES` edits. They're harmless but unnecessary.

### R1.3 The retry endpoint is in the wrong place (P1-4)
- **Plan says:** add `POST /sync/retry-rejected` on the VPS, protected by the sync token.
- **Actually:** it has to edit `sync_quarantine` and `sync_outbox`, which exist **only on the
  factory**. On the factory, every `/sync/*` route returns 404, because `SYNC_TOKEN` isn't set
  there (`middleware/requireSyncToken.js`).
- **Instead:** put retry in the desktop app. Also, re-send the record **as it is now** (read the
  live row; send a delete if the row is gone), not the copy stored when it failed. Replaying the
  old copy can bring back outdated values.

### R1.4 "New VPS-only tables break the factory's first-time setup" (C2)
- **Plan says:** a table that exists only on the VPS makes `snapshot.js` abort.
- **Actually:** the factory runs the same migrations as the VPS (`desktop/lib/database.js`,
  `prepareSchema`). "VPS-only" migration tables therefore exist, empty, on both sides, and setup
  doesn't abort.
- **Instead:** still register them in the four places of §3.1, for different reasons: the factory
  must not be able to overwrite them, VPS bookkeeping shouldn't be copied down, and no change
  triggers should be installed on them.

### R1.5 "Alerts queue forever, then silently drop at 48 h" (F3, P1-5)
- **Plan says:** with no target set, alerts pile up and are then quietly deleted.
- **Actually:** with no target, `alertRelay.js` stops before its delete step, so nothing is ever
  dropped; alerts just wait. Old alerts are only removed once a target exists, and that's logged.
  An n8n/Meta rejection *does* come back as an error, because the n8n workflow has no
  "continue on fail", so the relay keeps the message.
- **The real problem** is that nobody sees any of this; it's only in `fms.log`. The truly silent
  case isn't in the plan: Meta accepts a message, then doesn't deliver it (the 24-hour
  free-text window).
- **Related:** the existing "Send today's report" button says "sent" even when the message was
  only queued (factory) or failed (`sendWhatsApp` swallows errors). That matters for P1-7.

### R1.6 "Back up with pg_dump -Fc" (P2-5)
- **Actually:** the embedded Postgres shipped with the desktop app contains only `initdb`,
  `pg_ctl` and `postgres`. There is no `pg_dump`.
- **Instead:** export the tables as JSON (the existing `importSnapshot` can restore that), ship
  `pg_dump.exe` from the matching Postgres 16 build, or back up the VPS copy (see R4).

### R1.7 "Confirm fsync / synchronous_commit / full_page_writes" (P2-6)
- **Actually:** `embedded-postgres` starts Postgres with no extra flags, so all three are already
  at their safe defaults. Nothing to code. The UPS is a purchase.

### R1.8 "Stock can never go below zero" is presented as a mirror safety net (P5-1)
- **Actually:** migrations run on the factory too, so the rule changes factory behaviour. These
  normal actions would start failing with a raw 500 error:
  - cancelling a completed production order whose stock was already sold
    (`ProductionController.js` ~line 252 subtracts with no check);
  - editing a stock item to a negative quantity (`StockController.updateStock` accepts anything);
  - a sale that lists the same stock item twice (each line is checked against the quantity
    *before* the other line's decrement).
- **Instead:** fix those three paths first. The "audit existing rows" step has nothing to do:
  the VPS had **0** negative stock rows on 12 Oct.

### R1.9 "Fail loudly when a table has no primary key" (P5-2 item 5)
- **Actually:** making the factory app refuse to start would stop the whole factory over a sync
  problem.
- **Instead:** show it in the sync status / window title.

### R1.10 Small bookkeeping errors
- §1 ledger: P1-1 and P1-2 depend on **P0-1, which doesn't exist**. P1-1 depends on P1-2 (as its
  own section says); P1-2 has no dependency.
- `/testautodeployment` is at `server.js` line 91, not 90.

---

## R2. What the live system showed (12 Oct 2026)

| Check | Result | What it means |
|---|---|---|
| VPS code version | `952c21e`, same as `main` | VPS is up to date |
| `READ_ONLY_MODE` | `true` | VPS refuses all edits and runs **no** scheduled reports or digests |
| `SYNC_TOKEN`, `N8N_PUBLIC_WEBHOOK_URL` | both set | sync on; WhatsApp target configured |
| Newest sale on the VPS | **27 Sep 2026** | nothing has synced since the switchover |
| Factory using the app? | **No** (confirmed by the owner) | sync has never carried real data |
| Backups on the VPS | **none** (crontab only runs `keepalive.sh`) | the VPS database is the **only** copy of all data |
| Negative stock rows | 0 | P5-1 audit has nothing to fix |
| Sync errors in backend log | none | weak signal: the log restarts on every deploy, and successful uploads log nothing |
| Latest installer | 1.0.1, built 29 Sep | older than the repo (no gate-pass history page) |

Two consequences worth stating plainly:

1. **Nobody has been able to enter data anywhere since 29 Sep.** The VPS is read-only and the
   factory isn't using the app.
2. **The snapshot is open right now.** With read-only on and the token set, anyone given the sync
   key can download the whole database, user password hashes included, and start uploading as a
   second writer. Nothing stops them until the one-writer lock exists.

---

## R3. What changes because the factory isn't live yet

- **This is the cheapest moment for protocol changes.** No installed app has to keep working
  through them, so the "absent headers" grace release in P1-8 can be dropped.
- **The one-writer protection can be much simpler than F1** (P1-8 to P1-11). A lock covers the
  real risk (a second PC; this has already happened once by mistake, without harm):
  - each install generates a random writer id, kept in `config.json`;
  - the VPS stores the registered id plus `last_ingest_at`;
  - the id is registered **when the snapshot is downloaded**, not on first upload. A PC that
    chose "Start with an empty database" must never register, because its row ids would
    overwrite the VPS's;
  - the snapshot is refused once a writer is registered;
  - ingest rejects any other id;
  - a small `deploy/` script clears the registration when a PC is replaced.

  P1-8's push sequence can be added later, if restoring the factory from an old backup becomes a
  real scenario.
- **Read-only mode is a business decision.** Until the factory is ready it could be switched off
  (`READ_ONLY_MODE=false`), so people can work and VPS reports run again. While it's off, the
  snapshot is refused anyway. Turn it back on immediately before installing at the factory
  (`desktop/README.md`, Switchover step 2).

---

## R4. Suggested order (a recommendation; §1 is unchanged)

**Now (server only, no installer needed)**
1. Nightly `pg_dump` of the VPS database. The `db` container already has `pg_dump`. Add a restore
   drill into a throwaway database, and copy the dumps off the server now and then. This replaces
   the urgent half of P2-5.
2. P5-2 items 1–3: restore `deploy/.env.n8n.example`, delete `/testautodeployment`, drop the two
   dead env keys.

**Before the first factory install (one new installer, VPS deployed first)**
3. The simplified one-writer lock (R3).
4. F2 bad-row quarantine: P1-1 + P1-3, with retry in the desktop app (R1.3).
5. "Last upload from factory" timestamp on the VPS, shown as a banner on the VPS dashboard. On
   12 Oct the server couldn't answer "is the factory uploading?".
6. WhatsApp relay status in the window title (part of P1-5; P1-6 is low priority now that the
   target is set).
7. Faster upload (P2-2), plus one short final upload on quit (a light P2-1).

**At or soon after go-live**
8. Phase 3: reports and digests sent from the VPS (needs D2).
9. P2-4 heartbeat and the n8n watchdog.
10. Backups on the factory PC itself (R1.6).

**Only if more than one PC at the factory must enter data**
11. Phase 4 (P4-1 to P4-5) and the P2-3 status strip. This is a new feature, not hardening; today
    the backend only listens on `127.0.0.1`.

**After its code paths are fixed (R1.8)**
12. P5-1, the non-negative stock rule.

---

## R5. What the plan gets right

- The do-not-change list in §11 matches the code. Every item there is deliberate.
- Its core diagnosis is accurate: one bad row really does stall all sync (any non-schema error
  returns 500 and the same batch is retried every 30 s), and reports really do depend on the
  factory PC being on.
- "VPS first, factory second" is the right deployment order. Note that it also creates the window
  where a new VPS constraint can reject rows from an older factory app, which is exactly what F2
  quarantine protects against.
- The rule "verify by observing, never paste a result you didn't run" is the right standard.

<!-- end of review -->

<!-- ════════════════════════════════════════════════════════════════════════
     END OF THE REVIEW. Everything below is SECTION 3: the owner's agreed
     plan for Offline Setup and extra factory PCs. Nothing above
     this line has been changed.
     ════════════════════════════════════════════════════════════════════════ -->

---
---

# 🧩 SECTION 3 — PLAN: Offline Setup & extra factory PCs

> **Status:** agreed with the owner, 13–15 Oct 2026. **Nothing here is built yet.**
> The factory has not started using the app, so these changes can go in before the first install,
> with no old installs to stay compatible with.
>
> **Builds on:** the one-PC lock (review R3), the "last upload from factory" record (review R4
> item 5) and Phase 4 (P4-1 to P4-4). The plan's §1 status markers are unchanged.

---

## S3.1 Agreed decisions

1. **"Offline Setup"** is a new sidebar section on the online dashboard, for the **Owner only**.
   It **stays in the sidebar permanently**. After the main PC is set up, the same page becomes the
   place to see and manage the offline setup (OS-1).
2. The setup form covers:
   - device type (**main factory PC** or **extra factory PC**);
   - setup name;
   - logo, or "Default";
   - a one-time setup code;
   - a **Download** button for the main PC.
3. There is **one main factory PC** at a time. Replacing it **blocks the old one automatically**.
4. **Extra factory PCs install nothing.** They open the main PC's address in a browser on the
   factory network.
5. **Sync status is visible on both versions:** inside the factory app, and on the online
   dashboard.
6. The **online browser version is view-only, always**, for every role (Owner, Manager, Guest),
   whether the main factory PC is online or not.
7. **All data is entered at the factory**, on the main PC or on extra factory PCs over the factory
   network. Data copies only one way, factory → online.
8. **Out of scope for now:** installing on phones, true two-way sync, and a custom installer
   built per download.

---

## S3.2 Work items

### OS-1 — Offline Setup page (Owner only)
- Sidebar item **Offline Setup**, shown only to the Owner.
- The server refuses every Offline Setup request from anyone else (same pattern as
  Reports/Users, `requireOwner`). Hiding the menu is not the security.
- **The page never disappears.** What it shows depends on whether a main PC is set up yet:

| State | What the Owner sees |
|---|---|
| **No main PC yet** | The setup form (OS-2). |
| **Main PC set up** | An overview of the offline setup, with actions. |

**Overview contents, once a main PC is set up:**
- **Main PC:** its name, when it was set up, and whether it's online now (🟢/🔴), with the time of
  its last upload (OS-5).
- **Setup name and logo:** view and change them. The main PC picks up the change automatically.
- **Extra factory PCs:** the address to open on them (`http://fms-host:48620`).
- **Download installer again:** e.g. to reinstall the same PC.
- **Replace main PC:** creates a new one-time setup code (OS-3). Using it on the new PC blocks the
  old one automatically.

- **Done when:**
  - the Owner sees and uses the page, both before and after the main PC is set up;
  - after setup it shows the overview (not the empty form), with the main PC's live status;
  - a Manager or Guest neither sees it nor gets a response from its endpoints (403).

### OS-2 — Setup form
| Field | Behaviour |
|---|---|
| Device type | "Main factory PC" (one only) or "Extra factory PC" |
| Setup name | Shown in the factory app's title bar and login screen |
| Logo | Upload an image, or choose "Default" |
| One-time setup code | Created on request (OS-3); shown once |
| Replace current main PC | Shown only if a main PC is already registered. Confirming blocks the old PC. |
| Download | Main PC only: one installer for everyone. The app fetches the name and logo on first launch. |
| Extra PC instructions | No download. Show the address `http://fms-host:48620` (or the main PC's fixed number, e.g. `http://192.168.1.20:48620`). |

- **Not included, on purpose:**
  - a download location (a website can't choose where the browser saves);
  - a data-folder choice (moving it risks data loss, plan D1).
  - The installer may still ask where to install the *program*.
- **Done when:** each device type shows the right outcome; name and logo appear on a freshly
  installed main PC.

### OS-3 — One-time setup code
- Generated by the server with a secure random generator, e.g. `K7QM-2XPA`.
- The server stores only a **hash**, an **expiry (~1 hour)** and a **used** flag. The code is
  shown to the Owner once.
- Typed on the new main PC at first launch. If the server confirms it matches, is unexpired and
  is unused, it:
  - marks the code used;
  - registers this PC as the **only** main PC and **blocks the previous one**;
  - allows the data download;
  - issues the PC its own private upload key, plus the setup name and logo.
- Wrong attempts are rate-limited.
- Nobody copies the secret sync key by hand.
- **Done when:**
  - a valid code sets up a PC;
  - a reused, expired or wrong code is refused;
  - after a replacement, the old PC's uploads are refused.

### OS-4 — Read-only exception for Offline Setup only
- The online server stays in read-only mode (`READ_ONLY_MODE=true`) for everything else.
- **Only** the Offline Setup requests, **only from the Owner**, may save: the setup name, logo
  and setup-code records.
- These live in server-only tables, registered in all four places of §3.1:
  - not uploadable by the factory;
  - not copied down to it;
  - no change triggers on them.
- **Done when:** the Owner can save setup settings; every other save still returns
  "This server is view-only".

### OS-5 — Sync status on both versions
- **Factory app:** a status bar inside the app: "Uploaded ✓" / "Waiting: N changes" /
  "Problem". Today it shows only in the window title.
- **Online dashboard:** "Factory last updated X min ago". Green when fresh, amber when stale, red
  when the factory is offline. Today there is none.
- The online dashboard also shows a permanent **"View-only"** label, so nobody expects to edit
  there.
- The online server records the time of every upload (review R4 item 5).
- **Done when:** both bars show; stopping the factory turns the online one amber, then red.

### OS-6 — Extra factory PCs over the factory network
- Phase 4 (P4-1 to P4-4):
  - the main PC runs FMS as a Windows service;
  - it listens on the factory network on port 48620, with the firewall open to the local subnet
    only;
  - it has a fixed network number and the name `fms-host`.
- The database is never reachable from other PCs.
- Extra PCs work directly over the factory network, even when the internet is down. They can't
  connect at all while the main PC is off.
- **Done when:** a second factory PC logs in at `http://fms-host:48620` and can save; the
  database port is refused from that PC.

---

## S3.3 Rules that must always hold

- **One database decides everything:** the main factory PC.
- **Data copies one way only:** factory → online. Nothing travels from the online version back to
  the factory.
- **The online browser version is view-only for every role.** It accepts no business data edits;
  the Owner's Offline Setup saves (OS-4) are the only exception.
- **Only the registered main PC** may upload.
- **The sync/upload key never travels by hand.**
- **The factory database is never exposed** beyond the main PC.
- **Roles are checked by the server on every request**, from any device.

---

## S3.4 Order of work

1. **OS-3** setup code + one-PC lock, and the upload-time record behind OS-5. *(Both versions
   depend on these.)*
2. **OS-1, OS-2, OS-4:** the Offline Setup page, form and read-only exception.
3. **OS-5:** sync status on both versions.
   - **First factory install happens here**, with read-only mode switched on right before it.
4. **OS-6:** extra factory PCs over the factory network.

<!-- end of section 3 -->
