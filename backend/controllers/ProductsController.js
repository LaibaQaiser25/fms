const pool = require('../db/pool');

class ProductsController {
  /**
   * GET /api/products
   * Optional ?type=stock|raw_material filter
   */
  static async getAllProducts(req, res) {
    try {
      const { type } = req.query;
      const params = [];
      let query = `
        SELECT p.*, c.name AS category_name
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
      `;

      if (type) {
        params.push(type);
        query += ` WHERE p.type = $${params.length}`;
      }

      query += ' ORDER BY p.name ASC';

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/products/search?q=&type=
   */
  static async searchProducts(req, res) {
    try {
      const { q = '', type } = req.query;
      const params = [`%${q}%`];
      let query = `
        SELECT p.*, c.name AS category_name
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        WHERE p.name ILIKE $1
      `;

      if (type) {
        params.push(type);
        query += ` AND p.type = $${params.length}`;
      }

      query += ' ORDER BY p.name ASC LIMIT 10';

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/products/:id
   */
  static async getProductById(req, res) {
    try {
      const result = await pool.query(
        `SELECT p.*, c.name AS category_name
         FROM products p
         LEFT JOIN product_categories c ON c.id = p.category_id
         WHERE p.id = $1`,
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/products
   * Body: { name, type, category_id, size, unit, description }
   * - type: 'stock' | 'raw_material'
   * - category_id, size only apply to 'stock'
   * - unit only applies to 'raw_material'
   */
  static async createProduct(req, res) {
    try {
      const { name, type, category_id, size, unit, description } = req.body;

      if (!name || !type) {
        return res.status(400).json({ error: 'Name and type are required' });
      }

      if (!['stock', 'raw_material'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
      }

      const isStock = type === 'stock';

      if (!isStock && unit && !['Bag', 'Truck', 'Cft'].includes(unit)) {
        return res.status(400).json({ error: 'Invalid unit' });
      }

      const result = await pool.query(
        `INSERT INTO products (name, type, category_id, size, unit, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          name,
          type,
          isStock ? (category_id || null) : null,
          isStock ? (size || null) : null,
          isStock ? null : (unit || null),
          description || null
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * PUT /api/products/:id
   */
  static async updateProduct(req, res) {
    try {
      const { name, type, category_id, size, unit, description } = req.body;

      if (!['stock', 'raw_material'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type' });
      }

      const isStock = type === 'stock';

      if (!isStock && unit && !['Bag', 'Truck', 'Cft'].includes(unit)) {
        return res.status(400).json({ error: 'Invalid unit' });
      }

      const result = await pool.query(
        `UPDATE products
         SET name = $1, type = $2, category_id = $3, size = $4, unit = $5, description = $6, updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [
          name,
          type,
          isStock ? (category_id || null) : null,
          isStock ? (size || null) : null,
          isStock ? null : (unit || null),
          description || null,
          req.params.id
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * DELETE /api/products/:id
   */
  static async deleteProduct(req, res) {
    try {
      const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [req.params.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json({ message: 'Product deleted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/products/categories
   */
  static async getCategories(req, res) {
    try {
      const result = await pool.query('SELECT * FROM product_categories ORDER BY name ASC');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/products/categories
   * Body: { name }
   */
  static async createCategory(req, res) {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Category name is required' });
      }

      const result = await pool.query(
        `INSERT INTO product_categories (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [name.trim()]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = ProductsController;
