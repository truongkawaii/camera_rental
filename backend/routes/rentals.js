// routes/rentals.js
const express = require('express');
const { pool } = require('../utils/db');
const { logActivity } = require('../utils/logger');
const { authenticate, requireAdmin, requireStatusManager, hasRole } = require('../middleware/auth');
const { getDateTimeForPeriod, calculateDaysSessions, formatLocalToGMT } = require('../utils/dateHelpers');
const {
  ImageServiceError,
  normalizeImagePayload,
  replaceEntityImages,
  softDeleteEntityImages
} = require('../utils/imageService');
const {
  calculateCommissionPreview,
  ensureCommissionSnapshotForCompletedRental
} = require('../services/commissionService');

const router = express.Router();

const isInvestorOnly = (user) => hasRole(user, 'investor') && !hasRole(user, 'admin', 'camera_manager');
const isDriverOnly = (user) => hasRole(user, 'driver') && !hasRole(user, 'admin', 'camera_manager', 'investor', 'saler');
const canAssignRentalCreator = (user) => hasRole(user, 'admin', 'camera_manager', 'investor', 'saler');

const RENTAL_SORT_COLUMNS = {
  code: "COALESCE(r.code, 'OD' || LPAD(COALESCE(r.order_number, r.id)::text, 7, '0'))",
  created: 'r.inserted_at',
  customer: 'LOWER(c.name)',
  equipment: 'LOWER(e.name)',
  pickup: 'COALESCE(r.pickup_time, r.start_date)',
  branch: 'LOWER(pb.name)',
  start: 'r.start_date',
  end: 'r.end_date',
  price: 'r.total_price',
  status: `CASE r.status
    WHEN 'pending' THEN 'Chờ giao'
    WHEN 'active' THEN 'Đang thuê'
    WHEN 'completed' THEN 'Hoàn thành'
    WHEN 'cancelled' THEN 'Đã hủy'
    ELSE r.status
  END`
};

const getRentalOrderBy = (sortBy = 'created', sortDir = 'desc') => {
  const column = RENTAL_SORT_COLUMNS[sortBy] || RENTAL_SORT_COLUMNS.created;
  const direction = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const tieBreakerDirection = direction === 'ASC' ? 'ASC' : 'DESC';

  return `${column} ${direction} NULLS LAST, r.id ${tieBreakerDirection}`;
};

const getVNDateRange = (dateValue) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))) return null;
  return [
    new Date(`${dateValue}T00:00:00+07:00`).toISOString(),
    new Date(`${dateValue}T23:59:59.999+07:00`).toISOString()
  ];
};

const normalizeOptionalUserId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const validateRentalCreator = async (client, userId) => {
  const result = await client.query(`
    SELECT u.id
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_deleted = false
    LEFT JOIN roles r ON ur.role_id = r.id
    WHERE u.id = $1
      AND u.is_deleted = false
      AND (
        u.role_id IN (
          SELECT id FROM roles WHERE name IN ('saler', 'camera_manager', 'manager', 'investor')
        )
        OR r.name IN ('saler', 'camera_manager', 'manager', 'investor')
      )
    GROUP BY u.id
  `, [userId]);

  return result.rows.length > 0;
};

const validateDriverUser = async (client, userId) => {
  const result = await client.query(`
    SELECT u.id
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_deleted = false
    LEFT JOIN roles r ON ur.role_id = r.id
    WHERE u.id = $1
      AND u.is_deleted = false
      AND (
        u.role_id IN (
          SELECT id FROM roles WHERE name = 'driver'
        )
        OR r.name = 'driver'
      )
    GROUP BY u.id
  `, [userId]);

  return result.rows.length > 0;
};

// Helper functions reused from original file
const checkAvailability = async (equipmentId, startDate, endDate, excludeRentalId = null) => {
  try {
    const query = `
      SELECT id FROM rentals
      WHERE equipment_id = $1
        AND is_deleted = false
        AND status != 'cancelled'
        AND status != 'completed'
        AND (start_date <= $3 AND end_date >= $2)
        ${excludeRentalId ? 'AND id != $4' : ''}
    `;
    const params = [equipmentId, startDate, endDate];
    if (excludeRentalId) params.push(excludeRentalId);
    const result = await pool.query(query, params);
    if (result.rows.length > 0) return false;

    // Check maintenance overlap
    const maintenanceQuery = `
      SELECT id FROM equipment_maintenance
      WHERE equipment_id = $1
        AND is_deleted = false
        AND status IN ('Đã lên lịch', 'Đang bảo trì')
        AND (maintenance_date <= $3 AND (completed_date IS NULL OR completed_date >= $2))
    `;
    const maintenanceResult = await pool.query(maintenanceQuery, [equipmentId, startDate, endDate]);
    return maintenanceResult.rows.length === 0;
  } catch (err) {
    console.error('Check availability error:', err);
    throw err;
  }
};

// Check accessories for conflicts. An accessory is considered busy if it appears
// in ANY overlapping rental, either as the main equipment or as a rental_accessories mapping.
const findConflictingAccessoryIds = async (accessoryIds, startDate, endDate, excludeRentalId = null) => {
  if (!Array.isArray(accessoryIds) || accessoryIds.length === 0) return [];
  try {
    const excludeClause = excludeRentalId ? ' AND r.id != $4' : '';
    const params = [accessoryIds, startDate, endDate];
    if (excludeRentalId) params.push(excludeRentalId);

    const query = `
      SELECT conflict_id
      FROM (
        SELECT r.equipment_id AS conflict_id
        FROM rentals r
        WHERE r.equipment_id = ANY($1)
          AND r.is_deleted = false
          AND r.status NOT IN ('cancelled', 'completed')
          AND (r.start_date <= $3 AND r.end_date >= $2)
          ${excludeClause}
        UNION
        SELECT ra.equipment_id AS conflict_id
        FROM rental_accessories ra
        JOIN rentals r ON r.id = ra.rental_id
        WHERE ra.equipment_id = ANY($1)
          AND ra.is_deleted = false
          AND r.is_deleted = false
          AND r.status NOT IN ('cancelled', 'completed')
          AND (r.start_date <= $3 AND r.end_date >= $2)
          ${excludeClause}
        UNION
        SELECT em.equipment_id AS conflict_id
        FROM equipment_maintenance em
        WHERE em.equipment_id = ANY($1)
          AND em.is_deleted = false
          AND em.status IN ('Đã lên lịch', 'Đang bảo trì')
          AND (em.maintenance_date <= $3 AND (em.completed_date IS NULL OR em.completed_date >= $2))
      ) conflicts
    `;
    const result = await pool.query(query, params);
    return result.rows.map((row) => Number(row.conflict_id));
  } catch (err) {
    console.error('Check accessory availability error:', err);
    throw err;
  }
};

