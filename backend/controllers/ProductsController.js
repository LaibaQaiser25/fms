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
        SELECT p.*, c.name AS category_name, u.name AS unit
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        LEFT JOIN product_units u ON u.id = p.unit_id
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
        SELECT p.*, c.name AS category_name, u.name AS unit
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        LEFT JOIN product_units u ON u.id = p.unit_id
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
        `SELECT p.*, c.name AS category_name, u.name AS unit
         FROM products p
         LEFT JOIN product_categories c ON c.id = p.category_id
         LEFT JOIN product_units u ON u.id = p.unit_id
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
      let unitId = null;

      if (!isStock) {
        if (!unit) return res.status(400).json({ error: 'Unit is required' });
        const unitResult = await pool.query('SELECT id FROM product_units WHERE LOWER(name) = LOWER($1)', [unit]);
        if (unitResult.rows.length === 0) return res.status(400).json({ error: 'Invalid unit' });
        unitId = unitResult.rows[0].id;
      }

      const result = await pool.query(
        `INSERT INTO products (name, type, category_id, size, unit_id, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          name,
          type,
          isStock ? (category_id || null) : null,
          isStock ? (size || null) : null,
          isStock ? null : unitId,
          description || null
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        const isStock = req.body.type !== 'raw_material';
        const sizeNote = isStock && req.body.size ? ` with size "${req.body.size}"` : '';
        return res.status(400).json({ error: `A ${isStock ? 'stock' : 'raw material'} product named "${req.body.name}"${sizeNote} already exists${isStock && !req.body.size ? ' — add a size to tell them apart' : ''}` });
      }
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/products/bulk
   * Body: { products: [{ type, name, category_name, size, unit, description }, ...] }
   * Same field rules as POST /api/products, but takes category_name (find-or-create)
   * instead of category_id since bulk rows are typed freehand.
   */
  static async bulkCreateProducts(req, res) {
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'products must be a non-empty array' });
    }

    const unitsResult = await pool.query('SELECT id, name FROM product_units');
    const unitIdByName = new Map(unitsResult.rows.map((u) => [u.name.toLowerCase(), u.id]));

    for (let i = 0; i < products.length; i++) {
      const row = products[i];
      const rowNum = i + 1;
      if (!row.name || !row.type) {
        return res.status(400).json({ error: `Row ${rowNum}: name and type are required` });
      }
      if (!['stock', 'raw_material'].includes(row.type)) {
        return res.status(400).json({ error: `Row ${rowNum}: invalid type` });
      }
      if (row.type === 'stock' && !row.category_name) {
        return res.status(400).json({ error: `Row ${rowNum}: category is required` });
      }
      if (row.type === 'raw_material' && !unitIdByName.has(String(row.unit || '').toLowerCase())) {
        return res.status(400).json({ error: `Row ${rowNum}: unit is required` });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const categoryIdByName = new Map();
      const created = [];

      for (const row of products) {
        const isStock = row.type === 'stock';
        let categoryId = null;

        if (isStock) {
          const key = row.category_name.trim().toLowerCase();
          if (categoryIdByName.has(key)) {
            categoryId = categoryIdByName.get(key);
          } else {
            const catResult = await client.query(
              `INSERT INTO product_categories (name) VALUES ($1)
               ON CONFLICT (LOWER(name)) DO UPDATE SET name = product_categories.name
               RETURNING *`,
              [row.category_name.trim()]
            );
            categoryId = catResult.rows[0].id;
            categoryIdByName.set(key, categoryId);
          }
        }

        const unitId = isStock ? null : unitIdByName.get(String(row.unit).toLowerCase());

        const result = await client.query(
          `INSERT INTO products (name, type, category_id, size, unit_id, description)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            row.name,
            row.type,
            isStock ? categoryId : null,
            isStock ? (row.size || null) : null,
            unitId,
            row.description || null
          ]
        );
        created.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.status(201).json(created);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(400).json({ error: 'One or more products already exist with that name, type and size — give same-named stock products different sizes' });
      }
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
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
      let unitId = null;

      if (!isStock) {
        if (!unit) return res.status(400).json({ error: 'Unit is required' });
        const unitResult = await pool.query('SELECT id FROM product_units WHERE LOWER(name) = LOWER($1)', [unit]);
        if (unitResult.rows.length === 0) return res.status(400).json({ error: 'Invalid unit' });
        unitId = unitResult.rows[0].id;
      }

      const result = await pool.query(
        `UPDATE products
         SET name = $1, type = $2, category_id = $3, size = $4, unit_id = $5, description = $6, updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [
          name,
          type,
          isStock ? (category_id || null) : null,
          isStock ? (size || null) : null,
          unitId,
          description || null,
          req.params.id
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        const isStock = req.body.type !== 'raw_material';
        const sizeNote = isStock && req.body.size ? ` with size "${req.body.size}"` : '';
        return res.status(400).json({ error: `A ${isStock ? 'stock' : 'raw material'} product named "${req.body.name}"${sizeNote} already exists${isStock && !req.body.size ? ' — add a size to tell them apart' : ''}` });
      }
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
      const name = (req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'Category name is required' });
      }

      const dup = await pool.query('SELECT id FROM product_categories WHERE LOWER(name) = LOWER($1)', [name]);
      if (dup.rows.length > 0) {
        return res.status(400).json({ error: 'A category with this name already exists' });
      }

      const result = await pool.query(
        `INSERT INTO product_categories (name) VALUES ($1) RETURNING *`,
        [name]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'A category with this name already exists' });
      }
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * PUT /api/products/categories/:id
   * Body: { name }
   */
  static async updateCategory(req, res) {
    try {
      const name = (req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'Category name is required' });
      }

      const dup = await pool.query(
        'SELECT id FROM product_categories WHERE LOWER(name) = LOWER($1) AND id != $2',
        [name, req.params.id]
      );
      if (dup.rows.length > 0) {
        return res.status(400).json({ error: 'A category with this name already exists' });
      }

      const result = await pool.query(
        'UPDATE product_categories SET name = $1 WHERE id = $2 RETURNING *',
        [name, req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'A category with this name already exists' });
      }
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * DELETE /api/products/categories/:id
   */
  static async deleteCategory(req, res) {
    try {
      const result = await pool.query('DELETE FROM product_categories WHERE id = $1 RETURNING *', [req.params.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.json({ message: 'Category deleted' });
    } catch (err) {
      if (err.code === '23503') {
        return res.status(400).json({ error: 'Cannot delete: one or more products are using this category' });
      }
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/products/units
   */
  static async getUnits(req, res) {
    try {
      const result = await pool.query('SELECT * FROM product_units ORDER BY name ASC');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/products/units
   * Body: { name }
   */
  static async createUnit(req, res) {
    try {
      const name = (req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'Unit name is required' });
      }

      const dup = await pool.query('SELECT id FROM product_units WHERE LOWER(name) = LOWER($1)', [name]);
      if (dup.rows.length > 0) {
        return res.status(400).json({ error: 'A unit with this name already exists' });
      }

      const result = await pool.query(
        `INSERT INTO product_units (name) VALUES ($1) RETURNING *`,
        [name]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'A unit with this name already exists' });
      }
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * PUT /api/products/units/:id
   * Body: { name }
   */
  static async updateUnit(req, res) {
    try {
      const name = (req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'Unit name is required' });
      }

      const dup = await pool.query(
        'SELECT id FROM product_units WHERE LOWER(name) = LOWER($1) AND id != $2',
        [name, req.params.id]
      );
      if (dup.rows.length > 0) {
        return res.status(400).json({ error: 'A unit with this name already exists' });
      }

      const result = await pool.query(
        'UPDATE product_units SET name = $1 WHERE id = $2 RETURNING *',
        [name, req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Unit not found' });
      }

      res.json(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'A unit with this name already exists' });
      }
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * DELETE /api/products/units/:id
   */
  static async deleteUnit(req, res) {
    try {
      const result = await pool.query('DELETE FROM product_units WHERE id = $1 RETURNING *', [req.params.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Unit not found' });
      }

      res.json({ message: 'Unit deleted' });
    } catch (err) {
      if (err.code === '23503') {
        return res.status(400).json({ error: 'Cannot delete: one or more products are using this unit' });
      }
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = ProductsController;
