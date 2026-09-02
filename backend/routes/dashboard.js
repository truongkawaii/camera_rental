// routes/dashboard.js
const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, hasRole } = require('../middleware/auth');

const router = express.Router();
const isInvestorOnly = (user) => hasRole(user, 'investor') && !hasRole(user, 'admin', 'camera_manager');

/**
 * Helper to calculate percentage change
 */
const pct = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

/**
 * Helper to get status counts at a specific point in time
 * For rentals, we consider a machine "out" if it was picked up before or at that time
 * and either hasn't been returned yet or was returned after that time.
 */
async function getStatusAtPoint(pointInTimeISO, branchIds = null, ownerId = null) {
  const params = [pointInTimeISO];
  let branchFilter = '';
  let ownerFilter = '';
  if (branchIds !== null) {
    params.push(branchIds.length > 0 ? branchIds : [-1]);
    branchFilter = ` AND branch_id = ANY($${params.length})`;
  }
  if (ownerId !== null) {
    params.push(ownerId);
    ownerFilter = ` AND owner_id = $${params.length}`;
  }

  // 1. Get total equipment at that time (not deleted)
  const equipmentRes = await pool.query(`
    SELECT COUNT(*) as total 
    FROM equipment 
    WHERE inserted_at <= $1 
      AND is_deleted = false
      ${branchFilter}
      ${ownerFilter}
  `, params);
  const totalEquipment = parseInt(equipmentRes.rows[0].total || 0);

  // 2. Get active/delivered rentals at that time
  const activeRes = await pool.query(`
    SELECT COUNT(*) as count
    FROM rentals
    WHERE is_deleted = false
      AND (inserted_at <= $1)
      AND (status != 'cancelled')
      AND (COALESCE(picked_up_at, pickup_time, start_date) <= $1)
      AND (
        (status = 'active')
        OR (status = 'completed' AND COALESCE(returned_at, return_time, end_date) > $1)
      )
      ${branchIds !== null ? `AND branch_id = ANY($2)` : ''}
      ${ownerId !== null ? `AND EXISTS (
        SELECT 1 FROM equipment e
        WHERE e.id = rentals.equipment_id
          AND e.is_deleted = false
          AND e.owner_id = $${params.length}
      )` : ''}
  `, params);

  const activeCount = parseInt(activeRes.rows[0].count || 0);

  return {
    active: activeCount,
    available: Math.max(0, totalEquipment - activeCount)
  };
}

