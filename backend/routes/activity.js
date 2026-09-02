// routes/activity.js
const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get activity logs (admin only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = (req.query.search || '').trim();
  const { startDate, endDate } = req.query;
  const entityTypeRaw = (req.query.entityType || '').trim();

  try {
    const filters = ['al.is_deleted = false'];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      filters.push(`(al.description ILIKE $${params.length} OR al.action ILIKE $${params.length} OR al.entity_type ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
    }

    // Entity type filter (comma-separated, e.g. "rental,customer")
    if (entityTypeRaw) {
      const entityTypes = entityTypeRaw.split(',').map(s => s.trim()).filter(Boolean);
      if (entityTypes.length > 0) {
        params.push(entityTypes);
        filters.push(`al.entity_type = ANY($${params.length})`);
      }
    }

    if (startDate) {
      params.push(new Date(`${startDate}T00:00:00+07:00`).toISOString());
      filters.push(`al.inserted_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(new Date(`${endDate}T23:59:59.999+07:00`).toISOString());
      filters.push(`al.inserted_at <= $${params.length}`);
    }

    const whereClause = `WHERE ${filters.join(' AND ')}`;

    let countQuery = `
      SELECT COUNT(*) 
      FROM activity_logs al
      LEFT JOIN users u ON al.inserted_by = u.id
      ${whereClause}
    `;

    let dataQuery = `
      SELECT al.id, al.action, al.entity_type, al.entity_id, al.description, al.inserted_at,
             u.username as performed_by_username, u.full_name as performed_by_name
      FROM activity_logs al
      LEFT JOIN users u ON al.inserted_by = u.id
      ${whereClause}
    `;

    const dataParams = [...params, limit, offset];
    dataQuery += `
      ORDER BY al.inserted_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    const result = await pool.query(dataQuery, dataParams);
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
    console.error('Fetch activity logs error:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

module.exports = router;
