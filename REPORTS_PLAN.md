# Reports Page — Implementation Plan (v3, decisions locked)

Scope and design from v2 stand. This version folds in your answers and pins down the parts that were still open.

## Decisions

1. **Search** — kept simple: matches typed text against the report's date range and label only (e.g. typing "Aug", "2026-08", or "24" surfaces matching reports). No search into the numbers.
2. **Automation delivery** — deferred. Auto-generated reports just land silently in the list; no WhatsApp/n8n push for now. (Flagging as future work, not building a stub for it.)
3. **Automation timing** — interactive, not hardcoded. Each frequency (daily/weekly/monthly) gets its own enable toggle + a time-of-day picker; weekly also gets a day-of-week picker, monthly a day-of-month picker (1–28, to sidestep short months). See schema/UI below.
4. **Access** — Reports is **Owner-only**, not Owner+Manager like the rest of the app. This is a new pattern for this codebase (see below — nothing currently role-gates a route beyond "logged in").
5. **Edit & delete** — both supported. Delete removes the row. Edit opens the stored snapshot's fields (sales/purchases/expenses totals, net cash, debt, payable, label) in a form and saves corrections back — since a report is a frozen snapshot, "editing" here means manually correcting the saved numbers/label, not live-recalculating. A separate "Regenerate" action (recompute from current DB state for the same period) is a nice-to-have I'll add if it doesn't add much extra work, not a blocker.

## Owner-only access — what actually has to change

Checked both layers; neither currently supports a narrower-than-"logged in" gate:

- **Backend**: `authMiddleware.js` only verifies the JWT and sets `req.user` — there is no role check anywhere in the backend today. `req.user.role` is available on every request (JWT payload includes it, set at login/register in `routes/auth.js:70`) and is always the canonical `'Owner'`/`'Manager'` capitalization per the role-casing note in CLAUDE.md. I'll add `backend/middleware/requireOwner.js` (checks `req.user.role === 'Owner'`, else 403) and mount it in front of the new `/api/reports` router only — first role-gated route in the codebase, doesn't touch any existing route.
- **Frontend**: `App.jsx` currently wraps the *entire* `Layout` route tree in one `<ProtectedRoute allowedRoles={['owner','manager']}>` ([App.jsx:104](frontend/src/App.jsx:104)) — there's no per-route role split today. I'll nest a second `<ProtectedRoute allowedRoles={['owner']}>` around just the `/reports` route inside `Layout`. `Sidebar.jsx` also has no role-awareness at all currently; I'll read the user's role from `AuthContext` (same `user.role.toLowerCase()` pattern `ProtectedRoute.jsx` already uses) and only render the "Reports" nav link for owners.

## Automation schema (updated from v2)

```sql
CREATE TABLE report_schedules (
  frequency         VARCHAR(10) PRIMARY KEY CHECK (frequency IN ('daily','weekly','monthly')),
  enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  run_time          TIME NOT NULL DEFAULT '23:55',
  run_day_of_week   SMALLINT,   -- 0=Sun..6=Sat — only meaningful for 'weekly'
  run_day_of_month  SMALLINT,   -- 1-28 — only meaningful for 'monthly'
  last_run_at       TIMESTAMP
);
INSERT INTO report_schedules (frequency) VALUES ('daily'), ('weekly'), ('monthly');
```
`services/cronJobs.js` gets a new `* * * * *` (every-minute) check: for each enabled schedule whose `run_time`/`run_day_of_week`/`run_day_of_month` matches "now" and hasn't already fired for this period (via `last_run_at`), compute the just-completed period's start/end, call the same `ReportsController.generateSnapshot` the manual endpoint uses, insert with `generated_by: 'auto'`, stamp `last_run_at`. `ReportAutomationModal.jsx` on the frontend is the interactive UI for all of this: three toggle rows (Daily/Weekly/Monthly), each expanding to its time/day picker when enabled.

## Everything else (data sources, new `reports`/tables, controllers, frontend file layout)

Unchanged from v2 — see the rest of that plan below for: the `reports` table + JSONB snapshot shape, which numbers come from which existing endpoint (expenses/cashbook already date-filterable, sales/purchases/ledger-summary need small additive backend changes), the new `ReportsController` endpoints, and the `components/Reports/` file layout.

---

## Reference: full v2 detail (data sources, schema, controllers, frontend layout)

### Data sources for each number