const summaryHandler = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Use VN Timezone for defaults
    const nowVNStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
    const nowVN = new Date(nowVNStr);
    const todayStr = nowVN.toISOString().split('T')[0];

    const start = startDate || todayStr;
    const end = endDate || todayStr;

    const periodStartISO = new Date(`${start}T00:00:00+07:00`).toISOString();
    const periodEndISO = new Date(`${end}T23:59:59.999+07:00`).toISOString();

    // Calculate previous period of same length
    const startMs = new Date(periodStartISO).getTime();
    const endMs = new Date(periodEndISO).getTime();
    const periodMs = endMs - startMs;

    const prevPeriodEndISO = new Date(startMs - 1).toISOString();
    const prevPeriodStartISO = new Date(startMs - periodMs - 1).toISOString();

    const isAdmin = hasRole(req.user, 'admin');
    const investorOnly = isInvestorOnly(req.user);
    const branchIds = req.user.branch_ids || [];
    let branchFilter = '';
    const statsParams = [periodStartISO, periodEndISO];
    if (investorOnly) {
      statsParams.push(req.user.id);
      branchFilter = ` AND EXISTS (
        SELECT 1 FROM equipment e
        WHERE e.id = rentals.equipment_id
          AND e.is_deleted = false
          AND e.owner_id = $${statsParams.length}
      )`;
    } else if (!isAdmin) {
      statsParams.push(branchIds.length > 0 ? branchIds : [-1]);
      branchFilter = ` AND (branch_id = ANY($${statsParams.length}) OR pickup_branch_id = ANY($${statsParams.length}) OR return_branch_id = ANY($${statsParams.length}))`;
    }

    // 1. PERIOD STATS (Revenue, Orders, etc.)
    const statsQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN (inserted_at >= $1 AND inserted_at <= $2 AND status != 'cancelled') THEN total_price ELSE 0 END), 0) as total_value,
        COALESCE(SUM(CASE WHEN (returned_at >= $1 AND returned_at <= $2 AND status = 'completed') THEN total_price ELSE 0 END), 0) as revenue,
        COUNT(CASE WHEN (inserted_at >= $1 AND inserted_at <= $2) THEN 1 END) as orders,
        COUNT(CASE WHEN (returned_at >= $1 AND returned_at <= $2 AND status = 'completed') THEN 1 END) as returns
      FROM rentals
      WHERE is_deleted = false
        AND (
          (inserted_at >= $1 AND inserted_at <= $2)
          OR 
          (returned_at >= $1 AND returned_at <= $2 AND status = 'completed')
        )
        ${branchFilter}
    `;

    const currentStatsRes = await pool.query(statsQuery, statsParams);
    const prevStatsRes = await pool.query(statsQuery, [prevPeriodStartISO, prevPeriodEndISO, ...statsParams.slice(2)]);

    const curr = currentStatsRes.rows[0];
    const prev = prevStatsRes.rows[0];

    // 2. POINT-IN-TIME STATS (Active Rentals, Available)
    const currentPoint = await getStatusAtPoint(periodEndISO, (!isAdmin && !investorOnly) ? branchIds : null, investorOnly ? req.user.id : null);
    const prevPoint = await getStatusAtPoint(prevPeriodEndISO, (!isAdmin && !investorOnly) ? branchIds : null, investorOnly ? req.user.id : null);

    // 3. REAL-TIME TASKS (Pickups/Returns for the selected range)
    const taskParams = [periodStartISO, periodEndISO];
    let taskBranchFilter = '';
    if (investorOnly) {
      taskParams.push(req.user.id);
      taskBranchFilter = ` AND e.owner_id = $${taskParams.length}`;
    } else if (!isAdmin) {
      taskParams.push(branchIds.length > 0 ? branchIds : [-1]);
      taskBranchFilter = ` AND (r.branch_id = ANY($${taskParams.length}) OR r.pickup_branch_id = ANY($${taskParams.length}) OR r.return_branch_id = ANY($${taskParams.length}))`;
    }

    let overdueBranchFilter = '';
    const overdueParams = [];
    if (investorOnly) {
      overdueParams.push(req.user.id);
      overdueBranchFilter = ` AND e.owner_id = $1`;
    } else if (!isAdmin) {
      overdueParams.push(branchIds.length > 0 ? branchIds : [-1]);
      overdueBranchFilter = ` AND (r.branch_id = ANY($1) OR r.pickup_branch_id = ANY($1) OR r.return_branch_id = ANY($1))`;
    }

    const pickupsRes = await pool.query(`
      SELECT 
        r.id, r.customer_id, r.equipment_id, r.branch_id, r.pickup_branch_id, r.return_branch_id, r.user_id, r.manager_id, r.order_number, 
        r.code, r.status, r.start_date, r.end_date, r.start_period, r.end_period, 
        r.pickup_time, r.return_time, r.picked_up_at, r.returned_at, 
        r.unit_price, r.unit_price_session, r.applied_day_price, r.used_discount_day_price,
        r.discount_day_price, r.discount_day_threshold_snapshot, r.total_price, r.deposit_amount, 
        r.discount_amount, r.discount_type, r.damage_fee, r.notes, 
        r.is_deleted, r.inserted_at, r.updated_at, r.inserted_by, r.updated_by,
        r.paid_amount, r.handover_user_id,
        u.username, u.full_name,
        COALESCE(hu.full_name, hu.username) as handover_user_name,
        c.name as customer_name, c.phone as customer_phone,
        e.name as equipment_name, e.code as equipment_code,
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
          (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
           FROM (
             SELECT id, sort_order, is_primary, COALESCE(secure_url, image_url) as url
             FROM entity_images
             WHERE entity_type = 'rentals' AND entity_id = r.id AND is_deleted = false AND provider NOT IN ('local')
           ) img),
          '[]'::json
        ) as images,
        b.name as pickup_branch_name,
        rb.name as return_branch_name,
        ob.name as original_branch_name
      FROM rentals r
      JOIN customers c ON r.customer_id = c.id
      JOIN equipment e ON r.equipment_id = e.id
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users hu ON r.handover_user_id = hu.id
      LEFT JOIN branches b ON r.pickup_branch_id = b.id
      LEFT JOIN branches rb ON r.return_branch_id = rb.id
      LEFT JOIN branches ob ON r.branch_id = ob.id
      WHERE r.is_deleted = false 
        AND r.status = 'pending'
        AND (COALESCE(r.pickup_time, r.start_date) >= $1 AND COALESCE(r.pickup_time, r.start_date) <= $2)
        ${taskBranchFilter}
      ORDER BY
        COALESCE(r.pickup_time, r.start_date) ASC
    `, taskParams);

    const returnsRes = await pool.query(`
      SELECT 
        r.id, r.customer_id, r.equipment_id, r.branch_id, r.pickup_branch_id, r.return_branch_id, r.user_id, r.manager_id, r.order_number, 
        r.code, r.status, r.start_date, r.end_date, r.start_period, r.end_period, 
        r.pickup_time, r.return_time, r.picked_up_at, r.returned_at, 
        r.unit_price, r.unit_price_session, r.applied_day_price, r.used_discount_day_price,
        r.discount_day_price, r.discount_day_threshold_snapshot, r.total_price, r.deposit_amount, 
        r.discount_amount, r.discount_type, r.damage_fee, r.notes, 
        r.is_deleted, r.inserted_at, r.updated_at, r.inserted_by, r.updated_by,
        r.paid_amount, r.handover_user_id,
        u.username, u.full_name,
        COALESCE(hu.full_name, hu.username) as handover_user_name,
        c.name as customer_name, c.phone as customer_phone,
        e.name as equipment_name, e.code as equipment_code,
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
          (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
           FROM (
             SELECT id, sort_order, is_primary, COALESCE(secure_url, image_url) as url
             FROM entity_images
             WHERE entity_type = 'rentals' AND entity_id = r.id AND is_deleted = false AND provider NOT IN ('local')
           ) img),
          '[]'::json
        ) as images,
        b.name as pickup_branch_name,
        rb.name as return_branch_name,
        ob.name as original_branch_name
      FROM rentals r
      JOIN customers c ON r.customer_id = c.id
      JOIN equipment e ON r.equipment_id = e.id
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users hu ON r.handover_user_id = hu.id
      LEFT JOIN branches b ON r.pickup_branch_id = b.id
      LEFT JOIN branches rb ON r.return_branch_id = rb.id
      LEFT JOIN branches ob ON r.branch_id = ob.id
      WHERE r.is_deleted = false 
        AND r.status = 'active'
        AND (r.return_time >= $1 AND r.return_time <= $2)
        ${taskBranchFilter}
      ORDER BY r.return_time ASC
    `, taskParams);

    const overdueRes = await pool.query(`
      SELECT 
        r.id, r.customer_id, r.equipment_id, r.branch_id, r.pickup_branch_id, r.return_branch_id, r.user_id, r.manager_id, r.order_number, 
        r.code, r.status, r.start_date, r.end_date, r.start_period, r.end_period, 
        r.pickup_time, r.return_time, r.picked_up_at, r.returned_at, 
        r.unit_price, r.unit_price_session, r.applied_day_price, r.used_discount_day_price,
        r.discount_day_price, r.discount_day_threshold_snapshot, r.total_price, r.deposit_amount, 
        r.discount_amount, r.discount_type, r.damage_fee, r.notes, 
        r.is_deleted, r.inserted_at, r.updated_at, r.inserted_by, r.updated_by,
        r.paid_amount, r.handover_user_id,
        u.username, u.full_name,
        COALESCE(hu.full_name, hu.username) as handover_user_name,
        c.name as customer_name, c.phone as customer_phone,
        e.name as equipment_name, e.code as equipment_code,
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
          (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
           FROM (
             SELECT id, sort_order, is_primary, COALESCE(secure_url, image_url) as url
             FROM entity_images
             WHERE entity_type = 'rentals' AND entity_id = r.id AND is_deleted = false AND provider NOT IN ('local')
           ) img),
          '[]'::json
        ) as images,
        b.name as pickup_branch_name,
        rb.name as return_branch_name,
        ob.name as original_branch_name
      FROM rentals r
      JOIN customers c ON r.customer_id = c.id
      JOIN equipment e ON r.equipment_id = e.id
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users hu ON r.handover_user_id = hu.id
      LEFT JOIN branches b ON r.pickup_branch_id = b.id
      LEFT JOIN branches rb ON r.return_branch_id = rb.id
      LEFT JOIN branches ob ON r.branch_id = ob.id
      WHERE r.is_deleted = false 
        AND r.status = 'active'
        AND (r.return_time < NOW())
        ${overdueBranchFilter}
      ORDER BY r.return_time ASC
    `, overdueParams);

    // Late pickups: pending orders with pickup_time in the past (trễ giao)
    const latePickupParams = [];
    let latePickupBranchFilter = '';
    if (investorOnly) {
      latePickupParams.push(req.user.id);
      latePickupBranchFilter = ` AND e.owner_id = $1`;
    } else if (!isAdmin) {
      latePickupParams.push(branchIds.length > 0 ? branchIds : [-1]);
      latePickupBranchFilter = ` AND (r.branch_id = ANY($1) OR r.pickup_branch_id = ANY($1) OR r.return_branch_id = ANY($1))`;
    }

    const latePickupsRes = await pool.query(`
      SELECT 
        r.id, r.customer_id, r.equipment_id, r.branch_id, r.pickup_branch_id, r.return_branch_id, r.user_id, r.manager_id, r.order_number, 
        r.code, r.status, r.start_date, r.end_date, r.start_period, r.end_period, 
        r.pickup_time, r.return_time, r.picked_up_at, r.returned_at, 
        r.unit_price, r.unit_price_session, r.applied_day_price, r.used_discount_day_price,
        r.discount_day_price, r.discount_day_threshold_snapshot, r.total_price, r.deposit_amount, 
        r.discount_amount, r.discount_type, r.damage_fee, r.notes, 
        r.is_deleted, r.inserted_at, r.updated_at, r.inserted_by, r.updated_by,
        r.paid_amount, r.handover_user_id,
        u.username, u.full_name,
        COALESCE(hu.full_name, hu.username) as handover_user_name,
        c.name as customer_name, c.phone as customer_phone,
        e.name as equipment_name, e.code as equipment_code,
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
          (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
           FROM (
             SELECT id, sort_order, is_primary, COALESCE(secure_url, image_url) as url
             FROM entity_images
             WHERE entity_type = 'rentals' AND entity_id = r.id AND is_deleted = false AND provider NOT IN ('local')
           ) img),
          '[]'::json
        ) as images,
        b.name as pickup_branch_name,
        rb.name as return_branch_name,
        ob.name as original_branch_name
      FROM rentals r
      JOIN customers c ON r.customer_id = c.id
      JOIN equipment e ON r.equipment_id = e.id
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users hu ON r.handover_user_id = hu.id
      LEFT JOIN branches b ON r.pickup_branch_id = b.id
      LEFT JOIN branches rb ON r.return_branch_id = rb.id
      LEFT JOIN branches ob ON r.branch_id = ob.id
      WHERE r.is_deleted = false 
        AND r.status = 'pending'
        AND COALESCE(r.pickup_time, r.start_date) < NOW()
        ${latePickupBranchFilter}
      ORDER BY COALESCE(r.pickup_time, r.start_date) ASC
    `, latePickupParams);

    res.json({
      stats: {
        total_value_today: parseFloat(curr.total_value),
        total_value_trend: pct(parseFloat(curr.total_value), parseFloat(prev.total_value)),

        revenue_today: parseFloat(curr.revenue),
        revenue_trend: pct(parseFloat(curr.revenue), parseFloat(prev.revenue)),

        orders_today: parseInt(curr.orders),
        orders_trend: pct(parseInt(curr.orders), parseInt(prev.orders)),

        returns_today: parseInt(curr.returns),
        returns_trend: pct(parseInt(curr.returns), parseInt(prev.returns)),

        // POINT IN TIME TRENDS
        active_rentals: currentPoint.active,
        active_rentals_trend: pct(currentPoint.active, prevPoint.active),

        available_equipment: currentPoint.available,
        available_equipment_trend: pct(currentPoint.available, prevPoint.available)
      },
      pickups: pickupsRes.rows,
      returns: returnsRes.rows,
      overdue: overdueRes.rows,
      latePickups: latePickupsRes.rows
    });
  } catch (error) {
    console.error('Dashboard Summary Error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
};

router.get('/metrics', authenticate, async (req, res) => {
  try {
    const isAdmin = hasRole(req.user, 'admin');
    const investorOnly = isInvestorOnly(req.user);
    const branchIds = req.user.branch_ids || [];
    let branchFilter = '';
    const params = [];
    if (investorOnly) {
      params.push(req.user.id);
      branchFilter = ` AND EXISTS (
        SELECT 1 FROM equipment e
        WHERE e.id = rentals.equipment_id
          AND e.is_deleted = false
          AND e.owner_id = $${params.length}
      )`;
    } else if (!isAdmin) {
      params.push(branchIds.length > 0 ? branchIds : [-1]);
      branchFilter = ` AND (branch_id = ANY($${params.length}) OR pickup_branch_id = ANY($${params.length}) OR return_branch_id = ANY($${params.length}))`;
    }

    const totalEquipment = await pool.query(
      `SELECT COUNT(*) FROM equipment WHERE is_deleted = false ${investorOnly ? ' AND owner_id = $1' : (!isAdmin ? ' AND branch_id = ANY($1)' : '')}`,
      params
    );
    const activeRentals = await pool.query(`SELECT COUNT(*) FROM rentals WHERE status = 'active' AND is_deleted = false ${branchFilter}`, params);
    const totalRevenue = await pool.query(`SELECT SUM(total_price) FROM rentals WHERE status = 'completed' AND is_deleted = false ${branchFilter}`, params);

    res.json({
      totalEquipment: parseInt(totalEquipment.rows[0].count),
      activeRentals: parseInt(activeRentals.rows[0].count),
      totalRevenue: parseFloat(totalRevenue.rows[0].sum || 0)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

router.get('/today', authenticate, summaryHandler);
router.get('/summary', authenticate, summaryHandler);

module.exports = router;
