const pool = require('../db/pool');

class SalesController {
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

      await client.query('BEGIN');

      // 1. Generate unique sale number
      const saleNoResult = await client.query(
        'SELECT COUNT(*) FROM sales'
      );
      const saleNo = `SALE-${Date.now()}-${saleNoResult.rows[0].count + 1}`;

      // 2. Create sale record
      const balance = total_amount - (advance_paid || 0);
      
      // Check if items are in stock to determine status
      let status = 'ready'; // Default to ready
      for (const item of items) {
        if (item.stock_id) {
          const stockResult = await client.query(
            'SELECT quantity FROM stock WHERE id = $1',
            [item.stock_id]
          );
          if (stockResult.rows.length > 0 && stockResult.rows[0].quantity < item.quantity) {
            status = 'pending'; // Needs production
            break;
          }
        }
      }

      const saleResult = await client.query(
        `INSERT INTO sales (sale_no, customer_id, customer_name, phone, address, total_amount, advance_paid, balance, payment_type, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [saleNo, customer_id, customer_name, phone, address, total_amount, advance_paid || 0, balance, payment_type, status, notes]
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

        // Reduce stock if available
        if (item.stock_id && status === 'ready') {
          await client.query(
            'UPDATE stock SET quantity = quantity - $1 WHERE id = $2',
            [item.quantity, item.stock_id]
          );
        }
      }

      // 4. Create Proforma Invoice
      const invoiceNoResult = await client.query(
        'SELECT COUNT(*) FROM invoices WHERE customer_id = $1',
        [customer_id]
      );
      const invoiceNo = `INV-${customer_name.substring(0, 3).toUpperCase()}-${invoiceNoResult.rows[0].count + 1}`;

      const invoiceResult = await client.query(
        `INSERT INTO invoices (invoice_no, sale_id, customer_id, customer_name, phone, address, total_amount, advance_paid, outstanding_debt, invoice_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'proforma', 'unpaid')
         RETURNING *`,
        [invoiceNo, saleId, customer_id, customer_name, phone, address, total_amount, advance_paid || 0, balance]
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
        [customer_id, customer_name, invoiceId, invoiceNo, total_amount, advance_paid || 0, balance]
      );

      await client.query('COMMIT');

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
