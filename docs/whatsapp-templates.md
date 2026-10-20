# WhatsApp alerts as Meta templates

## Why

FMS used to send every alert and report as free-form WhatsApp text. Meta only
delivers free-form text while the **24-hour customer-service window** is open,
meaning the owner sent a message to the business number in the last 24 hours.
Outside that window Meta still answers `200 OK` (so n8n, the factory relay and
the server's scheduler all record it as sent), then drops the message with
error `131047` ("more than 24 hours have passed since the recipient last
replied"). On 2026-10-20 this happened to a New Sale alert and two purchase
alerts. They are gone for good.

**Template** messages are delivered whether or not the window is open. FMS now
sends every message through one approved utility template, `fms_alert`.

## What FMS sends (all of it goes through this one template)

| Sender | Messages |
|---|---|
| `SalesController.createSale` | New Sale, New Outstanding Debt, Low Stock After Sale |
| `PurchaseController` create | New Purchase, New Payable Balance |
| `ExpenseController` create + category-with-amount | New Expense |
| `services/stockAlerts.js` `alertIfNewlyLow` | Low Stock, Low Raw Material |
| `services/sendOnlyScheduler.js` (online server) | daily/weekly/monthly report, daily alert digest (7:30 + 10:00) |
| `ReportsController.sendDailyReportWhatsApp` | "Send today's report" button |
| `n8n/fms-sync-watchdog.json` | sync watchdog problem / cleared |
| factory relay + `routes/whatsappTest.js` | "Send test WhatsApp" |

All of them still post `{ message }` to the n8n webhook, unchanged, including
desktop app 1.0.2. The conversion happens in n8n, so **no desktop release is
needed**. The *Build Meta Request* node in `n8n/fms-whatsapp-alerts.json`:

- uses the first line as the title (`{{1}}`), minus the `*bold*` markers, e.g. `🧾 New Sale`;
- joins the remaining lines into the details (`{{2}}`). Meta rejects newlines, tabs or
  4+ spaces inside a template value, so lines starting with `•` are joined with a space
  and other lines with ` | `;
- keeps the relay's "(Delayed: from …)" note at the start of the details, not as the title;
- splits a long report or digest into parts titled `… (1/3)`, `… (2/3)`, each kept well
  under Meta's 1024-character body limit, and sends them one after another;
- sends a message with only one line (the test message, "watchdog cleared") as title
  `Notice` with that line as the details.

Example: a sale arrives on the phone as

> FMS alert: **🧾 New Sale**
>
> • Customer: Biroo • Items: 3 • Total: Rs.45000 • Advance: Rs.10000 • Invoice: INV-1023
>
> This is an automatic update from your factory management system.

If any part is refused by Meta (template not approved, paused, payment problem),
n8n answers with an error instead of 200. The factory relay then keeps the alert
queued and shows the error in the status bar, and the online scheduler retries
every minute. Nothing is silently dropped at that step. A send that fails half
way through a multi-part report resends from part 1 on the retry, so you might
get a duplicate part, but no part goes missing.

`WHATSAPP_TEMPLATE_NAME` in `deploy/.env.n8n` is the switch. While it is empty,
n8n sends free-form text exactly as before. That is why this change can be
deployed before Meta approves the template.

## Step 1: create the template in WhatsApp Manager (you)

1. Open [business.facebook.com](https://business.facebook.com) → **WhatsApp Manager** →
   pick the WhatsApp Business Account that owns the FMS sender number →
   **Message templates** (under *Account tools*) → **Create template**.
2. **Category:** `Utility`. If it offers a type, choose **Default** (plain text).
3. **Name:** `fms_alert`. This must be exact: lowercase, with an underscore.
4. **Language:** `English`. Its code is `en`. If you pick *English (US)* instead, the code
   is `en_US` and you must use that in step 3 below.
5. **Variable type** (if asked): **Number** (`{{1}}`, `{{2}}`), not *Name*.
6. **Header:** none. **Footer:** none. **Buttons:** none.
7. **Body:** paste exactly this, with the blank lines:

   ```
   FMS alert: *{{1}}*

   {{2}}

   This is an automatic update from your factory management system.
   ```

8. **Sample values** (Meta requires one per variable):
   - `{{1}}`: `New Sale`
   - `{{2}}`: `• Customer: Ali Traders • Items: 3 • Total: Rs.45,000 • Advance: Rs.10,000 • Invoice: INV-1023`
9. **Submit.** Approval usually takes minutes but can take up to 24–48 hours. Wait until
   the template's status is **Active / Approved**.

Also check these in WhatsApp Manager:

- **A payment method must be added** to the WhatsApp Business Account (*Overview* /
  *Payment settings*). Template messages outside the 24-hour window are billed per message
  (utility rate for Pakistan; utility templates sent while the window is open are free).
  Without a payment method Meta refuses templates with error `131042`.
- The access token in `META_WHATSAPP_TOKEN` must belong to the same business account as
  the template. It already does if the current alerts work inside the window.

**If Meta rejects it** or changes the category to *Marketing*: a marketing template still
delivers, but it costs more and Meta can throttle it. Use **Request review** with the
explanation "Transactional notifications about the business owner's own factory
records (sales, purchases, stock levels) sent to the owner's own number." If it
is still refused, the fallback is one template per alert type with fixed wording, for
example `fms_new_sale`: "New sale recorded for {{1}}: total Rs.{{2}}, invoice {{3}}." That
needs a backend change, so ask before going that way.

## Step 2: deploy the n8n change (you run the SSH commands)

Pushing to `main` only pulls the code onto the VPS and rebuilds the backend. The
n8n workflow changes only when `deploy/provision-n8n.sh` runs.

1. Merge the PR into `main`. The GitHub Action pulls the code onto the VPS. This changes
   nothing in n8n yet.
2. On the VPS, put the new workflow live while still sending text, so you can
   check nothing broke:

   ```bash
   cd ~/fms
   git pull --ff-only origin main   # if the Action hasn't already
   grep -q '^WHATSAPP_TEMPLATE_NAME=' deploy/.env.n8n || printf '\nWHATSAPP_TEMPLATE_NAME=\nWHATSAPP_TEMPLATE_LANG=en\n' >> deploy/.env.n8n
   bash deploy/provision-n8n.sh
   ```

   Then press **Send test WhatsApp** in the factory app, or create a test sale, while the
   24-hour window is open (message the business number first). It should arrive as
   before.
3. **Once the template shows Approved**, switch to it:

   ```bash
   cd ~/fms
   sed -i 's/^WHATSAPP_TEMPLATE_NAME=.*/WHATSAPP_TEMPLATE_NAME=fms_alert/' deploy/.env.n8n
   bash deploy/provision-n8n.sh
   ```

4. Test **outside** the window, which is the case that failed before. Don't message the
   business number for more than 24 hours (or test right after the window has lapsed),
   then press **Send test WhatsApp** in the factory app. It should arrive as
   "FMS alert: **Notice** …". If the factory status bar shows an n8n error instead, it
   includes Meta's reason (`132001` = name/language doesn't match an approved template,
   `131042` = payment method).

**Rollback:** set `WHATSAPP_TEMPLATE_NAME=` (empty) and run `bash deploy/provision-n8n.sh`
again. You are back to free-form text.

## Later, once templates work

- The 10:00 AM repeat of the daily digest (`DIGEST_SLOTS` in
  `backend/services/sendOnlyScheduler.js`) only existed as a retry for the 24-hour
  window. With templates it becomes a duplicate (and a second paid message), so it can be
  removed.
- Meta's acceptance (`200`) still isn't proof of delivery. Meta reports the real outcome
  (`sent` / `delivered` / `read` / `failed` + error code) only through its status
  webhooks. Recording those in n8n would make any future undelivered message visible
  instead of silent. That is a separate, optional piece of work.
- The workflow calls Graph API `v21.0`, which Meta removes on 2027-01-21. After that,
  calls are moved to the next version automatically, but it is worth bumping the version
  in `n8n/fms-whatsapp-alerts.json` before then.
