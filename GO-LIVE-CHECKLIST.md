# Go-live checklist — deploy `sync-hardening`, release 1.0.2, first factory install

Companion to `SYNC-HARDENING-PLAN.md`. It puts the remaining **live** checks of T0.1–T1.10 in the
order they can actually be done. Each step names the plan check it settles (e.g. **T1.1-4** =
T1.1, check 4). Paste what you see at each ✍️ into the task's *Evidence* in the plan (or hand it
to Claude to record). A task becomes `DONE` only when all its checks are observed.

**Who:** 🖥 = on the VPS (`ssh myuser@158.220.94.68`, then `cd ~/fms`) · 🌐 = online dashboard
(app.ittefaqbuilder.com) as the Owner · 🏭 = the factory PC · 🪟 = a Windows machine with the repo.

**Ground rules**
- Steps A–D happen while `READ_ONLY_MODE=false`. Step E turns it on, immediately before the install.
- The factory copies the VPS database at install time. Any test row written to the VPS before
  that must be removed (step C ends with a check that it is).
- Registering a PC **blocks the previous one for good**. Never register a test PC after the real
  main PC is set up (T1.1-6 uses a throwaway instance *before* the real install, step E3).
- `POST /sync/register` allows 10 tries per 15 min per IP. Run the 429 test from the VPS, never
  from the factory's internet connection.

**Helpers (🖥, paste once per SSH session):**

```bash
cd ~/fms
API=https://api.ittefaqbuilder.com
vpsql() { sg docker -c "docker compose exec -T db psql -U fms_app -d fms_db -X"; }   # SQL on stdin
newcode() { sg docker -c "docker compose exec -T backend node scripts/createSetupCode.js"; }
```

Usage: `vpsql <<< "SELECT now();"`

---

## A. Before the deploy — backups and read-only off (Phase 0)

- [ ] **A1 · T0.2-1** 🖥 `bash deploy/backup-db.sh` → `backup OK: fms_db-YYYY-MM-DD.dump (…)` and
      the file in `~/fms-backups/`. ✍️
- [ ] **A2 · T0.2-2** 🖥 `bash deploy/backup-db.sh --drill` → a table of row counts and
      `drill OK: … all row counts match fms_db`. ✍️
- [ ] **A3 · T0.2-3** — already observed on a throwaway container (no partial file left when
      `db` is down). Repeat on production only if you accept ~30 s with the database stopped:
      `sg docker -c "docker compose stop db"; bash deploy/backup-db.sh; ls ~/fms-backups | grep partial; sg docker -c "docker compose start db"`
      → `backup FAILED: pg_dump failed`, no `.partial`. ✍️ (or write "accepted from throwaway run")
