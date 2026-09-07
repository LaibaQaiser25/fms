// Seeds (or updates) the 'owner' Owner-role user with a bcrypt password.
// Run inside the backend container: OWNER_PW=... node seed-owner.js
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

(async () => {
  const pw = process.env.OWNER_PW;
  if (!pw || pw.length < 8) {
    console.error('OWNER_PW env must be set to a password of 8+ chars');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = bcrypt.hashSync(pw, 10);
  const r = await pool.query(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
    ['owner', process.env.OWNER_EMAIL || 'owner@binzahidtraders.com', hash, 'Owner']
  );
  console.log('owner ready (upserted rows:', r.rowCount, ')');
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
