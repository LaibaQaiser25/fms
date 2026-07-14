const pool = require('../db/pool');

class PurchaseController {
  static async createPurchase(req, res) {
    try {
      const { seller_name, category, quantity, price, date, notes } = req.body;

      if (!seller_name || !category || !quantity || !price || !date) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const validCategories = ['stock', 'production'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: 'Category must be stock or production' });
      }

      const result = await pool.query(
        `INSERT INTO purchases (seller_name, category, quantity, price, date, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [seller_name, category, quantity, price, date, notes || null]
      );

      res.status(201).json({
        success: true,
        message: 'Purchase created successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Error creating purchase:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getAllPurchases(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const result = await pool.query(
        `SELECT * FROM purchases ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await pool.query('SELECT COUNT(*) FROM purchases');
      const total = parseInt(countResult.rows[0].count, 10);

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('❌ Error fetching purchases:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async getPurchase(req, res) {
    try {
      const { id } = req.params;
      const result = await pool.query('SELECT * FROM purchases WHERE id = $1', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Error fetching purchase:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async updatePurchase(req, res) {
    try {
      const { id } = req.params;
      const { seller_name, category, quantity, price, date, notes } = req.body;

      const result = await pool.query(
        `UPDATE purchases
         SET seller_name = COALESCE($1, seller_name),
             category = COALESCE($2, category),
             quantity = COALESCE($3, quantity),
             price = COALESCE($4, price),
             date = COALESCE($5, date),
             notes = COALESCE($6, notes),
             updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [seller_name, category, quantity, price, date, notes, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      res.json({
        success: true,
        message: 'Purchase updated successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Error updating purchase:', error);
      res.status(500).json({ error: error.message });
    }
  }

  static async deletePurchase(req, res) {
    try {
      const { id } = req.params;
      const result = await pool.query('DELETE FROM purchases WHERE id = $1 RETURNING *', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      res.json({
        success: true,
        message: 'Purchase deleted successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error('❌ Error deleting purchase:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = PurchaseController;
