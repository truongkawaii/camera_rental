// routes/roles.js
const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all roles
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, description FROM roles WHERE is_deleted = false ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

module.exports = router;
