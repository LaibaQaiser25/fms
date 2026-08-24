const pool = require('../db/pool');

class RawMaterialConsumptionController {
  /**
   * Log raw material usage — usage log only, decrements raw_materials.quantity.
   * Does not create or touch any stock row; no finished-goods link.
   * POST /api/raw-material-consumption
   * Body: { raw_material_id, quantity_used, user_id, logged_by_name, notes, consumption_date }
   */
  static async logConsumption(req, res) {
    const client = await pool.connect();
    try {
      const { raw_material_id, quantity_used, user_id, logged_by_name, notes, consumption_date } = req.body;

      if (!raw_material_id || !quantity_used) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      if (Number(quantity_used) <= 0) {
        return res.status(400).json({ error: 'Quantity used must be greater than 0' });
      }

      await client.query('BEGIN');

      const materialResult = await client.query(
        'SELECT * FROM raw_materials WHERE id = $1 FOR UPDATE',
        [raw_material_id]
      );

      if (materialResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Raw material not found' });
      }

      const material = materialResult.rows[0];

      if (Number(quantity_used) > Number(material.quantity)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Quantity used (${quantity_used}) exceeds available stock (${material.quantity})`
        });
      }

      const logResult = await client.query(
        `INSERT INTO raw_material_consumption
           (raw_material_id, raw_material_name, quantity_used, user_id, logged_by_name, notes, consumption_date)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE))
         RETURNING *`,
        [raw_material_id, material.name, quantity_used, user_id || null, logged_by_name || null, notes || null, consumption_date || null]
      );

      await client.query(
        'UPDATE raw_materials SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2',
        [quantity_used, raw_material_id]
      );

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Consumption logged successfully',
        data: logResult.rows[0]
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error logging raw material consumption:', error);
      res.status(500).json({ error: error.message });
    } finally {
      client.release();
    }
  }

  /**
   * Get today's consumption entries
   * GET /api/raw-material-consumption/today
   */
  static async getTodaysConsumption(req, res) {
    try {
      const result = await pool.query(
        `SELECT * FROM raw_material_consumption
         WHERE consumption_date = CURRENT_DATE
         ORDER BY created_at DESC`
      );

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ Error fetching today\'s consumption:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get consumption history, optionally filtered by raw_material_id
   * GET /api/raw-material-consumption?raw_material_id=&page=1&limit=10
   */
  static async getConsumptionHistory(req, res) {
    try {
      const { raw_material_id, page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const params = [];
      let where = '';
      if (raw_material_id) {
        params.push(raw_material_id);
        where = `WHERE raw_material_id = $${params.length}`;
      }

      params.push(limit, offset);
      const result = await pool.query(
        `SELECT * FROM raw_material_consumption
         ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const countParams = raw_material_id ? [raw_material_id] : [];
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM raw_material_consumption ${where}`,
        countParams
      );
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
      console.error('❌ Error fetching consumption history:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = RawMaterialConsumptionController;
