const pool = require('../db/pool');
const bcrypt = require('bcrypt');

// Mirrors the DB check constraint (users_role_check) — see migration 013.
const ALLOWED_ROLES = ['Owner', 'Manager', 'Guest'];

const matchRole = (role) =>
  ALLOWED_ROLES.find((r) => r.toLowerCase() === String(role).toLowerCase());

class UsersController {
  // Every method here sits behind requireOwner (server.js) — only an Owner
  // reaches this controller at all.

  static async getAllUsers(req, res) {
    try {
      const result = await pool.query(
        'SELECT id, username, email, role, created_at FROM users ORDER BY id'
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
  }

  static async createUser(req, res) {
    try {
      const { username, email, password, role } = req.body;

      if (!username || !email || !password || !role) {
        return res.status(400).json({ success: false, error: 'Username, email, password, and role are required' });
      }
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }
      const matchedRole = matchRole(role);
      if (!matchedRole) {
        return res.status(400).json({ success: false, error: `Role must be one of: ${ALLOWED_ROLES.join(', ')}` });
      }

      const existing = await pool.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Username or email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at',
        [username, email, passwordHash, matchedRole]
      );

      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ success: false, error: 'Failed to create user' });
    }
  }

  // Username/email only — role isn't editable after creation from this UI.
  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { username, email } = req.body;

      if (!username || !email) {
        return res.status(400).json({ success: false, error: 'Username and email are required' });
      }

      const existing = await pool.query(
        'SELECT id FROM users WHERE (username = $1 OR email = $2) AND id != $3',
        [username, email, id]
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Username or email already in use by another account' });
      }

      const result = await pool.query(
        'UPDATE users SET username = $1, email = $2 WHERE id = $3 RETURNING id, username, email, role, created_at',
        [username, email, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({ success: false, error: 'Failed to update user' });
    }
  }

  // Owner setting another user's password directly — no current-password
  // check, since the Owner's own authentication is the gate here.
  static async setUserPassword(req, res) {
    try {
      const { id } = req.params;
      const { password } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
        [passwordHash, id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
      res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
      console.error('Set password error:', error);
      res.status(500).json({ success: false, error: 'Failed to update password' });
    }
  }

  // The logged-in Owner changing their own password — this one does verify
  // the current password, since there's no separate gate above it.
  static async changeOwnPassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, error: 'Current and new password are required' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
      }

      const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, error: 'Current password is incorrect' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);
      res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      console.error('Change own password error:', error);
      res.status(500).json({ success: false, error: 'Failed to change password' });
    }
  }
}

module.exports = UsersController;
