const pool = require('../db/pool');

// Get all assets with filters
const getAssets = async (req, res) => {
  try {
    const { categoryId, status, startDate, endDate, search, sortBy = 'purchase_date', order = 'DESC', page = 1, limit = 10 } = req.query;
    
    let query = `
      SELECT a.*, ac.name as category_name 
      FROM assets a
      LEFT JOIN asset_categories ac ON a.category_id = ac.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (categoryId) {
      query += ` AND a.category_id = $${paramIndex++}`;
      params.push(categoryId);
    }

    if (status) {
      query += ` AND a.status = $${paramIndex++}`;
      params.push(status);
    }

    if (startDate) {
      query += ` AND a.purchase_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND a.purchase_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (search) {
      query += ` AND (a.name ILIKE $${paramIndex++} OR a.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`, `%${search}%`);
      paramIndex += 2;
    }

    // Valid sort columns
    const validSortColumns = ['purchase_date', 'purchase_cost', 'current_value', 'name', 'category_name'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'purchase_date';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY a.${sortColumn} ${sortOrder}`;

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) FROM assets WHERE 1=1`;
    const countParams = [];
    let countParamIndex = 1;
    
    if (categoryId) {
      countQuery += ` AND category_id = $${countParamIndex++}`;
      countParams.push(categoryId);
    }
    if (status) {
      countQuery += ` AND status = $${countParamIndex++}`;
      countParams.push(status);
    }
    if (startDate) {
      countQuery += ` AND purchase_date >= $${countParamIndex++}`;
      countParams.push(startDate);
    }
    if (endDate) {
      countQuery += ` AND purchase_date <= $${countParamIndex++}`;
      countParams.push(endDate);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get single asset
const getAssetById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT a.*, ac.name as category_name FROM assets a
       LEFT JOIN asset_categories ac ON a.category_id = ac.id
       WHERE a.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Create asset
const createAsset = async (req, res) => {
  try {
    const { categoryId, name, description, purchaseDate, purchaseCost, currentValue, depreciationRate, status, location } = req.body;
    
    if (!categoryId || !name || !purchaseDate || !purchaseCost) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO assets (category_id, name, description, purchase_date, purchase_cost, current_value, depreciation_rate, status, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [categoryId, name, description || null, purchaseDate, purchaseCost, currentValue || purchaseCost, depreciationRate || 0, status || 'active', location || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update asset
const updateAsset = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, name, description, purchaseDate, purchaseCost, currentValue, depreciationRate, status, location } = req.body;

    const result = await pool.query(
      `UPDATE assets 
       SET category_id = $1, name = $2, description = $3, purchase_date = $4, purchase_cost = $5, 
           current_value = $6, depreciation_rate = $7, status = $8, location = $9, updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [categoryId, name, description, purchaseDate, purchaseCost, currentValue, depreciationRate, status, location, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete asset
const deleteAsset = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM assets WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    res.json({ success: true, message: 'Asset deleted', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all asset categories
const getCategories = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM asset_categories ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get asset summary
const getAssetSummary = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ac.name as category, COUNT(*) as count, SUM(a.purchase_cost) as total_purchase_cost, SUM(a.current_value) as total_current_value
      FROM assets a
      LEFT JOIN asset_categories ac ON a.category_id = ac.id
      GROUP BY ac.name
      ORDER BY total_current_value DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
  getCategories,
  getAssetSummary
};
