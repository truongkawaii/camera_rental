// middleware/blacklist.js
const { pool } = require('../utils/db');

/**
 * Middleware to check if the customer in the request body is blacklisted.
 * Should be used on rental creation endpoints.
 * Expects customer_id in req.body.
 */
const checkBlacklist = async (req, res, next) => {
  const customerId = req.body.customer_id;

  if (!customerId) {
    return next(); // Skip if no customer_id (validation will catch this later)
  }

  try {
    const result = await pool.query(`
      SELECT id, reason, blacklisted_at
      FROM blacklist
      WHERE customer_id = $1
        AND is_deleted = false
        AND unblacklisted_at IS NULL
      ORDER BY blacklisted_at DESC
      LIMIT 1
    `, [customerId]);

    if (result.rows.length > 0) {
      const entry = result.rows[0];
      return res.status(403).json({
        error: 'Khách hàng này đang trong danh sách hạn chế.',
        blacklist_reason: entry.reason,
        blacklisted_at: entry.blacklisted_at
      });
    }

    next();
  } catch (error) {
    console.error('Blacklist check error:', error);
    // Don't block the request on check failure, let it proceed
    next();
  }
};

module.exports = { checkBlacklist };
