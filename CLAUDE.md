# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

FMS (Factory Management System) — React frontend + Express/PostgreSQL backend, split into two independent apps in `frontend/` and `backend/` (separate `package.json`, no shared root scripts, no monorepo tooling).

## Commands

Run all commands from within `backend/` or `frontend/` respectively — there is no root `package.json`.

**Backend** (`backend/`):
```
npm start              # node server.js — runs on PORT env var, default 5000
npm run migrate        # node-pg-migrate up -m db/migrations
npm run migratedownbro # node-pg-migrate down -m db/migrations
node scripts/initAuth.js  # manual one-off bootstrap for the users table (not run by the server)
```
There is no test suite (`npm test` is a stub that exits 1) and no lint script.

**Frontend** (`frontend/`):
```
npm run dev      # vite dev server
npm run build    # vite build
npm run lint     # eslint .
npm run preview  # preview production build
```

**Env files**: `backend/.env`, root `.env`, and `deploy/.env.n8n` are gitignored, each with a checked-in `.env.example` (`backend/.env.example`, `deploy/.env.n8n.example`) to copy from — `frontend/.env` (`VITE_API_URL`) has no example file, so ask the user for that one. WhatsApp alerts go through n8n (Meta WhatsApp Cloud API), not called directly from the backend — see `backend/services/whatsappService.js` (posts to `N8N_WEBHOOK_URL`) and `n8n/fms-whatsapp-alerts.json`. `deploy/n8n-backup/` holds an older Twilio-based inbound workflow that is not currently deployed; its `BACKEND_WEBHOOK_SECRET`/`N8N_INBOUND_SECRET`/`BACKEND_URL` env vars exist only for that dead workflow and aren't read by any live code.

## Architecture

### Backend: routes → controllers → raw SQL (no ORM)

`backend/server.js` is a flat Express app: it requires every router up front and mounts them all under `/api/*` prefixes (plus `/auth` for auth). There is no central router index — to find where a feature lives, grep `server.js` for the mount path, then follow it into `backend/routes/*.js`, which just wires HTTP verbs straight to static controller methods (e.g. `backend/controllers/SalesController.js`).

Controllers are ES classes with `static async` methods that call `pg` directly via `backend/db/pool.js` (no query builder/ORM). Multi-table writes (creating a sale, recording a payment) use an explicit `client.connect()` / `BEGIN` / `COMMIT` / `ROLLBACK` transaction inside the controller method — see `SalesController.createSale` for the canonical pattern: insert sale → insert `sale_items` → decrement `stock` → insert a proforma `invoices` row → insert `invoice_items` → insert a `customer_ledger` entry, all in one transaction, followed by (outside the transaction) WhatsApp alerts via `services/whatsappService.js` for low stock / new debt.

**Sales and Purchase are deliberately parallel, not shared, modules.** Everything on the sales side (`sales`/`sale_items`/`invoices`/`customer_ledger`/`SalesController`/`InvoiceController`/`CustomerLedgerController`) has a near-identical purchase-side twin (`purchases`/`purchase_items`/`purchase_ledger`/`PurchaseController`/`PurchaseInvoiceController`/`PurchaseLedgerController`), including some naming asymmetry (`customer_ledger.invoice_id` vs `purchase_ledger.purchase_id`, `sale_items.unit_price` vs `purchase_items.price`). When fixing a bug or adding a feature to one side, check whether the mirrored file on the other side needs the same change.

**Two payment paths that do not stay in sync**: `InvoiceController.recordPayment` / `PurchaseInvoiceController.recordPayment` are the real payment flow — they write `payment_records`, update invoice status, and adjust the ledger/balance together. The plain `POST /api/ledger` / `POST /api/purchase-ledger` (`addLedgerEntry`) endpoints only insert a bare ledger row and do **not** touch `payment_records`, invoice status, or balances — using them for an actual payment will desync `outstanding_debt` from the ledger.

`routes/purchase.js` is intentionally double-mounted at both `/api/purchase` and `/api/purchases` (`server.js:58-59`); the frontend only calls the singular form.

### Auth is enforced on all `/api/*` routes

