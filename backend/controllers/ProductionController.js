const pool = require('../db/pool');

class ProductionController {
  /**
   * Add product to production queue
   * POST /api/production
   * Body: { product_name, stock_id, required_quantity, notes, priority, sale_id }
   */
  static async addToQueue(req, res) {
    try {
      const { product_name, product_id, stock_id, required_quantity, notes, priority = 'normal', sale_id } = req.body;

      if (!product_name || !required_quantity) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const result = await pool.query(
        `INSERT INTO production_queue (product_name, product_id, stock_id, required_quantity, notes, priority, sale_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
         RETURNING *`,
        [product_name, product_id || null, stock_id || null, required_quantity, notes, priority, sale_id || null]
      );

      res.status(201).json({
        success: true,
        message: 'Product added to production queue',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error adding to production queue:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get all production queue items
   * GET /api/production?status=pending&page=1&limit=10
   */
  static async getQueue(req, res) {
    try {
      const { status, page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      let query = 'SELECT * FROM production_queue';
      let params = [];

      if (status) {
        query += ' WHERE status = $1';
        params.push(status);
      }

      query += ' ORDER BY priority DESC, created_at ASC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM production_queue';
      let countParams = [];
      if (status) {
        countQuery += ' WHERE status = $1';
        countParams.push(status);
      }

      const countResult = await pool.query(countQuery, countParams);
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
      console.error('❌ Error fetching production queue:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get single production item
   * GET /api/production/:id
   */
  static async getProductionItem(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'SELECT * FROM production_queue WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Production item not found' });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error fetching production item:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update production status
   * PUT /api/production/:id/status
   * Body: { status }
   */
  static async updateStatus(req, res) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      await client.query('BEGIN');

      const result = await client.query(
        'UPDATE production_queue SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, id]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Production item not found' });
      }

      const productionItem = result.rows[0];

      // If production is completed, update stock and sale status
      if (status === 'completed') {
        let stockId = productionItem.stock_id;

        if (!stockId) {
          // No stock row was picked when this order was queued — typically a
          // product being produced for the first time. Find an existing stock
          // row for it, or create one now, same as a first-ever stock purchase does.
          const existing = productionItem.product_id
            ? await client.query('SELECT id FROM stock WHERE product_id = $1', [productionItem.product_id])
            : await client.query('SELECT id FROM stock WHERE LOWER(name) = LOWER($1)', [productionItem.product_name]);

          if (existing.rows.length > 0) {
            stockId = existing.rows[0].id;
          } else {
            // Resolve catalog details from the stored product_id, falling back to a
            // name match — older queue rows predate the product_id column.
            const productLookup = productionItem.product_id
              ? await client.query(
                  `SELECT p.id, p.size, p.description, p.sale_price, p.cost_price, pc.name AS category_name
                   FROM products p
                   LEFT JOIN product_categories pc ON pc.id = p.category_id
                   WHERE p.id = $1`,
                  [productionItem.product_id]
                )
              : await client.query(
                  `SELECT p.id, p.size, p.description, p.sale_price, p.cost_price, pc.name AS category_name
                   FROM products p
                   LEFT JOIN product_categories pc ON pc.id = p.category_id
                   WHERE LOWER(p.name) = LOWER($1) AND p.type = 'stock'`,
                  [productionItem.product_name]
                );
            const product = productLookup.rows[0] || null;

            const created = await client.query(
              `INSERT INTO stock (name, unit_price, quantity, product_id, category, size, extra)
               VALUES ($1, $2, 0, $3, $4, $5, $6)
               RETURNING id`,
              [
                productionItem.product_name,
                product?.sale_price ?? product?.cost_price ?? 0,
                product?.id || productionItem.product_id || null,
                product?.category_name || null,
                product?.size || null,
                product?.description || null
              ]
            );
            stockId = created.rows[0].id;
          }

          await client.query(
            'UPDATE production_queue SET stock_id = $1 WHERE id = $2',
            [stockId, id]
          );
        }

        // Add completed quantity to stock
        await client.query(
          'UPDATE stock SET quantity = quantity + $1 WHERE id = $2',
          [productionItem.required_quantity, stockId]
        );

        // Update related sale status if completed
        if (productionItem.sale_id) {
          const saleResult = await client.query(
            'SELECT * FROM sales WHERE id = $1',
            [productionItem.sale_id]
          );

          if (saleResult.rows.length > 0) {
            const sale = saleResult.rows[0];

            // Check if all production items for this sale are completed
            const pendingProduction = await client.query(
              'SELECT COUNT(*) FROM production_queue WHERE sale_id = $1 AND status != \'completed\'',
              [productionItem.sale_id]
            );

            if (parseInt(pendingProduction.rows[0].count) === 0) {
              await client.query(
                'UPDATE sales SET status = \'ready\', updated_at = NOW() WHERE id = $1',
                [productionItem.sale_id]
              );
            }
          }
        }
      }

      // Complete the production timestamp
      if (status === 'completed') {
        await client.query(
          'UPDATE production_queue SET completed_at = NOW() WHERE id = $1',
          [id]
        );
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Production status updated',
        data: result.rows[0]
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error updating production status:', error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Get production statistics
   * GET /api/production/stats/overview
   */
  static async getStats(req, res) {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_count,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
          COUNT(*) as total_count
        FROM production_queue
      `);

      res.json({
        success: true,
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error fetching production stats:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get today's production schedule
   * GET /api/production/today/schedule
   */
  static async getTodaySchedule(req, res) {
    try {
      const result = await pool.query(
        `SELECT * FROM production_queue 
         WHERE DATE(created_at) = CURRENT_DATE 
         ORDER BY priority DESC, created_at ASC`
      );

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ Error fetching today\'s schedule:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = ProductionController;
