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
exports.addStock = async (req, res) => {
  const { name, unit_price, quantity, category, size, extra } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO stock (name, unit_price, quantity, category, size, extra)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, unit_price, quantity || 0, category, size, extra]
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