// GET rental counts by status
router.get('/counts', authenticate, async (req, res) => {
  try {
    let whereClause = 'WHERE is_deleted = false';
    const params = [];
    const isAdmin = hasRole(req.user, 'admin');
    const investorOnly = isInvestorOnly(req.user);
    const isSalerOnly = hasRole(req.user, 'saler') && !hasRole(req.user, 'admin', 'camera_manager', 'investor');
    const driverOnly = isDriverOnly(req.user);
    const branchIds = req.user.branch_ids || [];

    if (investorOnly) {
      params.push(req.user.id);
      whereClause += ` AND EXISTS (
        SELECT 1 FROM equipment e
        WHERE e.id = rentals.equipment_id
          AND e.is_deleted = false
          AND e.owner_id = $${params.length}
      )`;
    } else if (isSalerOnly) {
      params.push(req.user.id);
      whereClause += ` AND user_id = $${params.length}`;
    } else if (driverOnly) {
      // Driver xem tất cả đơn tại cơ sở mình làm việc
      params.push(branchIds.length > 0 ? branchIds : [-1]);
      whereClause += ` AND (branch_id = ANY($${params.length}) OR pickup_branch_id = ANY($${params.length}) OR return_branch_id = ANY($${params.length}))`;
    } else if (!isAdmin) {
      params.push(branchIds.length > 0 ? branchIds : [-1]);
      whereClause += ` AND (branch_id = ANY($${params.length}) OR pickup_branch_id = ANY($${params.length}) OR return_branch_id = ANY($${params.length}))`;
    }

    const result = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM rentals
      ${whereClause}
      GROUP BY status
    `, params);

    const counts = {
      pending: 0,
      active: 0,
      completed: 0,
      cancelled: 0,
      all: 0
    };

    result.rows.forEach(row => {
      const s = row.status;
      if (counts.hasOwnProperty(s)) {
        counts[s] = parseInt(row.count);
      }
      counts.all += parseInt(row.count);
    });

    res.json(counts);
  } catch (error) {
    console.error('Fetch rental counts error:', error);
    res.status(500).json({ error: 'Failed to fetch rental counts' });
  }
});

// POST commission preview for rental payload
router.post('/commission-preview', authenticate, async (req, res) => {
  const {
    total_price,
    user_id,
    handover_user_id,
    effective_at
  } = req.body || {};

  if (total_price === undefined || total_price === null) {
    return res.status(400).json({ error: 'total_price is required' });
  }

  try {
    const preview = await calculateCommissionPreview(pool, {
      total_price,
      user_id,
      handover_user_id,
      effective_at: effective_at || new Date()
    });

    return res.json(preview);
  } catch (error) {
    console.error('Commission preview error:', error);
    return res.status(500).json({ error: 'Failed to preview commission' });
  }
});

// GET rentals (list with pagination & ownership handling)
router.get('/', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const status = req.query.status || 'all';
  const search = (req.query.search || '').trim();
  const view = req.query.view || '';
  const orderBy = view === 'overdue'
    ? `CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, ${getRentalOrderBy(req.query.sortBy, req.query.sortDir)}`
    : getRentalOrderBy(req.query.sortBy, req.query.sortDir);
  let whereClause = 'WHERE r.is_deleted = false';
  const params = [];

  const isAdmin = hasRole(req.user, 'admin');
  const investorOnly = isInvestorOnly(req.user);
  const isSalerOnly = hasRole(req.user, 'saler') && !hasRole(req.user, 'admin', 'camera_manager', 'investor');
  const driverOnly = isDriverOnly(req.user);
  const branchIds = req.user.branch_ids || [];

  if (investorOnly) {
    params.push(req.user.id);
    whereClause += ` AND e.owner_id = $${params.length}`;
  } else if (isSalerOnly) {
    params.push(req.user.id);
    whereClause += ` AND r.user_id = $${params.length}`;
  } else if (driverOnly) {
    // Driver xem tất cả đơn tại cơ sở mình làm việc
    params.push(branchIds.length > 0 ? branchIds : [-1]);
    whereClause += ` AND (r.branch_id = ANY($${params.length}) OR r.pickup_branch_id = ANY($${params.length}) OR r.return_branch_id = ANY($${params.length}))`;
  } else if (!isAdmin) {
    params.push(branchIds.length > 0 ? branchIds : [-1]);
    whereClause += ` AND (r.branch_id = ANY($${params.length}) OR r.pickup_branch_id = ANY($${params.length}) OR r.return_branch_id = ANY($${params.length}))`;
  }

  if (status !== 'all') {
    params.push(status);
    whereClause += ` AND r.status = $${params.length}`;
  }

  if (search) {
    params.push(search);
    const pIdx = params.length;
    whereClause += ` AND (
      r.code ILIKE '%' || $${pIdx} || '%' OR 
      c.name ILIKE '%' || $${pIdx} || '%' OR 
      e.name ILIKE '%' || $${pIdx} || '%' OR 
      e.code ILIKE '%' || $${pIdx} || '%' OR 
      b.name ILIKE '%' || $${pIdx} || '%' OR
      pb.name ILIKE '%' || $${pIdx} || '%' OR
      rb.name ILIKE '%' || $${pIdx} || '%' OR
      u.full_name ILIKE '%' || $${pIdx} || '%' OR
      u.username ILIKE '%' || $${pIdx} || '%' OR
      hu.full_name ILIKE '%' || $${pIdx} || '%' OR
      hu.username ILIKE '%' || $${pIdx} || '%' OR
      (CASE r.status
        WHEN 'pending' THEN 'Chờ giao'
        WHEN 'active' THEN 'Đang thuê'
        WHEN 'completed' THEN 'Hoàn thành'
        WHEN 'cancelled' THEN 'Đã hủy'
        ELSE r.status
      END) ILIKE '%' || $${pIdx} || '%'
    )`;
  }

  const pickupDateRange = getVNDateRange(req.query.pickupDate);
  if (pickupDateRange) {
    whereClause += ` AND COALESCE(r.pickup_time, r.start_date) >= $${params.length + 1} AND COALESCE(r.pickup_time, r.start_date) <= $${params.length + 2}`;
    params.push(...pickupDateRange);
  }

  const returnDateRange = getVNDateRange(req.query.returnDate);
  if (returnDateRange) {
    whereClause += ` AND COALESCE(r.return_time, r.end_date) >= $${params.length + 1} AND COALESCE(r.return_time, r.end_date) <= $${params.length + 2}`;
    params.push(...returnDateRange);
  }

  const ownerId = Number(req.query.ownerId);
  if (Number.isInteger(ownerId) && ownerId > 0) {
    params.push(ownerId);
    whereClause += ` AND e.owner_id = $${params.length}`;
  }

  const pickupBranchId = Number(req.query.pickupBranchId);
  if (Number.isInteger(pickupBranchId) && pickupBranchId > 0) {
    params.push(pickupBranchId);
    whereClause += ` AND COALESCE(r.pickup_branch_id, r.branch_id) = $${params.length}`;
  }

  const returnBranchId = Number(req.query.returnBranchId);
  if (Number.isInteger(returnBranchId) && returnBranchId > 0) {
    params.push(returnBranchId);
    whereClause += ` AND COALESCE(r.return_branch_id, r.pickup_branch_id, r.branch_id) = $${params.length}`;
  }

  const creatorId = Number(req.query.creatorId);
  if (Number.isInteger(creatorId) && creatorId > 0) {
    params.push(creatorId);
    whereClause += ` AND r.user_id = $${params.length}`;
  }

  const createdDateRange = getVNDateRange(req.query.createdDate);
  if (createdDateRange) {
    whereClause += ` AND r.inserted_at >= $${params.length + 1} AND r.inserted_at <= $${params.length + 2}`;
    params.push(...createdDateRange);
  }

  if (view) {
    const { startDate, endDate } = req.query;
    const nowVNStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });
    const nowVN = new Date(nowVNStr);
    const vnYear = nowVN.getFullYear();
    const vnMonth = String(nowVN.getMonth() + 1).padStart(2, '0');
    const vnDate = String(nowVN.getDate()).padStart(2, '0');
    const todayStartISO = new Date(`${vnYear}-${vnMonth}-${vnDate}T00:00:00+07:00`).toISOString();
    const todayEndISO = new Date(`${vnYear}-${vnMonth}-${vnDate}T23:59:59.999+07:00`).toISOString();

    const startISO = startDate ? new Date(`${startDate}T00:00:00+07:00`).toISOString() : todayStartISO;
    const endISO = endDate ? new Date(`${endDate}T23:59:59.999+07:00`).toISOString() : todayEndISO;

    if (view === 'pickups_today') {
      whereClause += ` AND r.status IN ('pending', 'delivered') AND COALESCE(r.pickup_time, r.start_date) >= $${params.length + 1} AND COALESCE(r.pickup_time, r.start_date) <= $${params.length + 2}`;
      params.push(startISO, endISO);
    } else if (view === 'returns_today') {
      whereClause += ` AND r.status = 'active' AND COALESCE(r.return_time, r.end_date) >= $${params.length + 1} AND COALESCE(r.return_time, r.end_date) <= $${params.length + 2}`;
      params.push(startISO, endISO);
    } else if (view === 'overdue') {
      whereClause += ` AND (
        (r.status = 'active' AND COALESCE(r.return_time, r.end_date) < $${params.length + 1})
        OR
        (r.status = 'pending' AND COALESCE(r.pickup_time, r.start_date) < $${params.length + 1})
      )`;
      params.push(todayStartISO);
    }
  }
  try {
    const countResult = await pool.query(`
      SELECT COUNT(*) 
      FROM rentals r 
      JOIN customers c ON r.customer_id = c.id
      JOIN equipment e ON r.equipment_id = e.id
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users hu ON r.handover_user_id = hu.id
      LEFT JOIN branches b ON r.branch_id = b.id
      LEFT JOIN branches pb ON r.pickup_branch_id = pb.id
      LEFT JOIN branches rb ON r.return_branch_id = rb.id
      ${whereClause}
    `, params);
    const totalCount = parseInt(countResult.rows[0].count);
    const result = await pool.query(`
      SELECT 
        r.id, r.customer_id, r.equipment_id, r.start_date, r.start_period, r.end_date, r.end_period,
        r.status, r.total_price, r.unit_price, r.unit_price_session, r.applied_day_price, r.used_discount_day_price,
        r.discount_day_price, r.discount_day_threshold_snapshot, r.deposit_amount, r.notes, r.user_id, r.branch_id, r.pickup_branch_id, r.return_branch_id,
        r.handover_user_id,
        r.pickup_time, r.return_time, r.discount_amount, r.discount_type, r.code, r.order_number, r.inserted_at, r.inserted_by,
        r.paid_amount, c.phone as customer_phone,
        c.name as customer_name, e.name as equipment_name, e.code as equipment_code,
        u.username, u.full_name, b.name as original_branch_name, pb.name as pickup_branch_name, rb.name as return_branch_name,
        COALESCE(hu.full_name, hu.username) as handover_user_name,
        COALESCE(
          (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
           FROM (
             SELECT id, sort_order, is_primary, COALESCE(secure_url, image_url) as url
             FROM entity_images
             WHERE entity_type = 'equipment' AND entity_id = e.id AND is_deleted = false AND provider NOT IN ('local')
           ) img),
          '[]'::json
        ) as equipment_images,
        COALESCE(
          (SELECT json_agg(json_build_object('id', ra.equipment_id, 'name', acc.name, 'price_per_day', ra.unit_price, 'price_per_session', ra.unit_price_session))
           FROM rental_accessories ra
           JOIN equipment acc ON ra.equipment_id = acc.id
           WHERE ra.rental_id = r.id AND ra.is_deleted = false),
          '[]'::json
        ) as accessories,
        COALESCE(
          (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
           FROM (
             SELECT id, sort_order, is_primary, COALESCE(secure_url, image_url) as url
             FROM entity_images
             WHERE entity_type = 'rentals' AND entity_id = r.id AND is_deleted = false AND provider NOT IN ('local')
           ) img),
          '[]'::json
        ) as images
      FROM rentals r
      JOIN customers c ON r.customer_id = c.id
      JOIN equipment e ON r.equipment_id = e.id
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users hu ON r.handover_user_id = hu.id
      LEFT JOIN branches b ON r.branch_id = b.id
      LEFT JOIN branches pb ON r.pickup_branch_id = pb.id
      LEFT JOIN branches rb ON r.return_branch_id = rb.id
      ${whereClause}
      ORDER BY ${orderBy}
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
    console.error('Fetch rentals error:', error);
    res.status(500).json({ error: 'Failed to fetch rentals' });
  }
});

