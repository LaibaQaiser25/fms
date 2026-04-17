const pool = require('../db/pool');

class CustomersController {
  /**
   * Create a new customer
   * POST /api/customers
   */
  static async createCustomer(req, res) {
    try {
      const { name, phone, address, email } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Customer name is required' });
      }

      const result = await pool.query(
        `INSERT INTO customers (name, phone, address, email)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [name, phone || null, address || null, email || null]
      );

      res.status(201).json({
        success: true,
        message: 'Customer created successfully',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error creating customer:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get all customers with auto-suggestion
   * GET /api/customers?search=customer_name&limit=10
   */
  static async searchCustomers(req, res) {
    try {
      const { search = '', limit = 10 } = req.query;

      let query = 'SELECT * FROM customers';
      let params = [];

      if (search) {
        query += ' WHERE LOWER(name) ILIKE LOWER($1)';
        params.push(`%${search}%`);
        query += ` LIMIT $${params.length + 1}`;
        params.push(limit);
      } else {
        query += ` LIMIT $${params.length + 1}`;
        params.push(limit);
      }

      const result = await pool.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ Error searching customers:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get all customers with pagination
   * GET /api/customers/list?page=1&limit=10
   */
  static async getAllCustomers(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const result = await pool.query(
        'SELECT * FROM customers ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );

      const countResult = await pool.query('SELECT COUNT(*) FROM customers');
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
      console.error('❌ Error fetching customers:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get single customer
   * GET /api/customers/:id
   */
  static async getCustomer(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'SELECT * FROM customers WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error fetching customer:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update customer
   * PUT /api/customers/:id
   */
  static async updateCustomer(req, res) {
    try {
      const { id } = req.params;
      const { name, phone, address, email } = req.body;

      const result = await pool.query(
        `UPDATE customers 
         SET name = COALESCE($1, name),
             phone = COALESCE($2, phone),
             address = COALESCE($3, address),
             email = COALESCE($4, email),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [name || null, phone || null, address || null, email || null, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      res.json({
        success: true,
        message: 'Customer updated',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error updating customer:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Delete customer
   * DELETE /api/customers/:id
   */
  static async deleteCustomer(req, res) {
    try {
      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM customers WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      res.json({
        success: true,
        message: 'Customer deleted',
        data: result.rows[0]
      });

    } catch (error) {
      console.error('❌ Error deleting customer:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = CustomersController;
