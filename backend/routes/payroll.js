// routes/payroll.js
//
// NGHIỆP VỤ CHỐT LƯƠNG:
// ─────────────────────────────────────────────────────────────────────
// Lương được chốt vào ngày 5 mỗi tháng bởi Admin.
//
// GET  /api/payroll?month=YYYY-MM
//   → Nếu tháng đó đã có snapshot → trả về snapshot (bất biến)
//   → Nếu chưa → tính realtime từ bảng rentals
//   → Kèm metadata: is_locked, can_lock, source, locked_at, locked_by_name
//
// POST /api/payroll/lock
//   → Body: { month: 'YYYY-MM' }
//   → Tính toán + INSERT toàn bộ nhân viên vào payroll_snapshots (1 transaction)
//   → 409 nếu tháng đó đã được chốt trước đó
//   → Chỉ cho phép chốt khi ngày hiện tại >= 5 (giờ VN)
//
// Hoa hồng: Bất kỳ role nào đều có thể có hoa hồng (commission_rate > 0)
//   camera_manager → tính từ revenue có manager_id = user (đơn họ quản lý/duyệt)
//   admin / saler / các role khác → tính từ revenue có user_id = user (đơn họ tạo)

const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const {
  replaceEntityImages,
  getEntityImageUrls,
  normalizeImagePayload,
  softDeleteEntityImages,
  ImageServiceError
} = require('../utils/imageService');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────
// HELPER: Tính realtime payroll cho tháng (không đọc snapshot)
// ─────────────────────────────────────────────────────────────────────
async function calcRealtimePayroll(startStr, endStr) {
  const result = await pool.query(`
    SELECT
      u.id,
      u.username,
      u.full_name,
      u.base_salary,
      u.commission_rate,
      b.name AS branch_name,
      COALESCE(
        string_agg(DISTINCT r.name, ',' ORDER BY r.name ASC),
        ''
      ) AS role_names,

      COALESCE((
        SELECT SUM(ren.total_price)
        FROM rentals ren
        WHERE (ren.manager_id = u.id OR ren.user_id = u.id OR ren.handover_user_id = u.id)
          AND ren.status = 'completed'
          AND ren.is_deleted = false
          AND ren.returned_at >= $1::timestamptz
          AND ren.returned_at < $2::timestamptz
      ), 0) AS managed_revenue,

      COALESCE((
        SELECT SUM(ren.total_price)
        FROM rentals ren
        WHERE ren.user_id = u.id
          AND ren.status = 'completed'
          AND ren.is_deleted = false
          AND ren.returned_at >= $1::timestamptz
          AND ren.returned_at < $2::timestamptz
      ), 0) AS created_revenue,

      COALESCE((
        SELECT COUNT(DISTINCT ren.id)
        FROM rentals ren
        WHERE (ren.manager_id = u.id OR ren.user_id = u.id OR ren.handover_user_id = u.id)
          AND ren.is_deleted = false
          AND ren.inserted_at >= $1::timestamptz
          AND ren.inserted_at < $2::timestamptz
      ), 0)::int AS managed_orders_count,

      COALESCE((
        SELECT COUNT(DISTINCT ren.id)
        FROM rentals ren
        WHERE ren.user_id = u.id
          AND ren.is_deleted = false
          AND ren.inserted_at >= $1::timestamptz
          AND ren.inserted_at < $2::timestamptz
      ), 0)::int AS created_orders_count
,

      COALESCE((
        SELECT SUM(
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM rental_commission_ledger l0
              WHERE l0.rental_id = ren.id
                AND l0.is_deleted = false
            )
            THEN COALESCE((
              SELECT SUM(l.commission_amount)
              FROM rental_commission_ledger l
              WHERE l.rental_id = ren.id
                AND l.user_id = u.id
                AND l.is_deleted = false
            ), 0)
            ELSE ren.total_price * COALESCE(u.commission_rate, 0)
          END
        )
        FROM rentals ren
        WHERE (ren.manager_id = u.id OR ren.user_id = u.id OR ren.handover_user_id = u.id)
          AND ren.status = 'completed'
          AND ren.is_deleted = false
          AND ren.returned_at >= $1::timestamptz
          AND ren.returned_at < $2::timestamptz
      ), 0) AS managed_commission,

      -- Commission breakdown from ledger
      COALESCE((
        SELECT SUM(l.commission_amount)
        FROM rental_commission_ledger l
        JOIN rentals ren ON ren.id = l.rental_id
        WHERE l.user_id = u.id
          AND l.source_role = 'saler'
          AND l.line_type = 'direct'
          AND l.is_deleted = false
          AND ren.is_deleted = false
          AND ren.status = 'completed'
          AND ren.returned_at >= $1::timestamptz
          AND ren.returned_at < $2::timestamptz
      ), 0) AS saler_commission_amount,

      COALESCE((
        SELECT SUM(l.commission_amount)
        FROM rental_commission_ledger l
        JOIN rentals ren ON ren.id = l.rental_id
        WHERE l.user_id = u.id
          AND l.source_role = 'driver'
          AND l.line_type = 'direct'
          AND l.is_deleted = false
          AND ren.is_deleted = false
          AND ren.status = 'completed'
          AND ren.returned_at >= $1::timestamptz
          AND ren.returned_at < $2::timestamptz
      ), 0) AS driver_commission_amount,

      COALESCE((
        SELECT SUM(l.commission_amount)
        FROM rental_commission_ledger l
        JOIN rentals ren ON ren.id = l.rental_id
        WHERE l.line_type = 'uplink_share'
          AND l.from_user_id = u.id
          AND l.is_deleted = false
          AND ren.is_deleted = false
          AND ren.status = 'completed'
          AND ren.returned_at >= $1::timestamptz
          AND ren.returned_at < $2::timestamptz
      ), 0) AS paid_to_upline,

      COALESCE((
        SELECT SUM(l.commission_amount)
        FROM rental_commission_ledger l
        JOIN rentals ren ON ren.id = l.rental_id
        WHERE l.user_id = u.id
          AND l.line_type = 'uplink_share'
          AND l.is_deleted = false
          AND ren.is_deleted = false
          AND ren.status = 'completed'
          AND ren.returned_at >= $1::timestamptz
          AND ren.returned_at < $2::timestamptz
      ), 0) AS received_from_downline,

      CASE
        WHEN EXISTS (
          SELECT 1
          FROM rental_commission_ledger l
          JOIN rentals ren ON ren.id = l.rental_id
          WHERE (l.user_id = u.id OR l.from_user_id = u.id)
            AND l.is_deleted = false
            AND ren.is_deleted = false
            AND ren.status = 'completed'
            AND ren.returned_at >= $1::timestamptz
            AND ren.returned_at < $2::timestamptz
        ) THEN TRUE
        ELSE FALSE
      END AS has_ledger_breakdown

    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_deleted = false
    LEFT JOIN roles r ON ur.role_id = r.id AND r.is_deleted = false
    LEFT JOIN branches b ON u.branch_id = b.id AND b.is_deleted = false
    WHERE u.is_deleted = false
    GROUP BY u.id, u.username, u.full_name, u.base_salary, u.commission_rate, b.name, u.inserted_at
    ORDER BY managed_revenue DESC, managed_orders_count DESC
  `, [startStr, endStr]);

  return result.rows.map(user => {
    const roleList = user.role_names ? user.role_names.split(',') : [];
    const managed_revenue = Number(user.managed_revenue);
    const commission_amount = Number(user.managed_commission || 0);
    const effectiveCommissionRate = managed_revenue > 0
      ? commission_amount / managed_revenue
      : Number(user.commission_rate || 0);
    // Display primary role name (prefer camera_manager > admin > saler)
    const primaryRole = roleList.includes('admin') ? 'admin'
      : roleList.includes('camera_manager') ? 'camera_manager'
        : roleList[0] || 'saler';
    return {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role_name: primaryRole,
      role_names: roleList,
      branch_name: user.branch_name,
      base_salary: Number(user.base_salary),
      commission_rate: effectiveCommissionRate,
      managed_revenue,
      created_revenue: Number(user.created_revenue || 0),
      managed_orders_count: parseInt(user.managed_orders_count, 10) || 0,
      created_orders_count: parseInt(user.created_orders_count, 10) || 0,
      commission_amount,
      total_payable: Number(user.base_salary) + commission_amount,
      saler_commission_amount: Number(user.saler_commission_amount || 0),
      driver_commission_amount: Number(user.driver_commission_amount || 0),
      paid_to_upline: Number(user.paid_to_upline || 0),
      received_from_downline: Number(user.received_from_downline || 0),
      has_ledger_breakdown: user.has_ledger_breakdown === true,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────
// HELPER: Lấy thông tin ngày tháng hiện tại theo giờ VN
// ─────────────────────────────────────────────────────────────────────
function getNowVN() {
  const vnStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
  const d = new Date(vnStr);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/payroll?month=YYYY-MM
// ─────────────────────────────────────────────────────────────────────
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { month } = req.query;

    let targetYear, targetMonth;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      [targetYear, targetMonth] = month.split('-').map(Number);
    } else {
      const vn = getNowVN();
      targetYear = vn.year;
      targetMonth = vn.month;
    }

    const monthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    const startStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01 00:00:00+07`;
    const nextMonth = targetMonth === 12 ? 1 : targetMonth + 1;
    const nextYear = targetMonth === 12 ? targetYear + 1 : targetYear;
    const endStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00+07`;

    const vn = getNowVN();
    const isCurrentMonth = (targetYear === vn.year && targetMonth === vn.month);
    const isPastMonth = targetYear < vn.year || (targetYear === vn.year && targetMonth < vn.month);

    // Có thể chốt nếu đến ngày 5 và là tháng hiện tại, hoặc tháng quá khứ
    const can_lock = (isCurrentMonth && vn.day >= 5) || isPastMonth;

    // ── Kiểm tra snapshot đã tồn tại chưa ──
    const snapCheck = await pool.query(
      `SELECT ps.locked_at, u.full_name AS locked_by_name
       FROM payroll_snapshots ps
       LEFT JOIN users u ON ps.locked_by = u.id
       WHERE ps.month = $1 AND ps.is_deleted = false
       LIMIT 1`,
      [monthStr]
    );

    if (snapCheck.rows.length > 0) {
      // ── Trả về từ SNAPSHOT ──
      const snapRows = await pool.query(
        `SELECT * FROM payroll_snapshots WHERE month = $1 AND is_deleted = false ORDER BY managed_revenue DESC, managed_orders_count DESC`,
        [monthStr]
      );
      const { locked_at, locked_by_name } = snapCheck.rows[0];

      // Compute order counts & created_revenue on the fly for snapshot (no DB columns needed)
      const userIds = snapRows.rows.map(r => r.user_id);
      let orderCountsMap = {};
      if (userIds.length > 0) {
        const countResult = await pool.query(
          `SELECT
             u.id AS user_id,
             COALESCE(managed.cnt, 0)::int AS managed_orders_count,
             COALESCE(created.cnt, 0)::int AS created_orders_count,
             COALESCE(createdRev.sum, 0)::numeric AS created_revenue
           FROM unnest($1::int[]) AS u(id)
           LEFT JOIN LATERAL (
             SELECT COUNT(DISTINCT ren.id)::int AS cnt
             FROM rentals ren
             WHERE (ren.manager_id = u.id OR ren.user_id = u.id OR ren.handover_user_id = u.id)
               AND ren.is_deleted = false
               AND ren.inserted_at >= $2::timestamptz
               AND ren.inserted_at < $3::timestamptz
           ) managed ON true
           LEFT JOIN LATERAL (
             SELECT COUNT(DISTINCT ren.id)::int AS cnt
             FROM rentals ren
             WHERE ren.user_id = u.id
               AND ren.is_deleted = false
               AND ren.inserted_at >= $2::timestamptz
               AND ren.inserted_at < $3::timestamptz
           ) created ON true
           LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(ren.total_price), 0)::numeric AS sum
             FROM rentals ren
             WHERE ren.user_id = u.id
               AND ren.status = 'completed'
               AND ren.is_deleted = false
               AND ren.returned_at >= $2::timestamptz
               AND ren.returned_at < $3::timestamptz
           ) createdRev ON true`,
          [userIds, startStr, endStr]
        );
        for (const row of countResult.rows) {
          orderCountsMap[row.user_id] = {
            managed_orders_count: row.managed_orders_count,
            created_orders_count: row.created_orders_count,
            created_revenue: Number(row.created_revenue || 0),
          };
        }
      }

      return res.json({
        month: monthStr,
        source: 'snapshot',
        is_locked: true,
        can_lock: false,
        lock_day: 5,
        locked_at,
        locked_by_name,
        payroll: snapRows.rows.map(r => ({
          id: r.user_id,
          username: r.username,
          full_name: r.full_name,
          role_name: r.role_name,
          branch_name: r.branch_name,
          base_salary: Number(r.base_salary),
          commission_rate: Number(r.commission_rate),
          managed_revenue: Number(r.managed_revenue),
          created_revenue: (orderCountsMap[r.user_id] || {}).created_revenue || 0,
          managed_orders_count: (orderCountsMap[r.user_id] || {}).managed_orders_count || 0,
          created_orders_count: (orderCountsMap[r.user_id] || {}).created_orders_count || 0,
          commission_amount: Number(r.commission_amount),
          total_payable: Number(r.total_payable),
          saler_commission_amount: Number(r.saler_commission_amount || 0),
          driver_commission_amount: Number(r.driver_commission_amount || 0),
          paid_to_upline: Number(r.paid_to_upline || 0),
          received_from_downline: Number(r.received_from_downline || 0),
          has_ledger_breakdown: r.has_ledger_breakdown === true,
        })),
      });
    }

    // ── Tính REALTIME ──
    const payroll = await calcRealtimePayroll(startStr, endStr);

    return res.json({
      month: monthStr,
      source: 'realtime',
      is_locked: false,
      can_lock,
      lock_day: 5,
      locked_at: null,
      locked_by_name: null,
      payroll,
    });
  } catch (error) {
    console.error('Payroll GET error:', error);
    res.status(500).json({ error: 'Không thể tải dữ liệu lương' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/payroll/lock  — Chốt lương (ghi snapshot)
// ─────────────────────────────────────────────────────────────────────
router.post('/lock', authenticate, requireAdmin, async (req, res) => {
  try {
    const { month } = req.body;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Thiếu hoặc sai định dạng tháng (YYYY-MM)' });
    }

    const [targetYear, targetMonth] = month.split('-').map(Number);
    const monthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

    const vn = getNowVN();
    const isCurrentMonth = (targetYear === vn.year && targetMonth === vn.month);
    const isPastMonth = targetYear < vn.year || (targetYear === vn.year && targetMonth < vn.month);

    if (!isPastMonth && !(isCurrentMonth && vn.day >= 5)) {
      return res.status(400).json({
        error: `Chưa đến ngày chốt lương. Vui lòng chờ đến ngày 5 tháng ${monthStr}.`,
      });
    }

    // Kiểm tra đã chốt chưa
    const existing = await pool.query(
      'SELECT id FROM payroll_snapshots WHERE month = $1 AND is_deleted = false LIMIT 1',
      [monthStr]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `Lương tháng ${monthStr} đã được chốt trước đó.` });
    }

    // Tính toán realtime
    const startStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01 00:00:00+07`;
    const nextMonth = targetMonth === 12 ? 1 : targetMonth + 1;
    const nextYear = targetMonth === 12 ? targetYear + 1 : targetYear;
    const endStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00+07`;
    const payroll = await calcRealtimePayroll(startStr, endStr);

    if (payroll.length === 0) {
      return res.status(400).json({ error: 'Không có nhân viên nào để chốt lương.' });
    }

    const lockedBy = req.user.id;

    // Ghi snapshot trong 1 transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const p of payroll) {
        await client.query(
          `INSERT INTO payroll_snapshots
             (user_id, month, full_name, username, role_name, branch_name,
              base_salary, commission_rate, managed_revenue, commission_amount,
              total_payable, saler_commission_amount, driver_commission_amount,
              paid_to_upline, received_from_downline, has_ledger_breakdown,
              locked_by, locked_at, inserted_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(), $17, $17)`,
          [
            p.id, monthStr, p.full_name, p.username, p.role_name, p.branch_name,
            p.base_salary, p.commission_rate, p.managed_revenue,
            p.commission_amount, p.total_payable,
            p.saler_commission_amount, p.driver_commission_amount,
            p.paid_to_upline, p.received_from_downline, p.has_ledger_breakdown,
            lockedBy,
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.json({
      message: `Đã chốt lương tháng ${monthStr} cho ${payroll.length} nhân viên.`,
      month: monthStr,
      count: payroll.length,
    });
  } catch (error) {
    console.error('Payroll LOCK error:', error);
    res.status(500).json({ error: 'Không thể chốt lương. Vui lòng thử lại.' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/payroll/transfers
// POST /api/payroll/transfers
// PUT /api/payroll/transfers/:id
// DELETE /api/payroll/transfers/:id
// ─────────────────────────────────────────────────────────────────────

router.get('/transfers', authenticate, requireAdmin, async (req, res) => {
  try {
    const { month } = req.query;
    const vn = getNowVN();
    let targetYear = vn.year;
    let targetMonth = vn.month;

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      [targetYear, targetMonth] = month.split('-').map(Number);
    }
    const monthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

    const result = await pool.query(
      `SELECT stl.id,
              stl.month,
              stl.transfer_date,
              stl.amount,
              stl.notes,
              stl.sale_user_id,
              su.username AS sale_username,
              su.full_name AS sale_full_name,
              stl.admin_user_id,
              au.username AS admin_username,
              au.full_name AS admin_full_name
       FROM sales_transfer_logs stl
       LEFT JOIN users su ON stl.sale_user_id = su.id
       LEFT JOIN users au ON stl.admin_user_id = au.id
       WHERE stl.month = $1
         AND stl.is_deleted = false
       ORDER BY stl.transfer_date DESC, stl.inserted_at DESC`,
      [monthStr]
    );

    return res.json({
      month: monthStr,
      transfers: await Promise.all(result.rows.map(async (row) => {
        const images = await getEntityImageUrls(pool, 'sale_transfers', row.id).catch(() => []);
        return {
          ...row,
          amount: Number(row.amount),
          images,
        };
      })),
    });
  } catch (error) {
    console.error('Payroll transfers GET error:', error);
    res.status(500).json({ error: 'Không thể tải dữ liệu sổ chuyển tiền' });
  }
});

router.post('/transfers', authenticate, requireAdmin, async (req, res) => {
  try {
    const { month, sale_user_id, transfer_date, amount, notes } = req.body;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Thiếu hoặc sai định dạng tháng (YYYY-MM)' });
    }
    if (!sale_user_id || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Thiếu người bán hoặc số tiền không hợp lệ' });
    }

    const userResult = await pool.query(
      'SELECT id, username, full_name FROM users WHERE id = $1 AND is_deleted = false',
      [sale_user_id]
    );
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Người bán không tồn tại' });
    }

    const adminUserId = req.user.id;
    // Picker gửi "YYYY-MM-DDTHH:mm" (giờ VN, không timezone).
    // Nếu đã có timezone (±HH:MM hoặc Z) thì parse trực tiếp, nếu không thì gắn +07:00.
    const transferDate = transfer_date
      ? (transfer_date.includes('+') || transfer_date.includes('Z') || transfer_date.endsWith('z')
          ? new Date(transfer_date).toISOString()
          : (transfer_date.includes('T') ? new Date(transfer_date + ':00+07:00').toISOString() : new Date(transfer_date + 'T00:00:00+07:00').toISOString()))
      : new Date().toISOString();

    const insertResult = await pool.query(
      `INSERT INTO sales_transfer_logs (month, sale_user_id, admin_user_id, transfer_date, amount, notes, inserted_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING id, month, sale_user_id, admin_user_id, transfer_date, amount, notes`,
      [month, sale_user_id, adminUserId, transferDate, Number(amount), notes || null, adminUserId]
    );

    const newTransfer = insertResult.rows[0];

    // Log activity
    await logActivity(
      'CREATE',
      'sale_transfer',
      newTransfer.id,
      `Admin ghi nhận chuyển tiền ${Number(amount).toLocaleString('vi-VN')}đ cho ${userResult.rows[0].full_name || userResult.rows[0].username} tháng ${month}${notes ? ` (${notes})` : ''}`,
      req.user.id
    );

    return res.status(201).json({
      message: 'Đã ghi nhận lệnh chuyển tiền',
      transfer: newTransfer,
    });
  } catch (error) {
    console.error('Payroll transfers POST error:', error);
    res.status(500).json({ error: 'Không thể tạo lệnh chuyển tiền' });
  }
});

router.put('/transfers/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { sale_user_id, transfer_date, amount, notes } = req.body;

    if (!sale_user_id || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Thiếu người bán hoặc số tiền không hợp lệ' });
    }

    const userResult = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND is_deleted = false',
      [sale_user_id]
    );
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Người bán không tồn tại' });
    }

    // Picker gửi "YYYY-MM-DDTHH:mm" (giờ VN, không timezone).
    // Nếu đã có timezone (±HH:MM hoặc Z) thì parse trực tiếp, nếu không thì gắn +07:00.
    const transferDate = transfer_date
      ? (transfer_date.includes('+') || transfer_date.includes('Z') || transfer_date.endsWith('z')
          ? new Date(transfer_date).toISOString()
          : (transfer_date.includes('T') ? new Date(transfer_date + ':00+07:00').toISOString() : new Date(transfer_date + 'T00:00:00+07:00').toISOString()))
      : new Date().toISOString();

    const updateResult = await pool.query(
      `UPDATE sales_transfer_logs
       SET sale_user_id = $1,
           transfer_date = $2,
           amount = $3,
           notes = $4,
           updated_by = $5,
           updated_at = NOW()
       WHERE id = $6 AND is_deleted = false
       RETURNING id, month, sale_user_id, admin_user_id, transfer_date, amount, notes`,
      [sale_user_id, transferDate, Number(amount), notes || null, req.user.id, id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy lệnh chuyển tiền' });
    }

    const updatedTransfer = updateResult.rows[0];

    // Log activity
    await logActivity(
      'UPDATE',
      'sale_transfer',
      updatedTransfer.id,
      `Admin cập nhật lệnh chuyển tiền #${id}: ${Number(amount).toLocaleString('vi-VN')}đ${notes ? ` (${notes})` : ''}`,
      req.user.id
    );

    return res.json({ message: 'Đã cập nhật lệnh chuyển tiền', transfer: updatedTransfer });
  } catch (error) {
    console.error('Payroll transfers PUT error:', error);
    res.status(500).json({ error: 'Không thể cập nhật lệnh chuyển tiền' });
  }
});

router.delete('/transfers/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE sales_transfer_logs
       SET is_deleted = true,
           updated_by = $1,
           updated_at = NOW()
       WHERE id = $2 AND is_deleted = false`,
      [req.user.id, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Không tìm thấy lệnh chuyển tiền' });
    }

    // Log activity
    await logActivity(
      'DELETE',
      'sale_transfer',
      parseInt(id),
      `Admin xóa lệnh chuyển tiền #${id}`,
      req.user.id
    );

    return res.json({ message: 'Đã xóa lệnh chuyển tiền' });
  } catch (error) {
    console.error('Payroll transfers DELETE error:', error);
    res.status(500).json({ error: 'Không thể xóa lệnh chuyển tiền' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/payroll/transfers/:id/upload-image
// Upload ảnh giao dịch cho 1 lệnh chuyển tiền (admin side)
// ─────────────────────────────────────────────────────────────────────
router.post('/transfers/:id/upload-image', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra lệnh chuyển tồn tại
    const transferResult = await pool.query(
      `SELECT id FROM sales_transfer_logs
       WHERE id = $1 AND is_deleted = false`,
      [id]
    );
    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy lệnh chuyển tiền' });
    }

    const imageInputs = normalizeImagePayload(req.body);

    if (imageInputs.length === 0) {
      await softDeleteEntityImages(pool, 'sale_transfers', id, req.user.id);
      return res.json({ message: 'Đã xóa ảnh giao dịch', transfer_id: id, images: [] });
    }

    const savedImages = await replaceEntityImages(pool, 'sale_transfers', id, imageInputs, req.user.id);

    return res.json({
      message: 'Tải ảnh giao dịch thành công!',
      transfer_id: id,
      images: savedImages.map((img) => img.secure_url || img.image_url),
    });
  } catch (error) {
    console.error('Payroll transfer upload-image error:', error);
    if (error instanceof ImageServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: 'Không thể tải ảnh giao dịch' });
  }
});

module.exports = router;
