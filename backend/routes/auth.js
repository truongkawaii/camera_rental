// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { pool } = require('../utils/db');
const { logActivity } = require('../utils/logger');

const router = express.Router();

// Login route
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
  try {
    // Fetch user + all their roles via user_roles junction table
    const userResult = await pool.query(
      `SELECT u.id, u.username, u.password, u.full_name, u.branch_id
       FROM users u
       WHERE u.username = $1 AND u.is_deleted = false`,
      [username]
    );
    if (userResult.rows.length === 0) return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });

    const user = userResult.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });

    // Fetch all roles for this user
    const rolesResult = await pool.query(
      `SELECT r.name FROM roles r
       INNER JOIN user_roles ur ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND ur.is_deleted = false
       ORDER BY r.id ASC`,
      [user.id]
    );
    const roles = rolesResult.rows.map(r => r.name);

    // Fetch all branches for this user
    const branchesResult = await pool.query(
      `SELECT branch_id FROM user_branches
       WHERE user_id = $1 AND is_deleted = false
       ORDER BY branch_id ASC`,
      [user.id]
    );
    const branch_ids = branchesResult.rows.map(b => b.branch_id);

    const payload = {
      id: user.id,
      username: user.username,
      roles,
      full_name: user.full_name,
      branch_id: user.branch_id, // Keep for backward compatibility
      branch_ids,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '8h' });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        roles,
        full_name: user.full_name,
        branch_id: user.branch_id,
        branch_ids,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Đăng nhập thất bại.' });
  }
});

// Get current user
router.get('/me', require('../middleware/auth').authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
