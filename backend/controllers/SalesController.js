const pool = require('../db/pool');
const crypto = require('crypto');
const { sendWhatsApp } = require('../services/whatsappService');

class SalesController {
  /**
   * Generate a truly unique ID with timestamp + random + counter
   */
  static generateUniqueId(prefix) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex').substring(0, 6);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Create a new sale with invoice and ledger entry
   * POST /api/sales
   */
  static async createSale(req, res) {
    const client = await pool.connect();
    try {
      const { customer_id, customer_name, phone, address, items, total_amount, advance_paid, payment_type, notes } = req.body;

      // Validate input
      if (!customer_id || !items || items.length === 0 || !total_amount) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Validate total_amount matches the sum of item amounts (boundary check on client input)
      const computedTotal = items.reduce(
        (sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)),
        0
      );
      if (Math.abs(computedTotal - Number(total_amount)) > 0.01) {
        return res.status(400).json({ error: 'total_amount does not match sum of item amounts' });
      }

      // An advance above the total produces a negative balance, an invoice
      // marked paid, and a negative debt in the ledger
      const advance = Number(advance_paid) || 0;
      if (advance < 0 || advance > Number(total_amount) + 0.01) {
        return res.status(400).json({ error: 'advance_paid must be between 0 and total_amount' });
      }

      await client.query('BEGIN');

      // 1. Generate unique sale number
      const saleNo = SalesController.generateUniqueId('SALE');

      // 2. Create sale record
      const balance = Number(total_amount) - advance;

      // Check each item independently so one short item doesn't block stock
      // decrement for items that are actually in stock
      let status = 'ready'; // Default to ready
      for (const item of items) {
        let needsProduction = item.from_production === true;
        if (!needsProduction && item.stock_id) {
          const stockResult = await client.query(
            'SELECT quantity FROM stock WHERE id = $1 FOR UPDATE',
            [item.stock_id]
          );
          if (stockResult.rows.length > 0 && stockResult.rows[0].quantity < item.quantity) {
            needsProduction = true;
          }
        }
        item._needsProduction = needsProduction;
        if (needsProduction) status = 'pending'; // Needs production
      }

      const saleResult = await client.query(
        `INSERT INTO sales (sale_no, customer_id, customer_name, phone, address, total_amount, advance_paid, balance, payment_type, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [saleNo, customer_id, customer_name, phone, address, total_amount, advance, balance, payment_type, status, notes]
      );

      const saleId = saleResult.rows[0].id;

      // 3. Create sale items
      for (const item of items) {
        const itemAmount = item.quantity * item.unit_price;
        await client.query(
          `INSERT INTO sale_items (sale_id, stock_id, product_name, quantity, unit_price, amount)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [saleId, item.stock_id || null, item.product_name, item.quantity, item.unit_price, itemAmount]
        );

        // Reduce stock only for this specific item if it's actually fulfilled from stock
        if (item.stock_id && !item._needsProduction) {
          await client.query(
            'UPDATE stock SET quantity = quantity - $1 WHERE id = $2',
            [item.quantity, item.stock_id]
          );
        }

        // Link the production queue entry (created client-side before the sale
        // existed) back to this sale now that we have a sale id
        if (item._needsProduction && item.production_queue_id) {
          await client.query(
            'UPDATE production_queue SET sale_id = $1 WHERE id = $2 AND sale_id IS NULL',
            [saleId, item.production_queue_id]
          );
        }
      }

      // 4. Create Proforma Invoice
      const invoiceNo = SalesController.generateUniqueId('INV');
      const invoiceStatus = balance <= 0 ? 'paid' : (advance > 0 ? 'partial' : 'unpaid');

      const invoiceResult = await client.query(
        `INSERT INTO invoices (invoice_no, sale_id, customer_id, customer_name, phone, address, total_amount, advance_paid, outstanding_debt, invoice_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'proforma', $10)
         RETURNING *`,
        [invoiceNo, saleId, customer_id, customer_name, phone, address, total_amount, advance, balance, invoiceStatus]
      );

      const invoiceId = invoiceResult.rows[0].id;

