## Route Map

**Entry:** `backend/server.js` mounts routers under these prefixes:

| Prefix | Router | Controller |
|---|---|---|
| `/auth` | `routes/auth.js` | inline (no controller) |
| `/api/invoices` | `routes/invoices.js` | `InvoiceController.js` |
| `/api/stock` | `routes/stock.js` | `StockController.js` |
| `/api/ledger` | `routes/ledger.js` | `CustomerLedgerController.js` |
| `/api/expenses` | `routes/expenses.js` | `ExpenseController.js` |
| `/api/assets` | `routes/assets.js` | `AssetController.js` |
| `/api/employees` | `routes/employees.js` | `EmployeeController.js` |
| `/api/sales` | `routes/sales.js` | `SalesController.js` |
| `/api/purchase` **and** `/api/purchases` (same router double-mounted, `server.js:58-59`) | `routes/purchase.js` | `PurchaseController.js` |
| `/api/sellers` | `routes/sellers.js` | `SellersController.js` |
| `/api/purchase-invoices` | `routes/purchaseInvoices.js` | `PurchaseInvoiceController.js` |
| `/api/purchase-ledger` | `routes/purchaseLedger.js` | `PurchaseLedgerController.js` |
| `/api/customers` | `routes/customers.js` | `CustomersController.js` |
| `/api/production` | `routes/production.js` | `ProductionController.js` |
| `/api/nlp` | `routes/nlp-search.js` | inline (LLM→SQL) |

**Endpoints** (method — path — handler):

```
Auth:            POST /auth/register, POST /auth/login, POST /auth/logout, GET /auth/me
Invoices:        GET /api/invoices, GET /pending/list, POST /payment, GET /customer/:customer_id,
                 GET /number/:invoice_no, GET /:id
Stock:           GET /, GET /search, GET /:id, POST /, PUT /:id, DELETE /:id
Ledger (cust.):  GET /summary/all, GET /debts/outstanding, GET /customer/:customer_id, GET /, POST /
Expenses:        GET /, GET /summary, GET /categories, GET /:id, POST /, PUT /:id, DELETE /:id
Assets:          GET /, GET /summary, GET /categories, GET /:id, POST /, PUT /:id, DELETE /:id
Employees:       GET /, GET /summary, GET /types, GET /:id, POST /, PUT /:id, DELETE /:id
Sales:           GET /dashboard/data, POST /, GET /, GET /summary/today, GET /recent/list,
                 GET /:id, PUT /:id/status
Purchase:        (same 7 routes as Sales, mounted at both /api/purchase and /api/purchases)
Sellers:         GET /search, GET /:id, GET /, POST /, PUT /:id, DELETE /:id
Purchase-Inv.:   GET /, GET /pending/list, POST /payment, GET /seller/:seller_id,
                 GET /number/:invoice_no, GET /:id
Purchase-Ledger: GET /summary/all, GET /debts/outstanding, GET /seller/:seller_id, GET /, POST /
Customers:       GET /search, GET /:id, GET /, POST /, PUT /:id, DELETE /:id
Production:      GET /stats/overview, GET /today/schedule, POST /, GET /, GET /:id, PUT /:id/status
NLP:             POST /nlp-search
```

Frontend routes (`frontend/src/App.jsx`): `/`, `/about`, `/services`, `/specialities`, `/feedback`, `/contact`, `/dashboard`, `/analytics`, `/stock`, `/ledger`, `/purchase-ledger`, `/production`, `/expenses`, `/assets`, `/employees`. No `/invoices` route exists in the current app — an older commented-out version of `App.jsx` had one.

---

## Dead code candidates (imported/mounted nowhere)

**Backend:**
- [`backend/controllers/LedgerController.js`](backend/controllers/LedgerController.js) — never required by any route file. Exports `addCredit`, `getCustomerLedger`, `getAllCustomers`, `updateInvoiceStatus`, `deleteCustomer`, all querying the legacy `ledger` table. `/api/ledger` is actually served by `CustomerLedgerController.js` instead.
- [`backend/controllers/AuthController.js`](backend/controllers/AuthController.js) — literal stub (`// Auth controller removed`), never required anywhere. Real auth logic is inline in `routes/auth.js`.
- [`backend/middleware/authMiddleware.js`](backend/middleware/authMiddleware.js) — defined, never required by anything. No route in the app currently runs any auth middleware — `routes/auth.js` does its own inline JWT check for `/me`.
- `backend/scripts/initAuth.js` — not dead exactly, but never executed by the running server; manual CLI bootstrap only (mentioned in a console.log hint).

