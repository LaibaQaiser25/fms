const { Pool } = require('pg');
require('dotenv').config();

console.log('🔍 DB URL:', process.env.DATABASE_URL); // debug line

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(() => console.log('✅ PostgreSQL connected!'))
  .catch(err => console.error('❌ DB Error:', err.message));

module.exports = pool;