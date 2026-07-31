#!/usr/bin/env node
/**
 * Database initialization script for FMS Auth
 * Adds demo user to existing users table
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../db/pool');

const initAuth = async () => {
  try {
    console.log('🔄 Initializing authentication...');

    // Check if users table exists
    const tableExists = await pool.query(`
      SELECT to_regclass('public.users');
    `);

    if (!tableExists.rows[0].to_regclass) {
      console.log('⚠️  Users table does not exist. Run pgdb.sql first:');
      console.log('   psql -U postgres -d fms_db -f backend/db/pgdb.sql');
      process.exit(1);
    }

    console.log('✅ Users table verified');

    // Check if demo user exists
    const result = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      ['admin']
    );

    if (result.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('password123', 10);

      await pool.query(
        'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        ['admin', 'admin@binzahid.com', hashedPassword, 'Owner']
      );
      console.log('✅ Demo user created:');
      console.log('   Username: admin');
      console.log('   Password: password123');
      console.log('   Role: Owner');
      console.log('   Email: admin@binzahid.com');
    } else {
      console.log('✅ Demo user already exists');
    }

    console.log('\n🎉 Authentication initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Initialization failed:', error.message);
    process.exit(1);
  }
};

initAuth();