**Frontend** (checked against every `import` in `frontend/src`, no dynamic imports exist so this is exhaustive):
- `components/AuthCallback.jsx` — 7-line stub, unreferenced.
- `components/Searchbar.jsx` — unreferenced; internally named `NLPSearch`, matches the unused backend `/api/nlp` route but nothing calls it.
- `components/Sales/Invoices/InvoiceList.jsx`, `InvoiceForm.jsx`, `InvoicePdf.jsx` — unreferenced, only appear in commented-out imports.
- `components/Purchase/PInvoices/PInvoiceList.jsx`, `PInvoiceForm.jsx`, `PInvoicePdf.jsx` — same pattern, mirrors the sales-side dead trio.
- `components/Sales/Ledger/Ledger.jsx` — 331-line superseded predecessor of the live `CustomerLedger.jsx`.
- `components/Purchase/PLedger/PLedger.jsx` — superseded predecessor of the live `PurchaseLedger.jsx`.

No filename-casing mismatches were found anywhere (checked disk names vs import paths).

---

## Duplicate functions

**Backend controllers** — `CustomerLedgerController.js` and `PurchaseLedgerController.js` are a matched customer/seller pair, line-for-line near-identical SQL shape (`getFullLedger`↔`getFullPurchaseLedger`, `getCustomerLedgerHistory`↔`getSellerLedgerHistory`, `getLedgerSummary`, `addLedgerEntry`, `getOutstandingDebts`). Same for `InvoiceController.recordPayment` ↔ `PurchaseInvoiceController.recordPayment`. This is deliberate parallel-module duplication (see asymmetry note below), not accidental.

