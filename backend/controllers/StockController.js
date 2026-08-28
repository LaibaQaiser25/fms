const pool = require('../db/pool');

// GET all stock items
exports.getAllStock = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stock ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET search stock by name (autocomplete)
exports.searchStock = async (req, res) => {
  try {
    const { q } = req.query;
    const result = await pool.query(
      `SELECT * FROM stock WHERE name ILIKE $1 ORDER BY name ASC LIMIT 10`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET single stock item
exports.getStockById = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stock WHERE id = $1', [req.params.id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST add new stock item
// Name, category, and size are not free-typed here — they're pulled from an existing
// Stock-type product in the catalog, so a new stock row can't drift from its product
// definition. Only unit_price/quantity/extra are entered directly.
exports.addStock = async (req, res) => {
  const { product_id, unit_price, quantity, extra } = req.body;
  try {
    if (!product_id) {
      return res.status(400).json({ error: 'product_id is required' });
    }

    const productResult = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN product_categories c ON c.id = p.category_id
       WHERE p.id = $1 AND p.type = 'stock'`,
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return res.status(400).json({ error: 'Product not found or is not a Stock-type product' });
    }

    const product = productResult.rows[0];

    const result = await pool.query(
      `INSERT INTO stock (name, unit_price, quantity, category, size, extra, product_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [product.name, unit_price, quantity || 0, product.category_name, product.size, extra, product.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT update stock item
exports.updateStock = async (req, res) => {
  const { name, unit_price, quantity, category, size, extra } = req.body;
  try {
    const result = await pool.query(
      `UPDATE stock SET name=$1, unit_price=$2, quantity=$3, category=$4, size=$5, extra=$6
       WHERE id=$7 RETURNING *`,
      [name, unit_price, quantity, category, size, extra, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE stock item
exports.deleteStock = async (req, res) => {
  try {
    await pool.query('DELETE FROM stock WHERE id = $1', [req.params.id]);
    res.json({ message: 'Stock item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};