`server.js` mounts `middleware/authMiddleware.js` globally via `app.use('/api', authMiddleware)`, ahead of every router mount — any `/api/*` request without a valid `Authorization: Bearer <token>` gets 401/403 before reaching a controller. `/auth/*` (`register`, `login`, `logout`, `me`) stays public; `/auth/register` and `/auth/login` are additionally rate-limited (`express-rate-limit`, 10 req/15min per IP). On the frontend, every `api/*.js` file imports the shared axios instance from `frontend/src/api/http.js` (as `http` or aliased `api`) — its request interceptor attaches the JWT from `localStorage`. Any new api file must import from `./http` rather than `axios` directly, or its requests will 401. `frontend/src/components/ProtectedRoute.jsx` still does client-side role gating on top of this.

**Role casing landmine**: the `users` table has a DB-level `CHECK` constraint (`users_role_check`) requiring `role` to be exactly `'Owner'` or `'Manager'` (capitalized). `routes/auth.js` and `scripts/initAuth.js` accept/compare role case-insensitively but always store the canonical capitalized form — any other insert path must match that casing or violate the constraint. Frontend role checks (`ProtectedRoute.jsx`, `App.jsx`) lowercase before comparing, so this is invisible client-side.

### NLP search (`/api/nlp`)

`backend/routes/nlp-search.js` sends a hardcoded schema description plus the user's natural-language query to Groq (`llama-3.3-70b-versatile`), takes the SQL it returns, checks the string starts with `SELECT`, and executes it directly against the database. That prefix check is the only safeguard — treat this endpoint as inherently higher-risk than the rest of the API when touching it. The `SCHEMA_CONTEXT` constant in that file is a useful quick reference for the DB schema (tables and columns) if `db/pgdb.sql` isn't handy.

### Frontend structure

- `frontend/src/api/*.js` — one file per resource, thin wrappers around `http.js` (the shared axios instance with the auth-token interceptor — see Auth section above). Naming/shape is inconsistent by design history: some export flat named functions (`invoiceApi.js`, `ledgerApi.js`), others export a single object (`assetApi.js`, `employeeApi.js`, `expenseApi.js`). Match whichever pattern the file already uses rather than introducing a third.
- `frontend/src/components/<Feature>/` — components grouped by business module (`Assets/`, `Employees/`, `Expenses/`, `Purchase/`, `Sales/`), each typically split into `*List.jsx` + `*Form.jsx` (+ modals for create/payment flows).
- Routing is centralized in `frontend/src/App.jsx`: public marketing pages are open routes; everything under `Layout` is wrapped in `<ProtectedRoute allowedRoles={['owner','manager']}>`. `App.jsx` still contains a large commented-out earlier version of itself above the live code — don't mistake it for dead code that needs removing without checking with the user first, and don't extend the commented block instead of the live one below it.

### Known dead/legacy code (still present, not wired up)

These exist on disk but nothing imports or routes to them — useful to know before "fixing" what looks like an orphaned reference, and worth flagging rather than silently building on top of:
- Backend: `controllers/AuthController.js` (stub only, superseded by inline logic in `routes/auth.js`).
- Frontend: `components/AuthCallback.jsx`, `components/Searchbar.jsx` (exports `NLPSearch`, matches the unused pattern of `/api/nlp` not being called from the UI), `components/Sales/Invoices/InvoiceForm.jsx` + `InvoiceList.jsx` + `InvoicePdf.jsx`, `components/Purchase/PInvoices/PInvoiceForm.jsx` + `PInvoiceList.jsx` + `PInvoicePdf.jsx`, `components/Sales/Ledger/Ledger.jsx` and `components/Purchase/PLedger/PLedger.jsx` (superseded by `CustomerLedger.jsx` / `PurchaseLedger.jsx`, which are the live ones routed in `App.jsx`). Note: `InvoiceModal.jsx` and `PInvoiceModal.jsx` (same two folders) are **not** dead — `CustomerLedger.jsx` / `PurchaseLedger.jsx` import and render them directly for the "INVOICES" view.
- Several frontend API files (`invoiceApi.js`, `purchaseInvoiceApi.js`) contain functions with no backing backend route at all (e.g. `deleteCustomer`, `deleteSeller`, `createInvoice`) — check the route file before assuming an exported API function actually works. `invoiceApi.recordPayment` / `purchaseInvoiceApi.recordPayment` **are** wired up (`AddPaymentModal.jsx` / its purchase-side equivalent) — don't assume otherwise without checking.
