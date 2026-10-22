# WhatsApp alerts: getting them delivered

## The problem

FMS sends every alert and report as free-form WhatsApp text, through n8n and Meta's
WhatsApp Cloud API. Meta only delivers free-form text while the **24-hour
customer-service window** is open: the owner must have sent a message to the business
number in the last 24 hours. Outside that window, Meta still answers `200 OK`, so n8n,
the factory relay and the server's scheduler all record the message as sent. Meta then
drops it with error `131047` ("more than 24 hours have passed since the recipient last
replied"). On 2026-10-20 this happened to a New Sale alert and two purchase alerts, and
on 2026-10-22 to the day's report. Until now, alerts lost like this were gone for good.

There are two ways around it:

| | Free tier (now) | Templates (later, paid) |
|---|---|---|
| Cost | Free, up to Meta's 1,000 free service messages a month per number | About Rs 4 per message (Pakistan utility rate $0.015 since 2026-10-01), billed in USD to a card |
| Alerts outside the window | Kept, and resent the moment the owner sends any message to the business number | Delivered straight away |
| Needs | The setup below (n8n + Meta webhook) | The same, plus an approved template and a payment method |

Both are in the code. Which one is used depends on `deploy/.env.n8n`:
`META_STATUS_WEBHOOK_SECRET` turns on the free-tier resend, and `WHATSAPP_TEMPLATE_NAME`
turns on templates.

## Free tier: missed alerts come back when the owner writes

### What the owner sees

- Inside the 24-hour window, alerts arrive as before.
- Outside it, they don't arrive yet. When the owner sends **any** message to the business
  number (for example "hi"), every alert missed in the last 7 days comes back at once,
  oldest first. Each one starts with when it was first sent:

  > (Missed: first sent 22 Oct, 7:30 am)
  > 📋 *FMS Daily Alerts* (7:30 AM)
  > …

- If nothing was missed, the reply is "✅ FMS: no missed alerts. New alerts reach this chat
  for the next 24 hours." It is sent at most once every 6 hours, so chatting with the
  number doesn't trigger it again and again.
- **Best habit:** message the business number every morning. The window then stays open
  nearly all the time, and anything that slipped through comes back with that message.

### How it works

- Every message n8n sends is saved in the VPS table `whatsapp_messages` (migration 029),
  together with Meta's message id. The *Remember sent* node in
  `n8n/fms-whatsapp-alerts.json` does this.
- Meta reports what happened to each message (`sent`, `delivered`, `read`, `failed` with a
  reason) to a webhook. `n8n/fms-whatsapp-status.json` receives those reports and records
  them on the same row:
  - a status only moves forward, so Meta's repeats (it retries for up to 7 days) and
    late or out-of-order reports change nothing;
  - statuses for other numbers on the account are ignored.
- The same webhook tells n8n when the owner writes. n8n then claims every `failed` row of
  the last 7 days that hasn't been resent, 30 at a time, and sends them again. Claiming
  them marks them in one step, so two quick messages never resend the same alert twice.
- The table is VPS-only. It is never synced, and it is left out of the factory snapshot
  (`SyncController` `PROTECTED_TABLES` / `VPS_ONLY_TABLES`, desktop `EXCLUDED_TABLES`).
- n8n keeps a run for every report Meta sends (*FMS WhatsApp Delivery Status* →
  *Executions* at `https://n8n.ittefaqbuilder.com`). To see what was missed, run this on
  the VPS:

  ```bash
  cd ~/fms && sg docker -c "docker compose exec -T db psql -U fms_app -d fms_db -c \"SELECT sent_at AT TIME ZONE 'Asia/Karachi' AS sent, title, status, left(error, 60) AS error, resent_at IS NOT NULL AS resent FROM whatsapp_messages ORDER BY sent_at DESC LIMIT 20;\""
  ```

### Limits

- **1,000 free service messages a month.** Free-form messages (alerts and the resends)
  count against Meta's 1,000 free service messages per number per month. A busy month can
  go over that. Without a payment method, everything past 1,000 is not delivered (Meta
  reports it as failed). It is still resent when the owner writes, but it will fail
  again until the next month.
- Only the last 7 days are resent, and 30 per message from the owner. If there are more,
  the 30th is followed by "(That was 30 missed alerts; send another message for the
  rest.)".
- A status that arrives before n8n saved the message is still recorded, but that
  message can't be resent because its text was never saved. In tests this needed a
  status within milliseconds of the send.

