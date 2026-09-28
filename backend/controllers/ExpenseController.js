const pool = require('../db/pool');
const { sendWhatsApp } = require('../services/whatsappService');

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

    const categoryResult = await pool.query('SELECT name FROM expense_categories WHERE id = $1', [categoryId]);
    const categoryName = categoryResult.rows[0]?.name || 'Uncategorized';

    await sendWhatsApp(
      `💸 *New Expense*\n\n• Category: ${categoryName}\n• Description: ${description}\n• Amount: Rs.${amount}\n• Date: ${date}`
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

// Create expense category — user-created, together with its initial expense
// (same idea as a new product seeding its stock row with the initial quantity).
// Body: { name, amount, date?, description? }. An amount of 0 creates the
// category without an expense row.
const createCategory = async (req, res) => {
  const name = (req.body.name || '').trim();
  const { amount } = req.body;
  const date = req.body.date || new Date().toISOString().split('T')[0];
  const description = (req.body.description || '').trim() || 'Initial expense';

  if (!name) {
    return res.status(400).json({ success: false, error: 'Category name is required' });
  }
  if (amount === undefined || amount === null || amount === '' || Number.isNaN(Number(amount)) || Number(amount) < 0) {
    return res.status(400).json({ success: false, error: 'Initial amount is required' });
  }

  const client = await pool.connect();
  try {
    const dup = await client.query('SELECT id FROM expense_categories WHERE LOWER(name) = LOWER($1)', [name]);
    if (dup.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'A category with this name already exists' });
    }

    await client.query('BEGIN');

    const catResult = await client.query(
      'INSERT INTO expense_categories (name) VALUES ($1) RETURNING *',
      [name]
    );
    const category = catResult.rows[0];

    let expense = null;
    if (Number(amount) > 0) {
      const expResult = await client.query(
        `INSERT INTO expenses (category_id, description, amount, date)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [category.id, description, Number(amount), date]
      );
      expense = expResult.rows[0];
    }

    await client.query('COMMIT');

    if (expense) {
      await sendWhatsApp(
        `💸 *New Expense*\n\n• Category: ${name}\n• Description: ${description}\n• Amount: Rs.${Number(amount)}\n• Date: ${date}`
      );
    }

    res.status(201).json({ success: true, data: category, expense });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'A category with this name already exists' });
    }
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
};

// Rename expense category
const updateCategory = async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    const dup = await pool.query(
      'SELECT id FROM expense_categories WHERE LOWER(name) = LOWER($1) AND id != $2',
      [name, req.params.id]
    );
    if (dup.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'A category with this name already exists' });
    }

    const result = await pool.query(
      'UPDATE expense_categories SET name = $1 WHERE id = $2 RETURNING *',
      [name, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, error: 'A category with this name already exists' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete expense category (blocked while expenses still use it)
const deleteCategory = async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM expense_categories WHERE id = $1 RETURNING *', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({ success: false, error: 'Cannot delete: one or more expenses are using this category' });
    }
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
  createCategory,
  updateCategory,
  deleteCategory,
  getExpenseSummary
};
