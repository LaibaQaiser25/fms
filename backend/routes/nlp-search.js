const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pool = require('../db'); // your pg pool

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SCHEMA_CONTEXT = `
You are a PostgreSQL expert for a factory management system.
Convert natural language to a SELECT query ONLY. No explanations, no markdown, just raw SQL.

Schema:
- stock(id, name, unit_price, quantity, category, size, minimum_stock)
- sales(id, sale_no, customer_id, customer_name, total_amount, advance_paid, balance, payment_type, status, created_at)
- sale_items(id, sale_id, stock_id, product_name, quantity, unit_price, amount)
- invoices(id, invoice_no, customer_id, customer_name, total_amount, status, advance_paid, outstanding_debt, invoice_type, created_at)
- invoice_items(id, invoice_id, stock_id, product_name, price, quantity, amount)
- customers(id, name, phone, email, address)
- customer_ledger(id, customer_id, customer_name, invoice_id, debit, credit, debt, transaction_type, created_at)
- ledger(id, customer_name, invoice_id, invoice_no, debit, credit, note, date)
- payment_records(id, customer_id, customer_name, sale_id, invoice_id, payment_amount, payment_type, created_at)
- expenses(id, category_id, description, amount, date)
- expense_categories(id, name)
- employees(id, first_name, last_name, position, salary, department, status, hire_date)
- employee_types(id, type_name)
- assets(id, name, purchase_cost, current_value, depreciation_rate, status, location)
- asset_categories(id, name)
- production_queue(id, product_name, stock_id, required_quantity, priority, status, sale_id, created_at)

For gross profit: use sale_items.amount (revenue) - (sale_items.quantity * stock.unit_price) (cost)
`;

router.post('/nlp-search', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(`${SCHEMA_CONTEXT}\n\nUser query: "${query}"`);
    let sql = result.response.text().trim();

    // clean up if model wraps in markdown
    sql = sql.replace(/```sql|```/gi, '').trim();

    if (!sql.toUpperCase().startsWith('SELECT')) {
      return res.status(400).json({ error: 'Only SELECT queries allowed' });
    }

    const dbResult = await pool.query(sql);
    res.json({ sql, data: dbResult.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed', details: err.message });
  }
});

module.exports = router;