### Set it up (you run the commands)

Pushing to `main` deploys the backend (the GitHub Action pulls the code, rebuilds the
backend container, and migrations run when it starts). n8n only changes when you run
`deploy/provision-n8n.sh` on the VPS.

1. **Merge the PR.** The Action pulls the code and the backend container start creates the
   `whatsapp_messages` table. The factory app needs no update.
2. **On the VPS**, check the code is there, add a secret, and provision:

   ```bash
   cd ~/fms
   git pull --ff-only origin main
   grep -q '^WHATSAPP_TEMPLATE_NAME=' deploy/.env.n8n || printf '\nWHATSAPP_TEMPLATE_NAME=\nWHATSAPP_TEMPLATE_LANG=en\n' >> deploy/.env.n8n
   grep -q '^META_STATUS_WEBHOOK_SECRET=.' deploy/.env.n8n || { sed -i '/^META_STATUS_WEBHOOK_SECRET=/d' deploy/.env.n8n; echo "META_STATUS_WEBHOOK_SECRET=$(openssl rand -hex 24)" >> deploy/.env.n8n; }
   bash deploy/provision-n8n.sh
   ```

   The provisioner reads the database password from the root `.env` (`POSTGRES_PASSWORD`)
   and creates an n8n credential *FMS Postgres* from it. It ends by printing
   `Callback URL: …/webhook/meta-status/…` and `Verify token: …`. Treat the URL like a
   password: anyone who has it can post fake statuses to it. If the URL doesn't start with
   `https://n8n.ittefaqbuilder.com/` (that comes from `WEBHOOK_URL` in
   `deploy/.env.n8n`), use that domain with the same `/webhook/meta-status/…` path.
