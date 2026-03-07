const pool = require('../db/pool');

// Get all employees with filters
const getEmployees = async (req, res) => {
  try {
    const { typeId, status, startDate, endDate, search, sortBy = 'hire_date', order = 'DESC', page = 1, limit = 10 } = req.query;
    
    let query = `
      SELECT e.*, et.type_name 
      FROM employees e
      LEFT JOIN employee_types et ON e.employee_type_id = et.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (typeId) {
      query += ` AND e.employee_type_id = $${paramIndex++}`;
      params.push(typeId);
    }

    if (status) {
      query += ` AND e.status = $${paramIndex++}`;
      params.push(status);
    }

    if (startDate) {
      query += ` AND e.hire_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND e.hire_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (search) {
      query += ` AND (CONCAT(e.first_name, ' ', e.last_name) ILIKE $${paramIndex++} OR e.email ILIKE $${paramIndex} OR e.phone ILIKE $${paramIndex})`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      paramIndex += 3;
    }

    // Valid sort columns
    const validSortColumns = ['hire_date', 'salary', 'first_name', 'type_name'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'hire_date';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY e.${sortColumn} ${sortOrder}`;

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) FROM employees WHERE 1=1`;
    const countParams = [];
    let countParamIndex = 1;
    
    if (typeId) {
      countQuery += ` AND employee_type_id = $${countParamIndex++}`;
      countParams.push(typeId);
    }
    if (status) {
      countQuery += ` AND status = $${countParamIndex++}`;
      countParams.push(status);
    }
    if (startDate) {
      countQuery += ` AND hire_date >= $${countParamIndex++}`;
      countParams.push(startDate);
    }
    if (endDate) {
      countQuery += ` AND hire_date <= $${countParamIndex++}`;
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

// Get single employee
const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT e.*, et.type_name FROM employees e
       LEFT JOIN employee_types et ON e.employee_type_id = et.id
       WHERE e.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Create employee
const createEmployee = async (req, res) => {
  try {
    const { employeeTypeId, firstName, lastName, email, phone, position, salary, hireDate, status, department } = req.body;
    
    if (!employeeTypeId || !firstName || !lastName || !salary || !hireDate) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const result = await pool.query(
      `INSERT INTO employees (employee_type_id, first_name, last_name, email, phone, position, salary, hire_date, status, department)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [employeeTypeId, firstName, lastName, email || null, phone || null, position || null, salary, hireDate, status || 'active', department || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update employee
const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeTypeId, firstName, lastName, email, phone, position, salary, hireDate, status, department } = req.body;

    const result = await pool.query(
      `UPDATE employees 
       SET employee_type_id = $1, first_name = $2, last_name = $3, email = $4, phone = $5, 
           position = $6, salary = $7, hire_date = $8, status = $9, department = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $11
       RETURNING *`,
      [employeeTypeId, firstName, lastName, email, phone, position, salary, hireDate, status, department, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete employee
const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM employees WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Employee not found' });
    }

    res.json({ success: true, message: 'Employee deleted', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all employee types
const getEmployeeTypes = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employee_types ORDER BY type_name');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get employee summary
const getEmployeeSummary = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT et.type_name as type, COUNT(*) as count, SUM(e.salary) as total_salary, AVG(e.salary) as avg_salary
      FROM employees e
      LEFT JOIN employee_types et ON e.employee_type_id = et.id
      WHERE e.status = 'active'
      GROUP BY et.type_name
      ORDER BY count DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeTypes,
  getEmployeeSummary
};
