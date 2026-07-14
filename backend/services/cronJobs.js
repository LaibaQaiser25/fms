const cron = require('node-cron');
const pool = require('../db/pool');
const { sendWhatsApp } = require('./whatsappService');

const startCronJobs = () => {
  // Every day at 9 PM
  cron.schedule('0 21 * * *', async () => {
    console.log('🕘 Running nightly alerts...');

    try {
      // 1. Low stock summary
      const stockResult = await pool.query(
        `SELECT name, quantity, minimum_stock 
         FROM stock 
         WHERE quantity <= COALESCE(minimum_stock, 10)
         ORDER BY quantity ASC`
      );

      if (stockResult.rows.length > 0) {
        let msg = '⚠️ *Low Stock Alert*\n\n';
        stockResult.rows.forEach(item => {
          msg += `• ${item.name}: ${item.quantity} units left\n`;
        });
        await sendWhatsApp(msg);
      }

      // 2. Outstanding debts summary
      const debtResult = await pool.query(
        `SELECT customer_name, outstanding_debt, invoice_no
         FROM invoices
         WHERE status IN ('unpaid', 'partial')
         ORDER BY outstanding_debt DESC`
      );

      if (debtResult.rows.length > 0) {
        let msg = '💰 *Outstanding Payments Alert*\n\n';
        debtResult.rows.forEach(inv => {
          msg += `• ${inv.customer_name} — Rs.${inv.outstanding_debt} (${inv.invoice_no})\n`;
        });
        await sendWhatsApp(msg);
      }

    } catch (error) {
      console.error('❌ Cron job error:', error.message);
    }
  });

  console.log('✅ Cron jobs started');
};

module.exports = { startCronJobs };