3. **In Meta**, open [developers.facebook.com/apps](https://developers.facebook.com/apps) → the
   app whose token FMS uses → **WhatsApp** → **Configuration**. If the app was set up with
   the "Connect with customers through WhatsApp" use case, go to **Use cases → Customize →
   Configuration** instead.
4. Under **Webhook**, choose **Edit**, paste the **Callback URL** and the **Verify token**,
   then choose **Verify and save**. Meta calls the URL once right then and n8n answers. If
   Meta says the URL couldn't be validated, check:
   - the provisioner printed the URL;
   - *FMS WhatsApp Delivery Status* is active in n8n;
   - nothing extra (a space, a line break) was pasted with the URL.
5. Under **Webhook fields**, choose **Manage** and **Subscribe** to `messages`. This one field
   carries both delivery statuses and the owner's messages.
6. Make sure the app is **Live**, not in Development mode (the toggle at the top of the app
   dashboard). Meta doesn't send some webhooks to apps in Development mode.
7. **Test:**
   1. From the owner's phone, send "hi" to the business number. The reply is either the
      missed alerts or "✅ FMS: no missed alerts…".
   2. Press **Send test WhatsApp** in the factory app.
   3. In n8n → *Executions* for *FMS WhatsApp Delivery Status*, runs for `sent`,
      `delivered` and `read` should appear within a minute.

   If nothing reaches n8n, the business account may not be subscribed to the app yet.
   Run this once, with the account ID from WhatsApp Manager → *Account tools* → *Phone
   numbers* / *Overview*:

   ```bash
   curl -X POST "https://graph.facebook.com/v21.0/<WHATSAPP_BUSINESS_ACCOUNT_ID>/subscribed_apps" -H "Authorization: Bearer <META_WHATSAPP_TOKEN>"
   ```

**Switch it off:** in Meta, unsubscribe from `messages`, and deactivate *FMS WhatsApp
Delivery Status* in n8n. Removing the secret from `deploy/.env.n8n` and re-running the
provisioner takes *Remember sent* out of the alerts workflow, but it leaves the
already-deployed status workflow as it is.

## What FMS sends

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

All of them post `{ message }` to the n8n webhook, unchanged, including desktop app
1.0.2. Everything in this document happens in n8n and on the VPS, so **no desktop
release is needed**. Every request carries `"<title> @ <time>"` as Meta's
`biz_opaque_callback_data`, and Meta hands it back with the status.

## Templates (later, paid)

**Template** messages are delivered whether or not the window is open. With
`WHATSAPP_TEMPLATE_NAME` set, every message goes out through one approved utility
template, `fms_alert`. The *Build Meta Request* node:

- uses the first line as the title (`{{1}}`), minus the `*bold*` markers, e.g. `🧾 New Sale`;
- joins the remaining lines into the details (`{{2}}`). Meta rejects newlines, tabs or
  4+ spaces inside a template value, so lines starting with `•` are joined with a space and
  other lines with ` | `;
- keeps a "(Delayed: …)" or "(Missed: …)" note at the start of the details, not as the
  title;
- splits a long report or digest into parts titled `… (1/3)`, `… (2/3)`, each kept well
  under Meta's 1024-character body limit, and sends them one after another;
- sends a message with only one line (the test message, "watchdog cleared") as title
  `Notice` with that line as the details.

A sale then arrives as:

> FMS alert: **🧾 New Sale**
>
> • Customer: Biroo • Items: 3 • Total: Rs.45000 • Advance: Rs.10000 • Invoice: INV-1023
>
> This is an automatic update from your factory management system.

**Failure notices.** With templates, a failure is rare: no payment method, a paused
template, a phone offline for weeks. For each alert that fails anyway, the status
workflow sends one notice, also as the template:

> FMS alert: **❌ WhatsApp alert not delivered**
>
> • 🧾 New Sale (sent 20 Oct, 8:56 pm): Re-engagement message: Message failed to send …
> (131047) | Open FMS to see what it said.

- Other parts of the same report are reported once per 30 minutes.
- A notice that itself fails never triggers another, so a problem that stops every
  message can't start a loop.

On the free tier no notice is sent, because it would be dropped for the same 24-hour
reason. The resend covers that case.

If Meta refuses a template send (not approved, paused, payment), n8n answers with an
error instead of 200. The factory relay keeps the alert queued and shows the error in
the status bar, and the online scheduler retries every minute. If a multi-part report
fails half way, the retry starts again from part 1, so you might get a duplicate part
but never a missing one.

### Step A: create the template in WhatsApp Manager

1. Open [business.facebook.com](https://business.facebook.com) → **WhatsApp Manager** → pick
   the WhatsApp Business Account that owns the FMS sender number → **Message templates**
   (under *Account tools*) → **Create template**.
2. **Category:** `Utility`. If it offers a type, choose **Default** (plain text).
3. **Name:** `fms_alert`. This must be exact: lowercase, with an underscore.
4. **Language:** `English`. Its code is `en`. If you pick *English (US)* instead, the code is
   `en_US` and you must use that as `WHATSAPP_TEMPLATE_LANG`.
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
9. **Submit.** Approval usually takes minutes but can take up to 24–48 hours.

Also:

- **Add a payment method** to the WhatsApp Business Account. Without one, Meta refuses
  templates with error `131042`.
- The token in `META_WHATSAPP_TOKEN` must belong to the same business account as the
  template. It does if alerts already arrive inside the window.

**If Meta rejects it** or changes the category to *Marketing*: a marketing template still
delivers, but it costs more and Meta can throttle it. Use **Request review** with
"Transactional notifications about the business owner's own factory records (sales,
purchases, stock levels) sent to the owner's own number." If it is still refused, the
fallback is one template per alert type with fixed wording (for example `fms_new_sale`:
"New sale recorded for {{1}}: total Rs.{{2}}, invoice {{3}}."). That needs a backend
change.

### Step B: switch to it

Once the template shows **Active / Approved** and a payment method is added:

```bash
cd ~/fms
sed -i 's/^WHATSAPP_TEMPLATE_NAME=.*/WHATSAPP_TEMPLATE_NAME=fms_alert/' deploy/.env.n8n
bash deploy/provision-n8n.sh
```

Test outside the window: don't message the business number for more than 24 hours, then
press **Send test WhatsApp** in the factory app. It should arrive as "FMS alert:
**Notice** …". If the factory status bar shows an n8n error instead, it includes Meta's
reason:
- `132001`: the name or language doesn't match an approved template;
- `131042`: payment method.

**Rollback:** set `WHATSAPP_TEMPLATE_NAME=` (empty) and run `bash deploy/provision-n8n.sh`
again.

## Later

- With templates, the 10:00 AM repeat of the daily digest (`DIGEST_SLOTS` in
  `backend/services/sendOnlyScheduler.js`) becomes a duplicate paid message and can be
  removed. On the free tier it is still useful: it is a second chance inside the window.
- The workflow calls Graph API `v21.0`, which Meta removes on 2027-01-21. After that,
  calls are moved to the next version automatically, but it is worth bumping the version
  in `n8n/fms-whatsapp-alerts.json` before then.