// GET single rental by id
router.get('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const params = [id];
    let accessClause = '';

    if (isInvestorOnly(req.user)) {
      params.push(req.user.id);
      accessClause += ` AND e.owner_id = $${params.length}`;
    } else if (isDriverOnly(req.user)) {
      // Driver chỉ xem đơn tại cơ sở mình làm việc
      const branchIds = req.user.branch_ids || [];
      params.push(branchIds.length > 0 ? branchIds : [-1]);
      accessClause += ` AND (r.branch_id = ANY($${params.length}) OR r.pickup_branch_id = ANY($${params.length}) OR r.return_branch_id = ANY($${params.length}))`;
    }

    const result = await pool.query(`
      SELECT 
        r.*, c.name as customer_name, e.name as equipment_name, e.code as equipment_code,
        b.name as original_branch_name, pb.name as pickup_branch_name, rb.name as return_branch_name,
        COALESCE(hu.full_name, hu.username) as handover_user_name,
        COALESCE(
          (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
           FROM (
             SELECT id, sort_order, is_primary, COALESCE(secure_url, image_url) as url
             FROM entity_images
             WHERE entity_type = 'equipment' AND entity_id = e.id AND is_deleted = false AND provider NOT IN ('local')
           ) img),
          '[]'::json
        ) as equipment_images,
        COALESCE(
          (SELECT json_agg(json_build_object('id', ra.equipment_id, 'name', acc.name, 'price_per_day', ra.unit_price, 'price_per_session', ra.unit_price_session))
           FROM rental_accessories ra
           JOIN equipment acc ON ra.equipment_id = acc.id
           WHERE ra.rental_id = r.id AND ra.is_deleted = false),
          '[]'::json
        ) as accessories,
        COALESCE(
          (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
           FROM (
             SELECT id, sort_order, is_primary, COALESCE(secure_url, image_url) as url
             FROM entity_images
             WHERE entity_type = 'rentals' AND entity_id = r.id AND is_deleted = false AND provider NOT IN ('local')
           ) img),
          '[]'::json
        ) as images
      FROM rentals r
      JOIN customers c ON r.customer_id = c.id AND c.is_deleted = false
      JOIN equipment e ON r.equipment_id = e.id AND e.is_deleted = false
      LEFT JOIN users hu ON r.handover_user_id = hu.id
      LEFT JOIN branches b ON r.branch_id = b.id
      LEFT JOIN branches pb ON r.pickup_branch_id = pb.id
      LEFT JOIN branches rb ON r.return_branch_id = rb.id
      WHERE r.id = $1 AND r.is_deleted = false
        ${accessClause}
    `, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rental not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Fetch rental detail error:', error);
    res.status(500).json({ error: 'Failed to fetch rental detail' });
  }
});

