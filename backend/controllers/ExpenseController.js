const pool = require('../db/pool');

// Get all expenses with filters
const getExpenses = async (req, res) => {
  try {
    const { categoryId, startDate, endDate, search, sortBy = 'date', order = 'DESC', page = 1, limit = 10 } = req.query;
    
    let query = `
      SELECT e.*, ec.name as category_name 
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (categoryId) {
      query += ` AND e.category_id = $${paramIndex++}`;
      params.push(categoryId);
    }

    if (startDate) {
      query += ` AND e.date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND e.date <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (search) {
      query += ` AND (e.description ILIKE $${paramIndex++} OR e.notes ILIKE $${paramIndex})`;
      params.push(`%${search}%`, `%${search}%`);
      paramIndex += 2;
    }

    // Valid sort columns
    const validSortColumns = ['date', 'amount', 'category_name', 'description'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'date';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY e.${sortColumn} ${sortOrder}`;

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) FROM expenses WHERE 1=1`;
    const countParams = [];
    let countParamIndex = 1;
    
    if (categoryId) {
      countQuery += ` AND category_id = $${countParamIndex++}`;
      countParams.push(categoryId);
    }
    if (startDate) {
      countQuery += ` AND date >= $${countParamIndex++}`;
      countParams.push(startDate);
    }
    if (endDate) {
      countQuery += ` AND date <= $${countParamIndex++}`;
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

// Get single expense
const getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT e.*, ec.name as category_name FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       WHERE e.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Create expense
const createExpense = async (req, res) => {
  try {
    const { categoryId, description, amount, date, notes } = req.body;
    
    if (!categoryId || !description || !amount || !date) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO expenses (category_id, description, amount, date, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [categoryId, description, amount, date, notes || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update expense
const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, description, amount, date, notes } = req.body;

    const result = await pool.query(
      `UPDATE expenses 
       SET category_id = $1, description = $2, amount = $3, date = $4, notes = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [categoryId, description, amount, date, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete expense
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM expenses WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }

    res.json({ success: true, message: 'Expense deleted', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all expense categories
const getCategories = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM expense_categories ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get expense summary
const getExpenseSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT ec.name as category, COUNT(*) as count, SUM(e.amount) as total
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND e.date >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND e.date <= $${paramIndex++}`;
      params.push(endDate);
    }

    query += ` GROUP BY ec.name ORDER BY total DESC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getCategories,
  getExpenseSummary
};
