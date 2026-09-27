const pool = require('../db/pool');
const { sendWhatsApp } = require('./whatsappService');

// Same threshold the dashboard alert panel uses (SalesController.getDashboardData,
// RawMaterialsController.getLowStockRawMaterials): at or below minimum_stock,
// defaulting to 10 when it isn't set.
const isLow = (quantity, minimum) => Number(quantity) <= Number(minimum ?? 10);

/**
 * Instant WhatsApp alert when a stock item or raw material *newly* drops to or
 * below its minimum — i.e. it wasn't low before this change but is now. Items
 * that were already low stay quiet (the daily digest still lists them), so
 * repeated edits don't spam the owner.
 *
 * Fire-and-forget: not awaited by callers, so the HTTP response never waits on
 * the n8n/Meta round trip (see the comment in SalesController.createSale).
 * sendWhatsApp catches its own errors.
 *
 * @param {'stock'|'raw'} kind
 * @param {{quantity, minimum_stock}} before  row as it was before the change
 * @param {{name, quantity, minimum_stock, unit?}} after  row after the change
 */
const alertIfNewlyLow = (kind, before, after) => {
  if (!before || !after) return;
  if (isLow(before.quantity, before.minimum_stock) || !isLow(after.quantity, after.minimum_stock)) return;

  const minimum = after.minimum_stock ?? 10;
  const message = kind === 'raw'
    ? `⚠️ *Low Raw Material*\n\n• ${after.name}: ${Number(after.quantity)}${after.unit || ''} left (minimum ${Number(minimum)})`
    : `⚠️ *Low Stock*\n\n• ${after.name}: ${Number(after.quantity)} units left (minimum ${Number(minimum)})`;

  sendWhatsApp(message);
};

const formatRs = (amount) => `Rs.${Number(amount || 0).toLocaleString('en-PK')}`;

// Keep each section short enough that the whole message stays well under
// WhatsApp's 4096-character text limit.
const MAX_LINES = 10;
const section = (title, rows, line) => {
  if (rows.length === 0) return '';
  const shown = rows.slice(0, MAX_LINES).map((r) => `• ${line(r)}`).join('\n');
  const more = rows.length > MAX_LINES ? `\n…and ${rows.length - MAX_LINES} more` : '';
  return `\n\n*${title} (${rows.length})*\n${shown}${more}`;
};

/**
 * Daily digest of everything the dashboard alert panel shows (Layout.jsx
 * allAlerts): low stock, customer debts, payables to sellers, low raw
 * materials — same queries as the dashboard endpoints.
 */
const sendDailyDigest = async (label) => {
  const [stock, debts, payables, raw] = await Promise.all([
    pool.query(
      `SELECT name, quantity, minimum_stock FROM stock
       WHERE quantity <= COALESCE(minimum_stock, 10)
       ORDER BY quantity ASC`
    ),
    pool.query(
      `SELECT customer_name, outstanding_debt FROM invoices
       WHERE status IN ('unpaid', 'partial')
       ORDER BY outstanding_debt DESC`
    ),
    pool.query(
      `SELECT seller_name, outstanding_debt FROM purchase_invoices
       WHERE status IN ('unpaid', 'partial')
       ORDER BY outstanding_debt DESC`
    ),
    pool.query(
      `SELECT name, quantity, unit, minimum_stock FROM raw_materials
       WHERE quantity <= COALESCE(minimum_stock, 10)
       ORDER BY name ASC`
    ),
  ]);

  const total = (rows) => rows.reduce((sum, r) => sum + Number(r.outstanding_debt || 0), 0);

  const body =
    section('Low Stock', stock.rows, (r) => `${r.name}: ${Number(r.quantity)} units`) +
    section(`Customer Debts — ${formatRs(total(debts.rows))}`, debts.rows,
      (r) => `${r.customer_name}: ${formatRs(r.outstanding_debt)}`) +
    section(`Payable to Sellers — ${formatRs(total(payables.rows))}`, payables.rows,
      (r) => `${r.seller_name}: ${formatRs(r.outstanding_debt)}`) +
    section('Low Raw Materials', raw.rows, (r) => `${r.name}: ${Number(r.quantity)}${r.unit || ''}`);

  await sendWhatsApp(`📋 *FMS Daily Alerts* (${label})${body || '\n\n✅ No alerts — all clear.'}`);
};

module.exports = { alertIfNewlyLow, sendDailyDigest };
