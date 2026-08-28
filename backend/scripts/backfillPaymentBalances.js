#!/usr/bin/env node
/**
 * One-off backfill for invoices.outstanding_debt / invoices.status / sales.balance
 * (and the purchase-side twins), which never moved for payments recorded before
 * InvoiceController/PurchaseInvoiceController started allocating payments to
 * invoices. Not run by the server — run manually once.
 *
 * Idempotent: resets every proforma/purchase_invoice + its sale/purchase to its
 * as-created state (total - advance), then replays every payment_records /
 * purchase_payment_records row in creation order through the same
 * applyPaymentToInvoices() the live payment flow uses — so the result is
 * exactly what the balances would be had the fix existed from day one. Safe
 * to run more than once.
 *
 * Usage: node scripts/backfillPaymentBalances.js
 */

require('dotenv').config();
const pool = require('../db/pool');
const InvoiceController = require('../controllers/InvoiceController');
const PurchaseInvoiceController = require('../controllers/PurchaseInvoiceController');

async function backfillSales(client) {
  await client.query(`
    UPDATE invoices
    SET outstanding_debt = total_amount - advance_paid,
        status = CASE
          WHEN total_amount - advance_paid <= 0 THEN 'paid'
          WHEN advance_paid > 0 THEN 'partial'
          ELSE 'unpaid'
        END
    WHERE invoice_type = 'proforma'
  `);

  await client.query(`UPDATE sales SET balance = total_amount - advance_paid`);

  const payments = await client.query(
    `SELECT id, customer_id, invoice_id, payment_amount
       FROM payment_records
      ORDER BY created_at ASC, id ASC`
  );

  for (const p of payments.rows) {
    await InvoiceController.applyPaymentToInvoices(
      client, p.customer_id, p.invoice_id, Number(p.payment_amount)
    );
  }

  return payments.rows.length;
}

async function backfillPurchases(client) {
  await client.query(`
    UPDATE purchase_invoices
    SET outstanding_debt = total_amount - advance_paid,
        status = CASE
          WHEN total_amount - advance_paid <= 0 THEN 'paid'
          WHEN advance_paid > 0 THEN 'partial'
          ELSE 'unpaid'
        END
    WHERE invoice_type = 'purchase_invoice'
  `);

  await client.query(`UPDATE purchases SET balance = total_amount - advance_paid`);

  const payments = await client.query(
    `SELECT id, seller_id, invoice_id, payment_amount
       FROM purchase_payment_records
      ORDER BY created_at ASC, id ASC`
  );

  for (const p of payments.rows) {
    await PurchaseInvoiceController.applyPaymentToInvoices(
      client, p.seller_id, p.invoice_id, Number(p.payment_amount)
    );
  }

  return payments.rows.length;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('🔄 Backfilling invoice/sale/purchase balances from payment history...');
    await client.query('BEGIN');

    const salesPayments = await backfillSales(client);
    const purchasePayments = await backfillPurchases(client);

    await client.query('COMMIT');
    console.log(`✅ Replayed ${salesPayments} customer payment(s) and ${purchasePayments} seller payment(s).`);
    console.log('   invoices.outstanding_debt/status, sales.balance, purchase_invoices.outstanding_debt/status and purchases.balance are now in sync with payment_records/purchase_payment_records.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Backfill failed, rolled back:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
