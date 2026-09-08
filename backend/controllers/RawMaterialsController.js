const pool = require('../db/pool');

class RawMaterialsController {
  /**
   * Create a new raw material
   * POST /api/raw-materials
   */
  static async createRawMaterial(req, res) {
    try {
      const { name, unit, unit_price, quantity, category, minimum_stock, product_id } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Raw material name is required' });
      }

      const result = await pool.query(
        `INSERT INTO raw_materials (name, unit, unit_price, quantity, category, minimum_stock, product_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [name, unit || null, unit_price || null, quantity || 0, category || null, minimum_stock || 10, product_id || null]
      );

      res.status(201).json({
        success: true,
        message: 'Raw material created successfully',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error creating raw material:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Search/auto-suggest raw materials
   * GET /api/raw-materials/search?search=&limit=10
   */
  static async searchRawMaterials(req, res) {
    try {
      const { search = '', limit = 10 } = req.query;

      let query = 'SELECT * FROM raw_materials';
      let params = [];

      if (search) {
        query += ' WHERE LOWER(name) ILIKE LOWER($1)';
        params.push(`%${search}%`);
        query += ` ORDER BY name ASC LIMIT $${params.length + 1}`;
        params.push(limit);
      } else {
        query += ` ORDER BY name ASC LIMIT $${params.length + 1}`;
        params.push(limit);
      }

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ Error searching raw materials:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get raw materials at or below their minimum stock threshold
   * GET /api/raw-materials/alerts/low-stock
   */
  static async getLowStockRawMaterials(req, res) {
    try {
      const result = await pool.query(
        `SELECT * FROM raw_materials WHERE quantity <= minimum_stock ORDER BY name ASC`
      );

      res.set('Cache-Control', 'private, max-age=10');
      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ Error fetching low-stock raw materials:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get all raw materials with pagination
   * GET /api/raw-materials?page=1&limit=10
   */
  static async getAllRawMaterials(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const result = await pool.query(
        'SELECT * FROM raw_materials ORDER BY name ASC LIMIT $1 OFFSET $2',
        [limit, offset]
      );

      const countResult = await pool.query('SELECT COUNT(*) FROM raw_materials');
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
      console.error('❌ Error fetching raw materials:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get all raw materials, unpaginated — for client-side matching (e.g. Purchase
   * form availability lookups by product_id), mirroring stockApi.getAllStock().
   * GET /api/raw-materials/all
   */
  static async getAllRawMaterialsList(req, res) {
    try {
      const result = await pool.query('SELECT * FROM raw_materials ORDER BY name ASC');
      res.json(result.rows);
    } catch (error) {
      console.error('❌ Error fetching raw materials list:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get single raw material
   * GET /api/raw-materials/:id
   */
  static async getRawMaterial(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'SELECT * FROM raw_materials WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Raw material not found' });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error fetching raw material:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update raw material
   * PUT /api/raw-materials/:id
   */
  static async updateRawMaterial(req, res) {
    try {
      const { id } = req.params;
      const { name, unit, unit_price, quantity, category, minimum_stock } = req.body;

      const result = await pool.query(
        `UPDATE raw_materials
         SET name = COALESCE($1, name),
             unit = COALESCE($2, unit),
             unit_price = COALESCE($3, unit_price),
             quantity = COALESCE($4, quantity),
             category = COALESCE($5, category),
             minimum_stock = COALESCE($6, minimum_stock),
             updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [name || null, unit || null, unit_price || null, quantity ?? null, category || null, minimum_stock ?? null, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Raw material not found' });
      }

      res.json({
        success: true,
        message: 'Raw material updated',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error updating raw material:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Delete raw material
   * DELETE /api/raw-materials/:id
   */
  static async deleteRawMaterial(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM raw_materials WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Raw material not found' });
      }

      res.json({
        success: true,
        message: 'Raw material deleted',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error deleting raw material:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = RawMaterialsController;
