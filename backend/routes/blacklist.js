// routes/blacklist.js
const express = require('express');
const { pool } = require('../utils/db');
const { logActivity } = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET all blacklist entries with pagination & search
router.get('/', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = (req.query.search || '').trim();
  const status = req.query.status || 'active'; // 'active' | 'all' | 'removed'
  const offset = (page - 1) * limit;

  try {
    let whereClause = 'WHERE bl.is_deleted = false';
    const params = [];

    // Filter by blacklist status
    if (status === 'active') {
      whereClause += ' AND bl.unblacklisted_at IS NULL';
    } else if (status === 'removed') {
      whereClause += ' AND bl.unblacklisted_at IS NOT NULL';
    }

    // Search by customer name, phone, or reason
    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (
        c.name ILIKE $${params.length} OR
        c.phone ILIKE $${params.length} OR
        bl.reason ILIKE $${params.length}
      )`;
    }

    const countResult = await pool.query(`
      SELECT COUNT(*)
      FROM blacklist bl
      JOIN customers c ON bl.customer_id = c.id
      ${whereClause}
    `, params);

    const totalCount = parseInt(countResult.rows[0].count);

    const result = await pool.query(`
      SELECT
        bl.id, bl.customer_id, bl.reason, bl.blacklisted_at, bl.unblacklisted_at,
        bl.blacklisted_by, bl.unblacklisted_by,
        c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
        bb.full_name as blacklisted_by_name, bb.username as blacklisted_by_username,
        ub.full_name as unblacklisted_by_name, ub.username as unblacklisted_by_username,
        (SELECT COUNT(*) FROM rentals r WHERE r.customer_id = bl.customer_id AND r.is_deleted = false)::int as total_rentals,
        (SELECT COUNT(*) FROM rentals r WHERE r.customer_id = bl.customer_id AND r.is_deleted = false AND r.status NOT IN ('cancelled', 'completed'))::int as active_rentals
      FROM blacklist bl
      JOIN customers c ON bl.customer_id = c.id
      LEFT JOIN users bb ON bl.blacklisted_by = bb.id
      LEFT JOIN users ub ON bl.unblacklisted_by = ub.id
      ${whereClause}
      ORDER BY bl.blacklisted_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    res.json({
      data: result.rows,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Fetch blacklist error:', error);
    res.status(500).json({ error: 'Failed to fetch blacklist' });
  }
});

// GET check if a specific customer is currently blacklisted
router.get('/check/:customerId', authenticate, async (req, res) => {
  const { customerId } = req.params;

  try {
    const result = await pool.query(`
      SELECT bl.id, bl.customer_id, bl.reason, bl.blacklisted_at,
             c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      FROM blacklist bl
      JOIN customers c ON bl.customer_id = c.id
      WHERE bl.customer_id = $1
        AND bl.is_deleted = false
        AND bl.unblacklisted_at IS NULL
      ORDER BY bl.blacklisted_at DESC
      LIMIT 1
    `, [customerId]);

    if (result.rows.length > 0) {
      return res.json({
        is_blacklisted: true,
        entry: result.rows[0]
      });
    }

    res.json({ is_blacklisted: false, entry: null });
  } catch (error) {
    console.error('Check blacklist error:', error);
    res.status(500).json({ error: 'Failed to check blacklist status' });
  }
});

// POST blacklist a customer (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { customer_id, reason } = req.body;

  if (!customer_id) {
    return res.status(400).json({ error: 'Vui lòng chọn khách hàng cần đưa vào danh sách hạn chế.' });
  }

  const client = await pool.connect();
  try {
    // Check if customer exists
    const custResult = await client.query(
      'SELECT id, name FROM customers WHERE id = $1 AND is_deleted = false',
      [customer_id]
    );
    if (custResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy khách hàng.' });
    }

    // Check if already blacklisted (active)
    const existingResult = await client.query(
      'SELECT id FROM blacklist WHERE customer_id = $1 AND is_deleted = false AND unblacklisted_at IS NULL',
      [customer_id]
    );
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Khách hàng này đã có trong danh sách hạn chế.' });
    }

    const result = await client.query(`
      INSERT INTO blacklist (customer_id, reason, blacklisted_by, inserted_by, updated_by)
      VALUES ($1, $2, $3, $3, $3)
      RETURNING *
    `, [customer_id, reason || null, req.user.id]);

    const entry = result.rows[0];
    await logActivity(
      'BLACKLIST',
      'customer',
      customer_id,
      `Đưa khách hàng "${custResult.rows[0].name}" vào danh sách hạn chế${reason ? ` - Lý do: ${reason}` : ''}`,
      req.user.id
    );

    res.status(201).json(entry);
  } catch (error) {
    console.error('Blacklist customer error:', error);
    res.status(500).json({ error: 'Failed to blacklist customer' });
  } finally {
    client.release();
  }
});

// PUT unblacklist a customer (admin only)
router.put('/:id/unblacklist', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();
  try {
    // Check if blacklist entry exists and is active
    const existingResult = await client.query(`
      SELECT bl.*, c.name as customer_name
      FROM blacklist bl
      JOIN customers c ON bl.customer_id = c.id
      WHERE bl.id = $1 AND bl.is_deleted = false AND bl.unblacklisted_at IS NULL
    `, [id]);

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy mục danh sách hạn chế đang hoạt động.' });
    }

    const entry = existingResult.rows[0];

    const result = await client.query(`
      UPDATE blacklist
      SET unblacklisted_at = NOW(),
          unblacklisted_by = $2,
          updated_at = NOW(),
          updated_by = $2
      WHERE id = $1 AND is_deleted = false AND unblacklisted_at IS NULL
      RETURNING *
    `, [id, req.user.id]);

    const updated = result.rows[0];

    await logActivity(
      'UNBLACKLIST',
      'customer',
      entry.customer_id,
      `Gỡ khách hàng "${entry.customer_name}" khỏi danh sách hạn chế`,
      req.user.id
    );

    res.json(updated);
  } catch (error) {
    console.error('Unblacklist customer error:', error);
    res.status(500).json({ error: 'Failed to unblacklist customer' });
  } finally {
    client.release();
  }
});

// DELETE permanently remove a blacklist entry (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      UPDATE blacklist
      SET is_deleted = true, updated_at = NOW(), updated_by = $2
      WHERE id = $1
      RETURNING id, customer_id
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Blacklist entry not found' });
    }

    await logActivity(
      'DELETE',
      'blacklist',
      id,
      `Xóa vĩnh viễn mục danh sách hạn chế #${id} (khách hàng #${result.rows[0].customer_id})`,
      req.user.id
    );

    res.json({ message: 'Blacklist entry deleted', id: result.rows[0].id });
  } catch (error) {
    console.error('Delete blacklist entry error:', error);
    res.status(500).json({ error: 'Failed to delete blacklist entry' });
  }
});

module.exports = router;