// POST create rental
router.post('/', authenticate, async (req, res) => {
  const {
    customer_id, equipment_id, start_date, start_period = 'sáng', end_date, end_period = 'chiều',
    notes, deposit_amount, accessories, pickup_time, return_time,
    discount_amount = 0, discount_type = 'fixed', code, pickup_branch_id, return_branch_id, branch_id, custom_total,
    paid_amount = 0, user_id, handover_user_id
  } = req.body;

  const mappedStart = getDateTimeForPeriod(start_date, start_period);
  const mappedEnd = getDateTimeForPeriod(end_date, end_period);
  const mappedPickup = formatLocalToGMT(pickup_time);
  const mappedReturn = formatLocalToGMT(return_time);

  if (new Date(mappedStart) > new Date(mappedEnd)) {
    return res.status(400).json({ error: 'Ngày bắt đầu không thể sau ngày kết thúc.' });
  }
  if (!customer_id || !equipment_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin: Khách hàng, Thiết bị và Thời gian thuê.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const availabilityStart = mappedStart;
    const availabilityEnd = mappedEnd;
    const available = await checkAvailability(equipment_id, availabilityStart, availabilityEnd);
    if (!available) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Thiết bị đã được thuê trong khoảng thời gian này.' });
    }
    const { fullDays, sessions } = calculateDaysSessions(start_date, start_period, end_date, end_period);
    const equipmentRes = await client.query('SELECT price_per_day, price_per_session, price_per_day_discount, discount_day_threshold, branch_id, owner_id, condition FROM equipment WHERE id = $1 AND is_deleted = false', [equipment_id]);
    if (equipmentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Equipment not found' });
    }
    const eq = equipmentRes.rows[0];
    if (eq.condition === 'maintenance') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Thiết bị đang bảo dưỡng, không thể tạo đơn thuê.' });
    }
    if (isInvestorOnly(req.user) && Number(eq.owner_id) !== Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Bạn chỉ có quyền tạo đơn cho thiết bị thuộc sở hữu của mình.' });
    }
    const unitPriceDay = Number(eq.price_per_day);
    const unitPriceSession = Number(eq.price_per_session || 0);
    const originalBranchId = eq.branch_id;
    const finalPickupBranchId = pickup_branch_id || originalBranchId;
    const finalReturnBranchId = return_branch_id || finalPickupBranchId;
    // Áp dụng giá ưu đãi nếu đủ ngưỡng
    const threshold = eq.discount_day_threshold ? Number(eq.discount_day_threshold) : null;
    const discountDayPrice = eq.price_per_day_discount ? Number(eq.price_per_day_discount) : null;
    const usedDiscountDayPrice = Boolean(threshold && discountDayPrice && fullDays >= threshold);
    const effectiveDayPrice = usedDiscountDayPrice ? discountDayPrice : unitPriceDay;
    let total_price = (fullDays * effectiveDayPrice) + (sessions * unitPriceSession);
    const processedAccessories = [];
    if (accessories && Array.isArray(accessories)) {
      const accessoryIds = accessories.map(a => a.id || a.equipment_id).filter(Boolean);
      if (accessoryIds.length > 0) {
        const accRes = await client.query(
          `SELECT id, name, price_per_day, price_per_session
           FROM equipment
           WHERE id = ANY($1)
             AND is_deleted = false
             AND COALESCE(condition, '') != 'maintenance'
             ${isInvestorOnly(req.user) ? 'AND owner_id = $2' : ''}`,
          isInvestorOnly(req.user) ? [accessoryIds, req.user.id] : [accessoryIds]
        );
        const validAccessoryIds = accRes.rows.map((a) => Number(a.id));
        const conflictingAccessoryIds = await findConflictingAccessoryIds(validAccessoryIds, availabilityStart, availabilityEnd);
        if (conflictingAccessoryIds.length > 0) {
          const conflictNames = accRes.rows
            .filter((a) => conflictingAccessoryIds.includes(Number(a.id)))
            .map((a) => a.name);
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Phụ kiện đã được thuê trong khoảng thời gian này: ${conflictNames.join(', ')}` });
        }
        for (const acc of accRes.rows) {
          const accDay = Number(acc.price_per_day) || 0;
          const accSession = Number(acc.price_per_session) || 0;
          total_price += (fullDays * accDay) + (sessions * accSession);
          processedAccessories.push({ id: acc.id, name: acc.name, price_per_day: accDay, price_per_session: accSession });
        }
      }
    }
    // discount
    let discountVal = 0;
    if (discount_type === 'percentage') {
      discountVal = Math.round(total_price * (Number(discount_amount || 0) / 100));
    } else {
      discountVal = Number(discount_amount || 0);
    }
    total_price = Math.max(0, total_price - discountVal);

    if (custom_total !== undefined && custom_total !== null) {
      total_price = Number(custom_total);
    }

    const imageInputs = normalizeImagePayload(req.body);
    const requestedUserId = user_id ? Number(user_id) : null;
    const finalUserId = canAssignRentalCreator(req.user) && requestedUserId ? requestedUserId : req.user.id;
    const normalizedHandoverUserId = normalizeOptionalUserId(handover_user_id);

    if (canAssignRentalCreator(req.user) && requestedUserId) {
      const validCreator = await validateRentalCreator(client, requestedUserId);
      if (!validCreator) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Người tạo đơn chỉ được chọn tài khoản Sale hoặc Quản lý.' });
      }
    }

    if (normalizedHandoverUserId) {
      const validHandoverDriver = await validateDriverUser(client, normalizedHandoverUserId);
      if (!validHandoverDriver) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Người giao nhận phải là tài khoản có vai trò Giao nhận.' });
      }
    }

    const result = await client.query(`
      INSERT INTO rentals (customer_id, equipment_id, branch_id, pickup_branch_id, return_branch_id, start_date, start_period, end_date, end_period, total_price, unit_price, unit_price_session, deposit_amount, status, notes, user_id, pickup_time, return_time, discount_amount, discount_type, order_number, inserted_by, updated_by, paid_amount, applied_day_price, used_discount_day_price, discount_day_price, discount_day_threshold_snapshot, handover_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending', $14, $15, $16, $17, $18, $19, (SELECT COALESCE(MAX(order_number), 0) + 1 FROM rentals WHERE is_deleted = false), $20, $20, $21, $22, $23, $24, $25, $26) RETURNING *
    `, [customer_id, equipment_id, originalBranchId, finalPickupBranchId, finalReturnBranchId, mappedStart, start_period, mappedEnd, end_period, total_price, unitPriceDay, unitPriceSession, deposit_amount || 0, notes, finalUserId, mappedPickup, mappedReturn, discount_amount, discount_type, req.user.id, paid_amount || 0, effectiveDayPrice, usedDiscountDayPrice, discountDayPrice, threshold, normalizedHandoverUserId]);
    const rental = result.rows[0];
    const autoCode = `OD${String(rental.order_number).padStart(7, '0')}`;
    const updateRes = await client.query('UPDATE rentals SET code = $1 WHERE id = $2 RETURNING *', [autoCode, rental.id]);
    const finalRental = updateRes.rows[0];

    if (imageInputs.length > 0) {
      await replaceEntityImages(client, 'rentals', finalRental.id, imageInputs, req.user.id);
    }

    for (const acc of processedAccessories) {
      await client.query('INSERT INTO rental_accessories (rental_id, equipment_id, unit_price, unit_price_session, inserted_by, updated_by) VALUES ($1, $2, $3, $4, $5, $5)', [finalRental.id, acc.id, acc.price_per_day, acc.price_per_session, req.user.id]);
    }
    await client.query('COMMIT');
    // Log activity
    const cust = await pool.query('SELECT name FROM customers WHERE id=$1', [customer_id]);
    const equip = await pool.query('SELECT name FROM equipment WHERE id=$1', [equipment_id]);
    await logActivity('CREATE', 'rental', finalRental.id, `Tạo đơn thuê: KH "${cust.rows[0]?.name}" thuê "${equip.rows[0]?.name}" với mã ${autoCode}`, req.user.id);
    res.status(201).json({ ...finalRental, accessories: accessories || [] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof ImageServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error('Create rental error:', error);
    res.status(500).json({ error: 'Failed to create rental', details: error.message });
  } finally {
    client.release();
  }
});

// PUT update rental
router.put('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const {
    customer_id, equipment_id, start_date, start_period = 'sáng', end_date, end_period = 'chiều',
    status, notes, deposit_amount, accessories, pickup_time, return_time,
    discount_amount, discount_type, code, pickup_branch_id, return_branch_id, branch_id, custom_total,
    paid_amount, user_id, handover_user_id
  } = req.body;

  const mappedStart = getDateTimeForPeriod(start_date, start_period);
  const mappedEnd = getDateTimeForPeriod(end_date, end_period);
  const mappedPickup = formatLocalToGMT(pickup_time);
  const mappedReturn = formatLocalToGMT(return_time);

  if (new Date(mappedStart) > new Date(mappedEnd)) {
    return res.status(400).json({ error: 'Ngày bắt đầu không thể sau ngày kết thúc.' });
  }
  if (!customer_id || !equipment_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ thông tin: Khách hàng, Thiết bị và Thời gian thuê.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const availabilityStart = mappedStart;
    const availabilityEnd = mappedEnd;
    if (status !== 'cancelled' && status !== 'completed') {
      const available = await checkAvailability(equipment_id, availabilityStart, availabilityEnd, id);
      if (!available) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Thiết bị đã được thuê trong khoảng thời gian này.' });
      }
    }
    // fetch old record
    const oldResult = await client.query(`
      SELECT r.*, c.name as customer_name, e.name as equipment_name, e.price_per_day, e.owner_id as equipment_owner_id,
             hu.full_name as handover_user_name, hu.username as handover_username
      FROM rentals r
      JOIN customers c ON r.customer_id = c.id
      JOIN equipment e ON r.equipment_id = e.id
      LEFT JOIN users hu ON r.handover_user_id = hu.id
      WHERE r.id = $1 AND r.is_deleted = false
    `, [id]);
    if (oldResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rental not found' });
    }
    const old = oldResult.rows[0];
    if (isInvestorOnly(req.user) && Number(old.equipment_owner_id) !== Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Bạn chỉ có quyền chỉnh sửa đơn thuê của thiết bị thuộc sở hữu của mình.' });
    }
    // ownership check for saler
    if (hasRole(req.user, 'saler') && !hasRole(req.user, 'admin', 'camera_manager', 'investor') && old.user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa đơn thuê của người khác.' });
    }
    // status restriction for saler
    const isSalerOnly = hasRole(req.user, 'saler') && !hasRole(req.user, 'admin', 'camera_manager', 'investor');
    const statusToSave = isSalerOnly ? old.status : (status || old.status);
    // Determine unit prices
    let unitPriceDay, unitPriceSession, equipDiscountThreshold, equipDiscountDayPrice;
    const equipRes = await client.query('SELECT price_per_day, price_per_session, price_per_day_discount, discount_day_threshold, branch_id, owner_id, condition FROM equipment WHERE id = $1 AND is_deleted = false', [equipment_id]);
    if (equipRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Equipment not found' });
    }
    const eqRow = equipRes.rows[0];
    if (Number(old.equipment_id) !== Number(equipment_id) && eqRow.condition === 'maintenance') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Thiết bị đang bảo dưỡng, không thể tạo đơn thuê.' });
    }
    if (isInvestorOnly(req.user) && Number(eqRow.owner_id) !== Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Bạn chỉ có quyền chuyển đơn sang thiết bị thuộc sở hữu của mình.' });
    }
    const originalBranchId = eqRow.branch_id;
    const finalPickupBranchId = pickup_branch_id || old.pickup_branch_id || originalBranchId;
    const finalReturnBranchId = return_branch_id || old.return_branch_id || finalPickupBranchId;

    if (Number(old.equipment_id) === Number(equipment_id)) {
      unitPriceDay = old.unit_price !== null && old.unit_price !== undefined
        ? Number(old.unit_price)
        : Number(eqRow.price_per_day);
      unitPriceSession = Number(eqRow.price_per_session || 0);
    } else {
      unitPriceDay = Number(eqRow.price_per_day);
      unitPriceSession = Number(eqRow.price_per_session || 0);
    }
    if (Number(old.equipment_id) === Number(equipment_id)) {
      equipDiscountThreshold = old.discount_day_threshold_snapshot !== null && old.discount_day_threshold_snapshot !== undefined
        ? Number(old.discount_day_threshold_snapshot)
        : (eqRow.discount_day_threshold ? Number(eqRow.discount_day_threshold) : null);
      equipDiscountDayPrice = old.discount_day_price !== null && old.discount_day_price !== undefined
        ? Number(old.discount_day_price)
        : (eqRow.price_per_day_discount ? Number(eqRow.price_per_day_discount) : null);
    } else {
      equipDiscountThreshold = eqRow.discount_day_threshold ? Number(eqRow.discount_day_threshold) : null;
      equipDiscountDayPrice = eqRow.price_per_day_discount ? Number(eqRow.price_per_day_discount) : null;
    }
    const { fullDays, sessions } = calculateDaysSessions(start_date, start_period, end_date, end_period);
    // Áp dụng giá ưu đãi nếu đủ ngưỡng
    const usedDiscountDayPrice = Boolean(equipDiscountThreshold && equipDiscountDayPrice && fullDays >= equipDiscountThreshold);
    const effectiveDayPrice = usedDiscountDayPrice ? equipDiscountDayPrice : unitPriceDay;
    let total_price = (fullDays * effectiveDayPrice) + (sessions * unitPriceSession);
    // accessories cost
    const processedAccessories = [];
    if (accessories && Array.isArray(accessories)) {
      const accessoryIds = accessories.map(a => a.id || a.equipment_id).filter(Boolean);
      if (accessoryIds.length > 0) {
        const accRes = await client.query(
          `SELECT id, name, price_per_day, price_per_session
           FROM equipment
           WHERE id = ANY($1)
             AND is_deleted = false
             AND COALESCE(condition, '') != 'maintenance'
             ${isInvestorOnly(req.user) ? 'AND owner_id = $2' : ''}`,
          isInvestorOnly(req.user) ? [accessoryIds, req.user.id] : [accessoryIds]
        );
        const validAccessoryIds = accRes.rows.map((a) => Number(a.id));
        const conflictingAccessoryIds = await findConflictingAccessoryIds(validAccessoryIds, availabilityStart, availabilityEnd, id);
        if (conflictingAccessoryIds.length > 0) {
          const conflictNames = accRes.rows
            .filter((a) => conflictingAccessoryIds.includes(Number(a.id)))
            .map((a) => a.name);
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Phụ kiện đã được thuê trong khoảng thời gian này: ${conflictNames.join(', ')}` });
        }
        for (const acc of accRes.rows) {
          const accDay = Number(acc.price_per_day) || 0;
          const accSession = Number(acc.price_per_session) || 0;
          total_price += (fullDays * accDay) + (sessions * accSession);
          processedAccessories.push({ id: acc.id, name: acc.name, price_per_day: accDay, price_per_session: accSession });
        }
      }
    }
    // discount handling
    let discountVal = 0;
    const finalDiscountAmount = discount_amount !== undefined ? discount_amount : old.discount_amount;
    const finalDiscountType = discount_type || old.discount_type;
    if (finalDiscountType === 'percentage') {
      discountVal = Math.round(total_price * (Number(finalDiscountAmount || 0) / 100));
    } else {
      discountVal = Number(finalDiscountAmount || 0);
    }
    total_price = Math.max(0, total_price - discountVal);

    if (custom_total !== undefined && custom_total !== null) {
      total_price = Number(custom_total);
    }

    const imageInputs = normalizeImagePayload(req.body);
    const requestedUserId = user_id ? Number(user_id) : null;
    const finalUserId = canAssignRentalCreator(req.user) && requestedUserId ? requestedUserId : old.user_id;
    const hasHandoverUserField = Object.prototype.hasOwnProperty.call(req.body, 'handover_user_id');
    const requestedHandoverUserId = normalizeOptionalUserId(handover_user_id);
    const finalHandoverUserId = hasHandoverUserField
      ? requestedHandoverUserId
      : normalizeOptionalUserId(old.handover_user_id);

    if (canAssignRentalCreator(req.user) && requestedUserId) {
      const validCreator = await validateRentalCreator(client, requestedUserId);
      if (!validCreator) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Người tạo đơn chỉ được chọn tài khoản Sale hoặc Quản lý.' });
      }
    }

    if (finalHandoverUserId) {
      const validHandoverDriver = await validateDriverUser(client, finalHandoverUserId);
      if (!validHandoverDriver) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Người giao nhận phải là tài khoản có vai trò Giao nhận.' });
      }
    }

    // Track actual return time when marked as completed
    let returnedAtClause = '';
    if (statusToSave === 'completed' && old.status !== 'completed') {
      returnedAtClause = ', returned_at=NOW()';
    }

    // Track actual pickup time when starting the rental
    let pickedUpAtClause = '';
    if (statusToSave === 'active' && old.status === 'pending') {
      pickedUpAtClause = ', picked_up_at=NOW()';
    }

    const result = await client.query(`
      UPDATE rentals
      SET customer_id=$1, equipment_id=$2, start_date=$3, start_period=$4, end_date=$5, end_period=$6, status=$7, notes=$8, total_price=$9, deposit_amount=$10, unit_price=$11, unit_price_session=$12, pickup_time=$13, return_time=$14, discount_amount=$15, discount_type=$16, code=$17, branch_id=$20, pickup_branch_id=$21, updated_at=NOW(), updated_by=$19, paid_amount=$22, user_id=$23, applied_day_price=$24, used_discount_day_price=$25, discount_day_price=$26, discount_day_threshold_snapshot=$27, return_branch_id=$28, handover_user_id=$29${returnedAtClause}${pickedUpAtClause}
      WHERE id=$18 RETURNING *
    `, [customer_id, equipment_id, mappedStart, start_period, mappedEnd, end_period, statusToSave, notes, total_price, deposit_amount || 0, unitPriceDay, unitPriceSession, mappedPickup, mappedReturn, finalDiscountAmount, finalDiscountType, code || old.code, id, req.user.id, originalBranchId, finalPickupBranchId, paid_amount || 0, finalUserId, effectiveDayPrice, usedDiscountDayPrice, equipDiscountDayPrice, equipDiscountThreshold, finalReturnBranchId, finalHandoverUserId]);
    const rental = result.rows[0];
    if (imageInputs.length > 0) {
      await replaceEntityImages(client, 'rentals', id, imageInputs, req.user.id);
    }
    // update accessories mapping (soft delete old ones then insert new ones or just hard delete if they are just mapping)
    // The user said no hard delete, so we update is_deleted on accessories.
    await client.query('UPDATE rental_accessories SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE rental_id = $2', [req.user.id, id]);
    for (const acc of processedAccessories) {
      await client.query('INSERT INTO rental_accessories (rental_id, equipment_id, unit_price, unit_price_session, inserted_by, updated_by) VALUES ($1, $2, $3, $4, $5, $5)', [id, acc.id, acc.price_per_day, acc.price_per_session, req.user.id]);
    }

    if (statusToSave === 'completed') {
      // Khi đơn mới chuyển sang completed → luôn forceRecalc để đảm bảo ledger chính xác
      // (tránh trường hợp đơn từng completed trước đó → ledger cũ bị stale)
      if (old.status !== 'completed') {
        await ensureCommissionSnapshotForCompletedRental(client, Number(id), req.user.id, { forceRecalc: true });
      } else {
        // Đơn đã completed từ trước → chỉ recalc nếu thay đổi saler, driver hoặc total_price
        const commissionFieldsChanged =
          Number(old.user_id || 0) !== Number(finalUserId || 0) ||
          Number(old.handover_user_id || 0) !== Number(finalHandoverUserId || 0) ||
          parseFloat(old.total_price) !== parseFloat(total_price);
        if (commissionFieldsChanged) {
          await ensureCommissionSnapshotForCompletedRental(client, Number(id), req.user.id, { forceRecalc: true });
        }
      }
    }

    await client.query('COMMIT');
    // logging diff
    const custRes = await pool.query('SELECT name FROM customers WHERE id=$1', [customer_id]);
    const newCustName = custRes.rows[0]?.name;
    let newEquipName = old.equipment_name;
    if (Number(old.equipment_id) !== Number(equipment_id)) {
      const equipRes = await pool.query('SELECT name FROM equipment WHERE id = $1', [equipment_id]);
      newEquipName = equipRes.rows[0]?.name;
    }
    // Fetch branch names for logging
    const oldBranchRes = await pool.query('SELECT name FROM branches WHERE id = $1', [old.pickup_branch_id || old.branch_id]);
    const newBranchRes = await pool.query('SELECT name FROM branches WHERE id = $1', [finalPickupBranchId]);
    const oldReturnBranchRes = await pool.query('SELECT name FROM branches WHERE id = $1', [old.return_branch_id || old.pickup_branch_id || old.branch_id]);
    const newReturnBranchRes = await pool.query('SELECT name FROM branches WHERE id = $1', [finalReturnBranchId]);
    let oldUserName = old.user_id ? (old.full_name || old.username || 'Không') : 'Không';
    let newUserName = oldUserName;
    let oldHandoverUserName = old.handover_user_name || old.handover_username || 'Không';
    let newHandoverUserName = oldHandoverUserName;

    const changedUserIds = new Set();
    if (Number(old.user_id || 0) !== Number(finalUserId || 0)) {
      if (old.user_id) changedUserIds.add(Number(old.user_id));
      if (finalUserId) changedUserIds.add(Number(finalUserId));
    }
    if (Number(old.handover_user_id || 0) !== Number(finalHandoverUserId || 0)) {
      if (old.handover_user_id) changedUserIds.add(Number(old.handover_user_id));
      if (finalHandoverUserId) changedUserIds.add(Number(finalHandoverUserId));
    }

    if (changedUserIds.size > 0) {
      const userRes = await pool.query(
        'SELECT id, username, full_name FROM users WHERE id = ANY($1)',
        [Array.from(changedUserIds)]
      );
      const usersById = new Map(userRes.rows.map((row) => [Number(row.id), row.full_name || row.username]));

      oldUserName = old.user_id ? (usersById.get(Number(old.user_id)) || oldUserName) : 'Không';
      newUserName = finalUserId ? (usersById.get(Number(finalUserId)) || 'Không') : 'Không';
      oldHandoverUserName = old.handover_user_id ? (usersById.get(Number(old.handover_user_id)) || oldHandoverUserName) : 'Không';
      newHandoverUserName = finalHandoverUserId ? (usersById.get(Number(finalHandoverUserId)) || 'Không') : 'Không';
    }
    const oldBranchName = oldBranchRes.rows[0]?.name || 'Không';
    const newBranchName = newBranchRes.rows[0]?.name || 'Không';
    const oldReturnBranchName = oldReturnBranchRes.rows[0]?.name || 'Không';
    const newReturnBranchName = newReturnBranchRes.rows[0]?.name || 'Không';

    const fmtDate = (d) => {
      const dt = new Date(d);
      return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
    };
    const STATUS_VN = { pending: 'Chờ giao', active: 'Đang thuê', completed: 'Hoàn thành', cancelled: 'Đã hủy' };
    const changes = [];
    if (Number(old.user_id) !== Number(finalUserId)) changes.push(`Người tạo đơn: "${oldUserName}" → "${newUserName}"`);
    if (Number(old.handover_user_id || 0) !== Number(finalHandoverUserId || 0)) changes.push(`Người giao nhận máy: "${oldHandoverUserName}" → "${newHandoverUserName}"`);
    if (old.customer_name !== newCustName) changes.push(`Khách hàng: "${old.customer_name}" → "${newCustName}"`);
    if (old.equipment_name !== newEquipName) changes.push(`Thiết bị: "${old.equipment_name}" → "${newEquipName}"`);
    if (fmtDate(old.start_date) !== fmtDate(mappedStart) || old.start_period !== start_period) changes.push(`Bắt đầu: ${fmtDate(old.start_date)} (${old.start_period || 'sáng'}) → ${fmtDate(mappedStart)} (${start_period})`);
    if (fmtDate(old.end_date) !== fmtDate(mappedEnd) || old.end_period !== end_period) changes.push(`Kết thúc: ${fmtDate(old.end_date)} (${old.end_period || 'chiều'}) → ${fmtDate(mappedEnd)} (${end_period})`);
    if (old.status !== status && status) changes.push(`Trạng thái: "${STATUS_VN[old.status] || old.status}" → "${STATUS_VN[status] || status}"`);
    if ((old.pickup_branch_id || old.branch_id) !== finalPickupBranchId) changes.push(`Nơi nhận máy: "${oldBranchName}" → "${newBranchName}"`);
    if (parseFloat(old.total_price) !== parseFloat(total_price)) changes.push(`Tổng tiền: ${Number(old.total_price).toLocaleString()} → ${Number(total_price).toLocaleString()}`);
    if (parseFloat(old.paid_amount || 0) !== parseFloat(paid_amount || 0)) changes.push(`Đã thanh toán: ${Number(old.paid_amount || 0).toLocaleString()} → ${Number(paid_amount || 0).toLocaleString()}`);
    if (parseFloat(old.discount_amount) !== parseFloat(finalDiscountAmount || 0)) changes.push(`Giảm giá: ${Number(old.discount_amount).toLocaleString()} → ${Number(finalDiscountAmount || 0).toLocaleString()}`);
    if (old.notes !== notes) changes.push(`Ghi chú: "${old.notes || ''}" → "${notes || ''}"`);
    if ((old.return_branch_id || old.pickup_branch_id || old.branch_id) !== finalReturnBranchId) changes.push(`Nơi trả máy: "${oldReturnBranchName}" → "${newReturnBranchName}"`);

    // Only log activity if there are actual changes
    if (changes.length > 0) {
      const desc = `Cập nhật đơn thuê ${rental.code} (KH: ${newCustName}): ${changes.join(', ')}`;
      await logActivity('UPDATE', 'rental', rental.id, desc, req.user.id);
    }
    res.json(rental);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof ImageServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error('Update rental error:', error);
    res.status(500).json({ error: 'Failed to update rental', details: error.message });
  } finally {
    client.release();
  }
});