      // 5. Add invoice items
      for (const item of items) {
        const itemAmount = item.quantity * item.unit_price;
        await client.query(
          `INSERT INTO invoice_items (invoice_id, stock_id, product_name, description, quantity, price, amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [invoiceId, item.stock_id || null, item.product_name, item.description, item.quantity, item.unit_price, itemAmount]
        );
      }

      // 6. Create Customer Ledger Entry
      await client.query(
        `INSERT INTO customer_ledger (customer_id, customer_name, invoice_id, invoice_no, debit, credit, debt, transaction_type, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'sale', 'New sale created')`,
        [customer_id, customer_name, invoiceId, invoiceNo, total_amount, advance, balance]
      );

      await client.query('COMMIT');

      // Check low stock after sale, scoped to items actually sold in this sale
      const stockIds = items.filter(item => item.stock_id).map(item => item.stock_id);
      if (stockIds.length > 0) {
        const lowStock = await pool.query(
          `SELECT name, quantity, minimum_stock
     FROM stock
     WHERE id = ANY($1::int[]) AND quantity <= COALESCE(minimum_stock, 10)`,
          [stockIds]
        );
        if (lowStock.rows.length > 0) {
          let msg = '⚠️ *Low Stock After Sale*\n\n';
          lowStock.rows.forEach(item => {
            msg += `• ${item.name}: ${item.quantity} units left\n`;
          });
          await sendWhatsApp(msg);
        }
      }

      // Check outstanding balance
      if (balance > 0) {
        await sendWhatsApp(
          `💰 *New Outstanding Debt*\n\n• Customer: ${customer_name}\n• Amount: Rs.${balance}\n• Invoice: ${invoiceNo}`
        );
      }

      // Immediate summary of the sale itself
      await sendWhatsApp(
        `🧾 *New Sale*\n\n• Customer: ${customer_name}\n• Items: ${items.length}\n• Total: Rs.${total_amount}\n• Advance: Rs.${advance}\n• Invoice: ${invoiceNo}`
      );

      res.status(201).json({
        success: true,
        message: 'Sale created successfully',
        data: {
          sale: saleResult.rows[0],
          invoice: invoiceResult.rows[0],
          invoiceNo: invoiceNo
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error creating sale:', error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Get all sales with pagination
   * GET /api/sales?page=1&limit=10
   */
  static async getAllSales(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const result = await pool.query(
        `SELECT * FROM sales ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await pool.query('SELECT COUNT(*) FROM sales');
      const total = parseInt(countResult.rows[0].count);

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('❌ Error fetching sales:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get single sale with items
   * GET /api/sales/:id
   */
  static async getSale(req, res) {
    try {
      const { id } = req.params;

      const saleResult = await pool.query(
        'SELECT * FROM sales WHERE id = $1',
        [id]
      );

      if (saleResult.rows.length === 0) {
        return res.status(404).json({ error: 'Sale not found' });
      }

      const itemsResult = await pool.query(
        'SELECT * FROM sale_items WHERE sale_id = $1',
        [id]
      );

      res.json({
        success: true,
        data: {
          sale: saleResult.rows[0],
          items: itemsResult.rows
        }
      });

    } catch (error) {
      console.error('❌ Error fetching sale:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update sale status
   * PUT /api/sales/:id/status
   */
  static async updateSaleStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['pending', 'ready', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const result = await pool.query(
        'UPDATE sales SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Sale not found' });
      }

      res.json({
        success: true,
        message: 'Sale status updated',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error updating sale:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get today's sales summary
   * GET /api/sales/summary/today
   */
  static async getTodaysSalesSummary(req, res) {
    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*) as total_sales,
          SUM(total_amount) as total_amount,
          SUM(advance_paid) as total_advance,
          SUM(balance) as total_pending
         FROM sales 
         WHERE DATE(created_at) = CURRENT_DATE`
      );

      res.json({
        success: true,
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error fetching sales summary:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get sales totals for an arbitrary date range (inclusive) — used by Reports.
   * GET /api/sales/summary/range?startDate=&endDate=
   */
  static async getSalesSummary(req, res) {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
      }

      const result = await pool.query(
        `SELECT
          COUNT(*) as total_sales,
          COALESCE(SUM(total_amount), 0) as total_amount
         FROM sales
         WHERE created_at::date BETWEEN $1 AND $2`,
        [startDate, endDate]
      );

      res.json({
        success: true,
        data: {
          count: parseInt(result.rows[0].total_sales, 10),
          total: parseFloat(result.rows[0].total_amount)
        }
      });

    } catch (error) {
      console.error('❌ Error fetching sales summary:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get recent orders (last 10)
   * GET /api/sales/recent/list
   */
  static async getRecentOrders(req, res) {
    try {
      const result = await pool.query(
        `SELECT id, sale_no, customer_name, total_amount, status, created_at 
         FROM sales 
         ORDER BY created_at DESC 
         LIMIT 10`
      );

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ Error fetching recent orders:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get consolidated dashboard data (all-in-one)
   * GET /api/sales/dashboard/data
   * Returns: sales summary, recent orders, low stock alerts, pending payments
   */
  static async getDashboardData(req, res) {
    try {
      // Execute all 4 queries in parallel
      const [salesResult, ordersResult, stockResult, paymentsResult] = await Promise.all([
        // 1. Today's sales summary
        pool.query(
          `SELECT 
            COUNT(*) as total_sales,
            SUM(total_amount) as total_amount,
            SUM(advance_paid) as total_advance,
            SUM(balance) as total_pending
           FROM sales 
           WHERE DATE(created_at) = CURRENT_DATE`
        ),
        // 2. Recent orders
        pool.query(
          `SELECT id, sale_no, customer_name, total_amount, status, created_at 
           FROM sales 
           ORDER BY created_at DESC 
           LIMIT 10`
        ),
        // 3. Low stock alerts (items below minimum_stock)
        pool.query(
          `SELECT id, name, quantity, minimum_stock 
           FROM stock 
           WHERE quantity <= COALESCE(minimum_stock, 10)
           ORDER BY quantity ASC`
        ),
        // 4. Pending payments
        pool.query(
          `SELECT id, invoice_no, customer_name, total_amount, advance_paid, outstanding_debt, status, created_at
           FROM invoices 
           WHERE status IN ('unpaid', 'partial')
           ORDER BY created_at DESC`
        )
      ]);

      res.json({
        success: true,
        data: {
          salesSummary: salesResult.rows[0],
          recentOrders: ordersResult.rows,
          lowStockAlerts: stockResult.rows,
          pendingPayments: paymentsResult.rows
        }
      });

    } catch (error) {
      console.error('❌ Error fetching dashboard data:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = SalesController;