**Frontend API layer** — same-endpoint duplicate pairs, confirmed:
- `ledgerApi.js`: `addCredit` ≡ `addLedgerEntry` (both `POST /api/ledger`); `getCustomerLedger` ≡ `getCustomerLedgerHistory` (both `GET /api/ledger/customer/:id`). Only the `*LedgerEntry`/`*History` names are actually used by components.
- `ledgerApi.js`: `deleteCustomer(name)` → `DELETE /api/ledger/customer/:name` — **no matching backend route exists at all** (dead/broken export).
- `purchaseLedgerApi.js`: `getAllLedger` ≡ `getAllPurchaseLedger`; `getSellerLedger` ≡ `getSellerLedgerHistory`; `addCredit` ≡ `addLedgerEntry` (only the second name in each pair is used). `deleteSeller` here also has no backing route.
- `purchaseInvoiceApi.js`: `getAllInvoices` ≡ `getAllPurchaseInvoices` (same endpoint); `createInvoice`, `deleteInvoice`, `getClientInvoices` have no backing route (file's own comments flag them as legacy).
- `invoiceApi.js`: `createInvoice`, `deleteInvoice`, `getClientInvoices` also have no backing route — consistent with the whole file being dead (only used by the now-dead `Ledger.jsx`/`InvoiceList.jsx`).
- Naming collision (not a runtime bug today, but a footgun): `ledgerApi.deleteCustomer(name)` vs `customersApi.deleteCustomer(id)` — same name, different signature, different module.

---

## Naming inconsistencies

- **Suffix style**: `*List` (`EmployeeList`, `ExpenseList`, `AssetList`, `ProductionList`) vs `StockManager` vs bare noun (`CustomerLedger`, `PurchaseLedger`) vs `Add*Modal`/`New*Modal` used interchangeably for the same "create" concept (`AddPaymentModal` vs `NewSaleModal` vs `NewPurchaseModal`).
- **Abbreviation**: `Purchase/PInvoices/`, `Purchase/PLedger/` (abbreviated "P") vs `Sales/Invoices/`, `Sales/Ledger/` (fully spelled) — same feature pair, inconsistent abbreviation convention.
- **Singular/plural**: plural directories (`Employees/`, `Expenses/`, `Assets/`) contain singular-named files (`EmployeeForm`, `ExpenseForm`); `Sales/Invoices` (plural) sits next to `Sales/Ledger` (singular) one level down — no consistent rule.
- **Component name vs file name**: `Searchbar.jsx` exports a component called `NLPSearch`.
- **API module style**: most API files export flat named functions (`export const getAllX`), but `assetApi.js`, `employeeApi.js`, `expenseApi.js` export a single object (`assetAPI.getAll`, etc.) — a structurally different pattern for the same kind of CRUD API.
- **API file naming**: singular (`invoiceApi.js`, `ledgerApi.js`, `purchaseApi.js`) vs plural (`customersApi.js`, `sellersApi.js`) with no consistent rule.
- **Frontend↔backend path naming**: `purchaseInvoiceApi` (singular module name) calls plural kebab-case `/api/purchase-invoices`; `purchaseLedgerApi` (singular) calls singular `/api/purchase-ledger` — inconsistent within the same app.
- **Backend double-mount**: `routes/purchase.js` is mounted at both `/api/purchase` and `/api/purchases` (`server.js:58-59`) — redundant, and the frontend only ever calls the singular one.

---

## Rewrite of your known-issues list (verified against the scan above)

**Confirmed dead code:**
- `LedgerController.js` (backend) — confirmed never mounted in any router; `/api/ledger` is actually served by `CustomerLedgerController.js`. Its functions query the legacy `ledger` table directly.
- `ledger` table — confirmed unused: the only `FROM ledger`/`INTO ledger` references anywhere in the codebase are inside the dead `LedgerController.js` itself. Live traffic goes through `customer_ledger`.
- `clients` table — confirmed unused: zero references anywhere in backend or frontend code. The live customer entity is `customers`.
- Additional dead code found beyond your list: `AuthController.js` (stub, unreferenced), `authMiddleware.js` (defined, never applied to any route), and on the frontend: `AuthCallback.jsx`, `Searchbar.jsx`, plus six components under `Sales/Invoices/*` and `Purchase/PInvoices/*`, and the two superseded ledger components `Sales/Ledger/Ledger.jsx` / `Purchase/PLedger/PLedger.jsx`.

**Confirmed duplication (redundant, not dead — pick one, don't add a third):**
- `ledgerApi.addCredit` ≡ `ledgerApi.addLedgerEntry` — both `POST /api/ledger`, confirmed literal duplicate. Only `addLedgerEntry` is actually called from components.
- `ledgerApi.getCustomerLedger` ≡ `ledgerApi.getCustomerLedgerHistory` — both `GET /api/ledger/customer/:id`, confirmed same endpoint. Only `getCustomerLedgerHistory` is actually called.
- Same duplication pattern also exists on the purchase side (`purchaseLedgerApi.addCredit`≡`addLedgerEntry`, `getSellerLedger`≡`getSellerLedgerHistory`), and in `purchaseInvoiceApi.getAllInvoices`≡`getAllPurchaseInvoices` — not previously called out, but same shape.

**Confirmed intentional asymmetry between sales/purchase modules (not fixed, flagged only):**
- `customer_ledger.invoice_id` vs `purchase_ledger.purchase_id` — confirmed, different linking columns, both actively used by their respective `createSale`/`createPurchase` and `recordPayment` inserts.
- `sale_items.unit_price` vs `purchase_items.price` — confirmed, same concept, different column name, both in active use.
- `payment_records` / `purchase_payment_records` — confirmed: real payment writes go through `InvoiceController.recordPayment` / `PurchaseInvoiceController.recordPayment` (which write to these tables, update invoice status, adjust the ledger, and adjust sale/purchase balances all together). The plain `POST /api/ledger` / `POST /api/purchase-ledger` (`addLedgerEntry`) endpoints write **only** a bare ledger row — they never touch `payment_records`, never update invoice status, never adjust balances. Worth being aware of: a manual entry via `addLedgerEntry` will silently diverge from `outstanding_debt` on the invoice, since that endpoint isn't what your description implied ("real payments go through addLedgerEntry directly") — it's actually the opposite: real payments go through `recordPayment`, and `addLedgerEntry` is the side-channel that bypasses invoice/balance updates.