// PATCH status (admin or camera_manager)
router.patch('/:id/status', authenticate, requireStatusManager, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const VALID_STATUSES = ['pending', 'active', 'completed', 'cancelled'];
  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Trạng thái không hợp lệ. Các giá trị hợp lệ: ${VALID_STATUSES.join(', ')}` });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const oldResult = await client.query(`
      SELECT r.status, r.code, r.handover_user_id, e.owner_id
      FROM rentals r
      JOIN equipment e ON r.equipment_id = e.id
      WHERE r.id=$1 AND r.is_deleted = false
    `, [id]);
    if (oldResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rental not found' });
    }
    if (isInvestorOnly(req.user) && Number(oldResult.rows[0].owner_id) !== Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Bạn chỉ có quyền cập nhật đơn thuê của thiết bị thuộc sở hữu của mình.' });
    }
    if (isDriverOnly(req.user) && Number(oldResult.rows[0].handover_user_id || 0) !== Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Bạn chỉ có quyền cập nhật trạng thái đơn thuê được phân công cho mình.' });
    }
    const { status: oldStatus, code: rentalCode } = oldResult.rows[0];
    const isManager = hasRole(req.user, 'camera_manager', 'investor');
    // Actual event timestamps for dashboard accuracy
    const returnedAtClause = (status === 'completed' && oldStatus !== 'completed') ? ', returned_at=NOW()' : '';
    const pickedUpAtClause = (status === 'active' && oldStatus === 'pending') ? ', picked_up_at=NOW()' : '';
    const result = await client.query(
      `UPDATE rentals SET status=$1, updated_at=NOW(), updated_by=$3 ${isManager ? ', manager_id=$3' : ''} ${returnedAtClause} ${pickedUpAtClause} WHERE id=$2 RETURNING *`,
      [status, id, req.user.id]
    );

    if (status === 'completed' && oldStatus !== 'completed') {
      await ensureCommissionSnapshotForCompletedRental(client, Number(id), req.user.id);
    }

    await client.query('COMMIT');
    const STATUS_VN = { pending: 'Chờ giao', active: 'Đang thuê', completed: 'Hoàn thành', cancelled: 'Đã hủy' };
    await logActivity('UPDATE', 'rental', parseInt(id), `Cập nhật trạng thái đơn thuê ${rentalCode}: "${STATUS_VN[oldStatus] || oldStatus}" → "${STATUS_VN[status] || status}" (bởi ${req.user.username})`, req.user.id);
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rental status update error:', error);
    res.status(500).json({ error: 'Failed to update rental status' });
  } finally {
    client.release();
  }
});

// POST explicit recalc commission snapshot/ledger for a completed rental
router.post('/:id/recalculate-commission', authenticate, async (req, res) => {
  const { id } = req.params;
  const rentalId = Number(id);
  if (!Number.isInteger(rentalId) || rentalId <= 0) {
    return res.status(400).json({ error: 'Invalid rental id' });
  }

  const isAllowed = hasRole(req.user, 'admin', 'camera_manager', 'investor');
  if (!isAllowed) {
    return res.status(403).json({ error: 'Bạn không có quyền tính lại hoa hồng cho đơn thuê.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rentalResult = await client.query(
      `
        SELECT r.id, r.code, r.status, e.owner_id
        FROM rentals r
        JOIN equipment e ON r.equipment_id = e.id
        WHERE r.id = $1
          AND r.is_deleted = false
        LIMIT 1
      `,
      [rentalId]
    );

    if (rentalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rental not found' });
    }

    const rental = rentalResult.rows[0];
    if (isInvestorOnly(req.user) && Number(rental.owner_id) !== Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Bạn chỉ có quyền tính lại hoa hồng cho đơn thuê của thiết bị thuộc sở hữu của mình.' });
    }

    const result = await ensureCommissionSnapshotForCompletedRental(client, rentalId, req.user.id, { forceRecalc: true });
    await client.query('COMMIT');

    await logActivity(
      'UPDATE',
      'rental',
      rentalId,
      `Tính lại hoa hồng cho đơn thuê ${rental.code || rentalId} (trạng thái: ${rental.status})`,
      req.user.id
    );

    return res.json(result);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Recalculate commission snapshot error:', error);
    return res.status(500).json({ error: 'Failed to recalculate commission snapshot' });
  } finally {
    client.release();
  }
});

// DELETE rental (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Soft delete related tasks
    await client.query('UPDATE tasks SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE related_rental_id = $2', [req.user.id, id]);
    // Soft delete related financial transactions
    await client.query('UPDATE financial_transactions SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE rental_id = $2', [req.user.id, id]);
    // Soft delete rental accessories
    await client.query('UPDATE rental_accessories SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE rental_id = $2', [req.user.id, id]);

    const result = await client.query('UPDATE rentals SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE id = $2 RETURNING code', [req.user.id, id]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rental not found' });
    }
    const rentalCode = result.rows[0].code;
    await softDeleteEntityImages(client, 'rentals', id, req.user.id);
    await client.query('COMMIT');
    await logActivity('DELETE', 'rental', parseInt(id), `Xóa đơn thuê ${rentalCode} và các dữ liệu liên quan (tác vụ, giao dịch)`, req.user.id);
    res.json({ message: 'Rental and related data deleted' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rental delete error:', error);
    res.status(500).json({ error: 'Failed to delete rental', details: error.message });
  } finally {
    client.release();
  }
});

// Upload rental image
router.post('/:id/upload-image', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    if (isInvestorOnly(req.user)) {
      const ownerCheck = await pool.query(`
        SELECT e.owner_id
        FROM rentals r
        JOIN equipment e ON r.equipment_id = e.id
        WHERE r.id = $1 AND r.is_deleted = false
      `, [id]);
      if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Rental not found' });
      if (Number(ownerCheck.rows[0].owner_id) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Bạn chỉ có quyền cập nhật ảnh đơn thuê của thiết bị thuộc sở hữu của mình.' });
      }
    }
    const imageInputs = normalizeImagePayload(req.body);
    if (imageInputs.length === 0) {
      await softDeleteEntityImages(pool, 'rentals', id, req.user.id);
      const result = await pool.query('UPDATE rentals SET updated_at=NOW(), updated_by=$1 WHERE id=$2 RETURNING id, code', [req.user.id, id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Rental not found' });
      await logActivity('UPDATE', 'rental', id, `Xóa ảnh minh chứng cho đơn thuê ${result.rows[0].code}`, req.user.id);
      return res.json({ message: 'Rental images cleared', rental_id: id });
    }
    await replaceEntityImages(pool, 'rentals', id, imageInputs, req.user.id);
    const result = await pool.query('UPDATE rentals SET updated_at=NOW(), updated_by=$1 WHERE id=$2 RETURNING id, code', [req.user.id, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rental not found' });
    await logActivity('UPDATE', 'rental', id, `Cập nhật ảnh minh chứng cho đơn thuê ${result.rows[0].code}`, req.user.id);
    res.json({ message: 'Rental image updated', rental_id: id });
  } catch (error) {
    if (error instanceof ImageServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error('Rental image upload error:', error);
    res.status(500).json({ error: 'Failed to upload rental image' });
  }
});

module.exports = router;