- [ ] **A4 · T0.2-4** 🖥 `crontab -e`, add `30 2 * * * bash ~/fms/deploy/backup-db.sh`;
      `crontab -l` shows it. On the owner's PC (PowerShell):
      `scp "myuser@158.220.94.68:fms-backups/fms_db-*.dump" D:\fms-backups\` → a dump exists there. ✍️
- [ ] **A5 · T0.1** 🖥 `cp -p backend/.env backend/.env.bak-$(date +%F)`, set
      `READ_ONLY_MODE=false` in `backend/.env`, then `sg docker -c "docker compose up -d backend"`.
  - [ ] **T0.1-1** `sg docker -c "docker compose logs --tail=50 backend" | grep -E "Cron jobs started|READ_ONLY"`
        → `✅ Cron jobs started`, no `🔒 READ_ONLY_MODE`. ✍️
  - [ ] **T0.1-2** 🌐 save something small (e.g. edit a customer's phone and change it back) → saved. ✍️
  - [ ] **T0.1-3** 🖥 `curl -s -o /dev/null -w "%{http_code}\n" -H "X-Sync-Token: $(grep ^SYNC_TOKEN= backend/.env | cut -d= -f2)" $API/sync/snapshot`
        → `409` (old code; after the deploy the same call gives `403` — no key). ✍️

## B. Deploy the branch

- [ ] **B1** Merge `sync-hardening` into `main` (PR or `git merge`), push. Watch the GitHub
      Action "Deploy backend to VPS" go green; Vercel deploys the frontend from `main`.
- [ ] **B2 · T1.10-1 (part)** 🖥
      `vpsql <<< "SELECT name FROM pgmigrations ORDER BY id DESC LIMIT 6;"`
      → `026-sync-heartbeat` … `022-sync-writer` (and `021-gate-passes`). ✍️
- [ ] **B3** 🖥 `sg docker -c "docker compose exec -T backend node -e \"require('sharp'); console.log('sharp ok')\""`
      → `sharp ok` (the logo resizer loads in the Alpine image).
- [ ] **B4 · T0.3-1** 🖥 `curl -s -o /dev/null -w "%{http_code}\n" $API/testautodeployment` → `404`. ✍️
- [ ] **B5** 🖥 `sg docker -c "docker compose logs --tail=80 backend"` → no `⚠️⚠️⚠️ N8N_PUBLIC_WEBHOOK_URL`
      warning (it is set), no crash loop; `docker compose ps backend` → `Up`.

## C. Live server checks before any factory install (`READ_ONLY_MODE=false`)

### T1.1 — setup code and the one-PC lock (curl "test PC")

- [ ] **C1 · T1.1-1** 🖥 `newcode` → `Setup code: XXXX-XXXX`. Then
      `vpsql <<< "SELECT code_hash, expires_at, used_at FROM setup_code ORDER BY id DESC LIMIT 1;"`
      → a 64-character hash, expiry in 1 h, `used_at` empty; the code itself appears nowhere. ✍️
- [ ] **C2 · T1.1-2** 🖥 register a test PC with that code:
      ```bash
      CODE=XXXX-XXXX
      curl -s -X POST -H 'content-type: application/json' \
        -d "{\"code\":\"$CODE\",\"writer_id\":\"$(cat /proc/sys/kernel/random/uuid)\"}" $API/sync/register | tee /tmp/reg.json
      KEY=$(sed 's/.*"uploadKey":"\([^"]*\)".*/\1/' /tmp/reg.json)
      vpsql <<< "SELECT writer_id, registered_at FROM sync_writer;"
      ```
      → JSON with `uploadKey`; `sync_writer` shows the writer id and time. ✍️
- [ ] **C3 · T1.1-3** 🖥 same `$CODE` again → `401 … wrong, already used, or expired`; a made-up
      code → `401`; then 11 wrong codes:
      `for i in $(seq 11); do curl -s -o /dev/null -w "%{http_code} " -X POST -H 'content-type: application/json' -d '{"code":"AAAA-AAAA","writer_id":"6f1c2e1a-0000-4000-8000-000000000000"}' $API/sync/register; done`
      → ends in `429`. Expired: `newcode`, then
      `vpsql <<< "UPDATE setup_code SET expires_at = now() - interval '1 minute' WHERE used_at IS NULL;"`,
      register with it → `401`. ✍️ (The 429 lasts 15 min for this IP only.)
- [ ] **C4 · T1.1-4** 🖥 a change that must NOT be applied:
      ```bash
      BODY='{"changes":[{"id":1,"table_name":"customers","op":"I","row_data":{"id":999999,"name":"ZZ must not exist"}}]}'
      curl -s -w " %{http_code}\n" -X POST -H 'content-type: application/json' -d "$BODY" $API/sync/ingest
      curl -s -w " %{http_code}\n" -X POST -H 'content-type: application/json' -H "X-Upload-Key: $(printf '0%.0s' {1..64})" -d "$BODY" $API/sync/ingest
      vpsql <<< "SELECT count(*) FROM customers WHERE id = 999999;"
      ```
      → both `403 {"code":"WriterNotRegistered",…}`; count `0`. ✍️
- [ ] **C5 · T1.1-5 (409 half)** 🖥 `curl -s -w " %{http_code}\n" -H "X-Upload-Key: $KEY" $API/sync/snapshot`
      → `409 Turn on READ_ONLY_MODE=true…`. (The 403 half is E1.) ✍️

### T1.2 — Offline Setup page (🌐)

- [ ] **C6 · T1.2-1 (before)** 🌐 Owner: sidebar **Offline Setup** → the overview (the curl test
      PC from C2 counts as a main PC; it will be replaced in E). Click **Set up an extra PC** →
      the form. ✍️ (what you see)
- [ ] **C7 · T1.2-2** 🌐 log in as a Manager and as a Guest → no Offline Setup in the sidebar;
      `/offline-setup` sends them away. Optional proof of the server side: in the browser
      devtools console as Manager,
      `fetch('https://api.ittefaqbuilder.com/api/offline-setup',{headers:{Authorization:'Bearer '+localStorage.token}}).then(r=>r.status)`
      → `403`. ✍️
- [ ] **C8 · T1.2-3** 🌐 Owner, form: **Main factory PC** → name + logo + setup code + installer
      steps; **Extra factory PC** → no download, `http://fms-host:48620`. With a main PC present,
      **Create one-time setup code** stays disabled until "Replace the current main PC" is ticked.
      (Don't create a code here.) ✍️
- [ ] **C9 · T1.2-4** 🌐 Upload a non-image renamed to `.png` → "The logo must be a PNG or JPG
      image."; a JPG over 1 MB → "The logo must be 1 MB or smaller."; a real logo → shown
      shrunk. ✍️

### T1.3 — a bad row is set aside (curl, cleaned up after)

- [ ] **C10 · T1.3-1…4** 🖥
      ```bash
      vpsql <<< "INSERT INTO products (id, name, type, size) VALUES (999001, 'ZZ Sync Test', 'stock', 'test');"
      BODY='{"changes":[
        {"id":901,"table_name":"customers","op":"I","row_data":{"id":999901,"name":"ZZ Sync Test A"}},
        {"id":902,"table_name":"products","op":"I","row_data":{"id":999002,"name":"ZZ Sync Test","type":"stock","size":"test"}},
        {"id":903,"table_name":"customers","op":"I","row_data":{"id":999902,"name":"ZZ Sync Test B"}}]}'
      curl -s -w " %{http_code}\n" -X POST -H 'content-type: application/json' -H "X-Upload-Key: $KEY" -d "$BODY" $API/sync/ingest
      vpsql <<< "SELECT table_name, op, code, constraint_name, detail FROM sync_rejected ORDER BY id DESC LIMIT 5;"
      vpsql <<< "SELECT id, name FROM customers WHERE id IN (999901, 999902);"
      ```
      → `200 {"applied":2,"accepted":[901,903],"rejected":[{"id":902,…"code":"23505"…}]}`; exactly
      one `sync_rejected` row `products | I | 23505 | products_name_type_size_idx`; both test
      customers present. ✍️
- [ ] **C11 · T1.3-5** 🖥 note `vpsql <<< "SELECT count(*) FROM sync_rejected;"`, then
      ```bash
      curl -s -w " %{http_code}\n" -X POST -H 'content-type: application/json' -H "X-Upload-Key: $KEY" \
        -d '{"changes":[{"id":904,"table_name":"customers","op":"Z","row_data":{"id":999903}}]}' $API/sync/ingest
      ```
      → `409 {"error":"unknown op \"Z\""}`; count unchanged. ✍️

### T1.5 — heartbeat reaches the server (curl)

- [ ] **C12** 🖥 `curl -s -X POST -H 'content-type: application/json' -H "X-Upload-Key: $KEY" -d '{"sync_state":"ok","outbox_count":0}' $API/sync/heartbeat`
      → `{"ok":true}`; 🌐 the bar at the top reads "VIEW-ONLY · Factory last updated just now".

### Clean up every test row before the install

- [ ] **C13** 🖥
      ```bash
      curl -s -X POST -H 'content-type: application/json' -H "X-Upload-Key: $KEY" -d '{"changes":[
        {"id":905,"table_name":"customers","op":"D","row_data":{"id":999901}},
        {"id":906,"table_name":"customers","op":"D","row_data":{"id":999902}}]}' $API/sync/ingest
      vpsql <<< "DELETE FROM products WHERE id = 999001;"
      vpsql <<< "SELECT (SELECT count(*) FROM customers WHERE name LIKE 'ZZ %') AS customers,
                        (SELECT count(*) FROM products  WHERE name LIKE 'ZZ %') AS products;"
      ```
      → `0 | 0`. Keep `$KEY` for E1. (`sync_rejected` / `sync_heartbeat` / `setup_code` are
      VPS-only and never copied to the factory; the real registration clears the heartbeat.)

## D. Build installer 1.0.2 (🪟, FMS app closed)

- [ ] **D1** `git pull` on `main`; in `desktop/`: `npm ci` (installs the Windows builds of
      Postgres, sharp, Electron).
- [ ] **D2 · T1.10-1 (rule 10)** `npm test` → `tests 18 / pass 18 / fail 0`. ✍️ paste the summary.
- [ ] **D3** Set `"version": "1.0.2"` in `desktop/package.json`, commit + push
      ("Release 1.0.2"), then `npm run dist` → `dist/FMS-Setup-1.0.2.exe`, `.blockmap`, `latest.yml`.
- [ ] **D4** Upload (PowerShell, in `desktop/`), `latest.yml` last:
      `scp dist/FMS-Setup-1.0.2.exe dist/FMS-Setup-1.0.2.exe.blockmap dist/latest.yml myuser@158.220.94.68:~/fms/downloads/`
      → https://api.ittefaqbuilder.com/downloads shows version 1.0.2. ✍️

## E. Go-live (same sitting — a setup code and the snapshot both expire after 1 hour)

- [ ] **E1 · T1.10 step 3 / D5** 🖥 `READ_ONLY_MODE=true` in `backend/.env`,
      `sg docker -c "docker compose up -d backend"`. Then:
  - **T1.1-5 (403 half)** — the curl key from C2 is over an hour old by now:
    `curl -s -w " %{http_code}\n" -H "X-Upload-Key: $KEY" $API/sync/snapshot`
    → `403 {"code":"SnapshotWindowClosed",…}`. ✍️ (If C2 was under an hour ago, wait.)
  - **T1.2-5** 🌐 Owner changes the setup name → saved; 🌐 any other save (e.g. a customer edit)
    → "This server is view-only. Enter data in the FMS app at the factory." ✍️
- [ ] **E2 · T1.10 step 4** 🌐 Offline Setup → set the real setup name and logo.
- [ ] **E3 · T1.1-6 — throwaway test instance first** 🏭
  1. Install FMS 1.0.2 from `/downloads` (normal install), but **don't start it from the shortcut**.
  2. 🌐 **Replace main PC…** → tick the box → create code **A**.
  3. 🏭 `Win+R`: `"C:\Program Files\FMS\FMS.exe" --user-data-dir=C:\fms-test` (adjust the path
     if installed elsewhere). Check `C:\fms-test\config.json` gets created — if it doesn't, the
     flag isn't honoured: close it, skip E3 and note "T1.1-6 not run". Enter code **A** → data
     copied, status bar green. **Make no changes in it.** Close it.
  4. 🌐 Replace main PC → create code **B** (keep it for E4; it's valid 1 h).
- [ ] **E4 · T1.10 step 5** 🏭 start FMS normally (desktop shortcut) → enter code **B** →
      "copies all server data" → log in with the usual accounts. Title bar and login screen show
      the setup name and logo (**T1.2-6** ✍️). Status bar green "Uploaded ✓". Close FMS.
- [ ] **E5 · T1.1-6 (finish)** 🏭 start the test instance again (step E3.3 command), change one
      thing (e.g. a customer's phone) → within a few seconds the status bar is red "Not
      uploading … This PC is no longer the registered main PC" — not "Offline". 🖥 the change is
      **not** on the VPS. ✍️ Close it and delete `C:\fms-test` (it holds a full copy of the data).
- [ ] **E6** 🏭 start FMS normally; keep it running from now on.
- [ ] **E7 · T1.10-2** 🏭 make a real sale → 🖥 `vpsql <<< "SELECT id, created_at FROM sales ORDER BY id DESC LIMIT 1;"`
      shows it within ~3 s; factory status green. ✍️
- [ ] **E8 · T1.10-3** 🌐 the bar shows green "Factory last updated just now" and "View-only". ✍️
- [ ] **E9 · T1.10-4** on any other PC: install, enter no code → can't continue; enter code **B**
      (used) → "That setup code is wrong, already used, or expired". Close without registering. ✍️

## F. After go-live, with the real main PC

### T1.9 — upload speed and quitting

- [ ] **F1 · T1.9-1** 🏭 a sale → on the VPS (E7 query) within ~3 s. ✍️
- [ ] **F2 · T1.9-2** 🏭 one sale writes ~6 rows (sale, items, stock, invoice, invoice items,
      ledger) → `%APPDATA%\FMS\logs\fms.log` shows **one** `sync: pushed N change(s)` line for it,
      not a line per row. Then several sales in quick succession → fewer `pushed` lines than
      sales (writes within 2 s of each other share a push). ✍️ (Five separate writes inside 2 s →
      `pushed 5 change(s)` was observed in `npm test`; by hand the UI is slower than 2 s.)
- [ ] **F3 · T1.9-3** 🏭 a write, then close FMS at once → the log ends with
      `sync: final upload before quit — everything uploaded`; the row is on the VPS. ✍️
- [ ] **F4 · T1.9-4 / T1.5-2 (amber)** 🏭 unplug the network / Wi-Fi off. A write → status bar
      "Waiting: 1 change". After 5 min it turns amber ("No internet — changes are waiting") ✍️.
      Close FMS → log `… 1 change(s) left for next start`. Reconnect, start FMS → it drains, green. ✍️

### T1.5 — heartbeat and the online bar

- [ ] **F5 · T1.5-1** 🏭 browser on the factory PC: http://127.0.0.1:48620/status → JSON with
      `state, lastSyncedAt, outboxCount, oldestOutboxAge, quarantineCount, relayState,
      whatsappQueued, oldestWhatsappAge, tablesWithoutPk` (+ `level`, `problems`). ✍️
- [ ] **F6 · T1.5-3** 🖥 `vpsql <<< "SELECT received_at, outbox_count FROM sync_heartbeat;"` twice,
      ~1 min apart → `received_at` moves on. ✍️
- [ ] **F7 · T1.5-4** close FMS at the factory → 🌐 after 2 min the bar is amber, after 30 min red
      "Factory offline". ✍️ Start FMS again → green within a minute.
- (**T1.5-2 red** is covered by E5 and F8.)

### T1.3 / T1.4 — a refused change, end to end (cleans up after itself)

- [ ] **F8 · T1.4-1/2/3, T1.3-2/3/4, T1.5-2 (red)**
      🖥 `vpsql <<< "INSERT INTO products (id, name, type, size) VALUES (999001, 'ZZ Sync Test', 'stock', 'test');"`
      🏭 create a stock product named `ZZ Sync Test`, size `test` → within seconds the status bar
      is red "1 change was refused by the online server — see Sync issues"; **Sync issues** lists
      it ("Already exists on the online server (duplicate)"). Other work still uploads (a sale →
      on the VPS). 🖥 `vpsql <<< "SELECT table_name, op, code FROM sync_rejected ORDER BY id DESC LIMIT 1;"`
      → `products | I | 23505`. ✍️
- [ ] **F9 · T1.4-4** 🏭 restart FMS → 🖥 `vpsql <<< "SELECT count(*) FROM sync_rejected;"`
      unchanged (not re-sent). ✍️
- [ ] **F10 · T1.4-5** 🏭 an ordinary sale → uploads; Sync issues still shows 1. ✍️
- [ ] **F11 · T1.4-6** 🖥 `vpsql <<< "DELETE FROM products WHERE id = 999001;"` → 🏭 Sync issues →
      **Retry** → within seconds the factory's `ZZ Sync Test` is on the VPS; Sync issues empty;
      status green. 🖥 `vpsql <<< "SELECT resolved_at FROM sync_rejected ORDER BY id DESC LIMIT 2;"`
      → set. ✍️
- [ ] **F12** 🏭 delete the `ZZ Sync Test` product → 🖥 gone from `products` on the VPS too.

### T1.6 / T1.7 / T1.8 — WhatsApp (temporarily changes the VPS config; alerts are off meanwhile)

- [ ] **F13 · T1.7-3, T1.6-1, T1.7-1, T1.8-1** 🖥 comment out `N8N_PUBLIC_WEBHOOK_URL` in
      `backend/.env`, `sg docker -c "docker compose up -d backend"`; `docker compose logs backend`
      → the `⚠️⚠️⚠️ N8N_PUBLIC_WEBHOOK_URL is not set` line once, container `Up` ✍️.
      🏭 restart FMS (it reads the config at start) → `fms.log`: `config: WhatsApp alerts not
      configured on the server (N8N_PUBLIC_WEBHOOK_URL unset)` ✍️. Reports → **Send Today's
      Report** → "queued on this PC…". Within 5 min `fms.log` has `ERROR alerts: … no_target …` ✍️;
      Sync issues → WhatsApp card "Not set up on the online server (N8N_PUBLIC_WEBHOOK_URL unset)",
      Waiting to send 1, still 1 after 10 min ✍️. **Send test WhatsApp** → "Not sent.
      N8N_PUBLIC_WEBHOOK_URL unset" ✍️.
- [ ] **F14 · T1.6-2, T1.8-2** 🖥 set `N8N_PUBLIC_WEBHOOK_URL=https://n8n.ittefaqbuilder.com/webhook/fms-alert-wrong`,
      restart backend; 🏭 restart FMS → within 30 s the card shows "Refused by WhatsApp (n8n replied
      404: …)", the report still waiting; `fms.log` has n8n's reply ✍️. **Send test WhatsApp** →
      "Not sent." + n8n's reply ✍️. (Stricter T1.8-2: put a wrong Meta token in the n8n credential
      instead → the button shows `{"message":"Error in workflow"}` — n8n does not pass Meta's text
      through. Restore the token.)
- [ ] **F15 · T1.6-3, T1.8-3** 🖥 restore the real `N8N_PUBLIC_WEBHOOK_URL`, restart backend; 🏭
      restart FMS → the queued report arrives on the owner's WhatsApp, Waiting to send 0, "Working"
      ✍️. **Send test WhatsApp** → "Sent" and the test message arrives ✍️.
- [ ] **F16 · T1.6-4** expiry → `whatsapp_dead`: observed on the real relay with a 30 s limit
      (plan evidence). Repeating it live needs a code change; write "accepted from relay run" unless
      you want a special build.

## G. Close out

- [ ] **G1** Paste every ✍️ into the plan's evidence sections and set each task's status:
      `DONE` where all checks are observed, otherwise `CODE DONE, CHECKS FAILING` with what's left.
- [ ] **G2** Ledger: T1.10 `DONE` → Phase 1 exit met. Phase 2 starts with T2.1 (VPS send-only
      report scheduler) — until then reports and digests depend on the factory PC being on at that
      minute (F12 in the plan).
- [ ] **G3** Delete `C:\fms-test` if E3 was run (E5), and `~/fms/backend/.env.bak-*` once happy.

**If the deploy goes wrong (B):** `git revert` the merge on `main` and push — the Action
redeploys the previous backend. Migrations 022–026 only add tables, so the old code runs fine
with them in place; don't roll them back.
