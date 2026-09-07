const { Pool } = require('pg');
require('dotenv').config();

console.log('🔍 DB: connecting...'); // avoid logging the full DATABASE_URL (contains credentials)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(() => console.log('✅ PostgreSQL connected!'))
  .catch(err => console.error('❌ DB Error:', err.message));

module.exports = pool;