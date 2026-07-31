const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../db/pool');

const bcrypt = require('bcrypt');

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const TOKEN_EXPIRY = '24h';

// POST /auth/register
router.post('/register', authRateLimiter, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // DB check constraint (users_role_check) only allows exactly 'Owner' / 'Manager'
    const ALLOWED_ROLES = ['Owner', 'Manager'];
    const requestedRole = role
      ? ALLOWED_ROLES.find((r) => r.toLowerCase() === String(role).toLowerCase())
      : 'Manager';
    if (!requestedRole) {
      return res.status(400).json({ error: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` });
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password and insert user
    const hashedPassword = await hashPassword(password);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [username, email, hashedPassword, requestedRole]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.status(201).json({ 
      message: 'User registered successfully',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /auth/login
router.post('/login', authRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const identifier = username?.trim();

    console.log('🔐 Login attempt for identifier:', identifier);

    // Validation
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username/email and password are required' });
    }

    // Find user by username or email
    const result = await pool.query(
      'SELECT id, username, email, password_hash, role FROM users WHERE username = $1 OR email = $1',
      [identifier]
    );

    if (result.rows.length === 0) {
      console.log('❌ User not found for identifier:', identifier);
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    const user = result.rows[0];
    console.log('✅ User found:', username);

    // Check password
    if (!(await comparePassword(password, user.password_hash))) {
      console.log('❌ Invalid password for user:', username);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    console.log('✅ Password correct for user:', username);

    // Generate token
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({ 
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
    console.log('✅ Login successful for user:', username);
  } catch (error) {
    console.error('❌ Login error:', error.message);
    console.error('   Database might not be initialized. Run: node scripts/initAuth.js');
    res.status(500).json({ error: 'Login failed - database error' });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  // Logout is handled on frontend by removing token
  res.json({ message: 'Logout successful' });
});

// GET /auth/me (verify token and get current user)
router.get('/me', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ user: decoded });
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;