| Report field | Source | Status |
|---|---|---|
| Sales summary (revenue, count) for the period | `sales` table | Needs new backend support — `SalesController.getAllSales` has no `startDate`/`endDate`, only pagination. |
| Purchases summary for the period | `purchases` table | Needs new backend support — same gap in `PurchaseController.getAllPurchases`. |
| Expenses summary for the period | `ExpenseController.getExpenseSummary` | Already supports `startDate`/`endDate` — reusable as-is. |
| Net cash in hand, as of the report date | `CashbookController.getCashbookSummary` | Works via a trick: call with only `endDate` (no `startDate`) to sum every recorded cash movement up to that date. No backend change needed. Caveat: there's no opening-balance concept, so this is "everything ever recorded up to that date," not a reconciled bank/safe balance. |
| Customer debt, as of the report date | `CustomerLedgerController.getLedgerSummary` | Needs a small addition — currently sums the *whole* table, no date cutoff. |
| Total payable to sellers, as of the report date | `PurchaseLedgerController.getLedgerSummary` | Same addition, mirrored. |

### New `reports` table (migration `004-reports.js`)

```sql
CREATE TABLE reports (
  id            SERIAL PRIMARY KEY,
  period_type   VARCHAR(10) NOT NULL CHECK (period_type IN ('daily','weekly','monthly','yearly')),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  label         VARCHAR(100) NOT NULL,
  generated_by  VARCHAR(10) NOT NULL CHECK (generated_by IN ('manual','auto')),
  data          JSONB NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);
```
`data` shape:
```json
{
  "sales":     { "total": 0, "count": 0 },
  "purchases": { "total": 0, "count": 0 },
  "expenses":  { "total": 0, "count": 0 },
  "netCashInHand": 0,
  "customerDebt": 0,
  "payable": 0
}
```

### `ReportsController` (`backend/controllers/ReportsController.js`)

- `generateSnapshot(periodStart, periodEnd)` — internal helper, runs the sales/purchases/expenses/cashbook/ledger queries in parallel, returns the `data` shape. Shared by manual create + cron.
- `POST /api/reports` — body `{ periodType, month?, year? }` → computes `period_start`/`period_end`/`label`, calls `generateSnapshot`, inserts with `generated_by: 'manual'`.
- `GET /api/reports` — list with `search` (date/label match per decision #1), `periodType`, `dateFrom`/`dateTo`, `sortBy`, `order`, `page`/`limit` — same filter-building pattern as `ExpenseController`/`CashbookController`.
- `GET /api/reports/:id` — full stored snapshot.
- `PUT /api/reports/:id` — edit stored `data`/`label` (decision #5).
- `DELETE /api/reports/:id` — delete (decision #5).
- `GET /api/reports/schedules` / `PUT /api/reports/schedules/:frequency` — read/update automation config.

### New backend date-filtering additions (additive only, nothing existing changes)

- `SalesController.getSalesSummary` — `GET /api/sales/summary/range?startDate=&endDate=`.
- `PurchaseController.getPurchasesSummary` — `GET /api/purchase/summary/range` (double-mounted at `/api/purchases` too, same as everything else in that router).
- `CustomerLedgerController.getLedgerSummary` — add optional `asOfDate` (`WHERE created_at <= $1` when present).
- `PurchaseLedgerController.getLedgerSummary` — same, mirrored.

### Frontend file layout

```
frontend/src/components/Reports/
  Reports.jsx               — hub: header (Create Report + Automation buttons), search bar, filter/sort bar, report list/table
  CreateReportModal.jsx      — period-type selector (Today / Week / Month+picker / Year+picker) → POST /api/reports
  ReportAutomationModal.jsx  — daily/weekly/monthly toggles + time/day pickers → GET/PUT /api/reports/schedules
  ReportDetailModal.jsx      — view a stored report as summary cards; Edit mode (decision #5); Delete; Print (react-to-print, already a dependency, currently unused anywhere in the app)
frontend/src/api/reportsApi.js  — new resource file: listReports, getReport, createReport, updateReport, deleteReport, getSchedules, updateSchedule
```
List columns: Label, Period, Date Range, Generated (manual/auto + timestamp), Sales, Purchases, Expenses, Net Cash, Debt, Payable, [View].

`App.jsx`/`Sidebar.jsx`: import path for `Reports` updates to the new folder; `Sidebar.jsx` gains the owner-only check described above; `App.jsx` gains the nested owner-only `ProtectedRoute` described above.

---

## Build order

1. Migration `004-reports.js` (`reports` + `report_schedules` tables).
2. `requireOwner` middleware + mount on new reports router.
3. Additive backend changes: sales/purchase range-summary endpoints, ledger `asOfDate` param.
4. `ReportsController` (CRUD + `generateSnapshot`) + routes, verified directly against the DB.
5. Cron automation in `cronJobs.js`.
6. Frontend: `reportsApi.js`, then `Reports.jsx` + the three modals, owner-only routing/sidebar.
7. Browser verification: create a report manually for each period type, edit one, delete one, toggle automation on and confirm the schedule row updates, confirm a Manager account can't reach `/reports` or the API.

Starting on step 1 now unless you want to redirect first.
