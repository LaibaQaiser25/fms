const pool = require('../db/pool');

class SellersController {
  /**
   * Create a new seller
   * POST /api/sellers
   */
  static async createSeller(req, res) {
    try {
      const { name, phone, address, email } = req.body;

      if (!name || !phone || !address) {
        return res.status(400).json({ error: 'Seller name, phone, and address are required' });
      }

      const result = await pool.query(
        `INSERT INTO sellers (name, phone, address, email)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, phone, address, email || null]
      );

      res.status(201).json({
        success: true,
        message: 'Seller created successfully',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error creating seller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get all sellers with auto-suggestion
   * GET /api/sellers/search?search=seller_name&limit=10
   */
  static async searchSellers(req, res) {
    try {
      const { search = '', limit = 10 } = req.query;

      let query = 'SELECT * FROM sellers';
      let params = [];

      if (search) {
        query += ' WHERE LOWER(name) ILIKE LOWER($1) OR phone ILIKE $1';
        params.push(`%${search}%`);
        query += ` LIMIT $${params.length + 1}`;
        params.push(limit);
      } else {
        query += ` LIMIT $${params.length + 1}`;
        params.push(limit);
      }

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ Error searching sellers:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get all sellers with pagination
   * GET /api/sellers?page=1&limit=10
   */
  static async getAllSellers(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const result = await pool.query(
        'SELECT * FROM sellers ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );

      const countResult = await pool.query('SELECT COUNT(*) FROM sellers');
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
      console.error('❌ Error fetching sellers:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get single seller
   * GET /api/sellers/:id
   */
  static async getSeller(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'SELECT * FROM sellers WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error fetching seller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update seller
   * PUT /api/sellers/:id
   */
  static async updateSeller(req, res) {
    try {
      const { id } = req.params;
      const { name, phone, address, email } = req.body;

      const result = await pool.query(
        `UPDATE sellers 
         SET name = COALESCE($1, name),
             phone = COALESCE($2, phone),
             address = COALESCE($3, address),
             email = COALESCE($4, email),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [name || null, phone || null, address || null, email || null, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      res.json({
        success: true,
        message: 'Seller updated',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error updating seller:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Delete seller
   * DELETE /api/sellers/:id
   */
  static async deleteSeller(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM sellers WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Seller not found' });
      }

      res.json({
        success: true,
        message: 'Seller deleted',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error deleting seller:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = SellersController;
