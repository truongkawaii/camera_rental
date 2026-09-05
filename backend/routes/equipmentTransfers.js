// routes/equipmentTransfers.js
const express = require('express');
const { pool } = require('../utils/db');
const { logActivity } = require('../utils/logger');
const { authenticate, requireAdmin, requireAdminOrManager, hasRole } = require('../middleware/auth');

const router = express.Router();

// Middleware: admin, quản lý camera, hoặc giao nhận máy (driver) đều được quản lý điều chuyển
const requireTransferManager = (req, res, next) => {
  if (!hasRole(req.user, 'admin', 'camera_manager', 'driver')) {
    return res.status(403).json({ error: 'Chỉ Admin, Quản lý Camera hoặc nhân viên Giao nhận máy mới có quyền quản lý điều chuyển.' });
  }
  next();
};

// ─────────────────────────────────────────────────────────────────────
// GET /api/equipment-transfers
// Query: ?month=YYYY-MM | ?status=pending | ?equipment_id=123
// ─────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const { month, status, equipment_id } = req.query;
    const params = [];
    let where = 'WHERE et.is_deleted = false';

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      params.push(month);
      where += ` AND to_char(et.inserted_at, 'YYYY-MM') = $${params.length}`;
    }
    if (status) {
      params.push(status);
      where += ` AND et.status = $${params.length}`;
    }
    if (equipment_id) {
      params.push(parseInt(equipment_id));
      where += ` AND et.equipment_id = $${params.length}`;
    }

    const result = await pool.query(`
      SELECT
        et.*,
        e.name AS equipment_name,
        e.code AS equipment_code,
        e.category AS equipment_category,
        fb.name AS from_branch_name,
        tb.name AS to_branch_name,
        COALESCE(req_u.full_name, req_u.username) AS requested_by_name,
        COALESCE(app_u.full_name, app_u.username) AS approved_by_name
      FROM equipment_transfers et
      JOIN equipment e ON et.equipment_id = e.id
      LEFT JOIN branches fb ON et.from_branch_id = fb.id
      LEFT JOIN branches tb ON et.to_branch_id = tb.id
      LEFT JOIN users req_u ON et.requested_by = req_u.id
      LEFT JOIN users app_u ON et.approved_by = app_u.id
      ${where}
      ORDER BY et.inserted_at DESC
    `, params);

    res.json({ transfers: result.rows });
  } catch (error) {
    console.error('Equipment transfers GET error:', error);
    res.status(500).json({ error: 'Không thể tải danh sách điều chuyển' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /api/equipment-transfers/:id
// ─────────────────────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        et.*,
        e.name AS equipment_name, e.code AS equipment_code, e.category AS equipment_category,
        fb.name AS from_branch_name, tb.name AS to_branch_name,
        COALESCE(req_u.full_name, req_u.username) AS requested_by_name,
        COALESCE(app_u.full_name, app_u.username) AS approved_by_name
      FROM equipment_transfers et
      JOIN equipment e ON et.equipment_id = e.id
      LEFT JOIN branches fb ON et.from_branch_id = fb.id
      LEFT JOIN branches tb ON et.to_branch_id = tb.id
      LEFT JOIN users req_u ON et.requested_by = req_u.id
      LEFT JOIN users app_u ON et.approved_by = app_u.id
      WHERE et.id = $1 AND et.is_deleted = false
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Equipment transfer GET/:id error:', error);
    res.status(500).json({ error: 'Lỗi khi tải chi tiết' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/equipment-transfers — Tạo yêu cầu điều chuyển
// ─────────────────────────────────────────────────────────────────────
router.post('/', authenticate, requireTransferManager, async (req, res) => {
  try {
    const { equipment_id, to_branch_id, reason, notes } = req.body;

    if (!equipment_id || !to_branch_id) {
      return res.status(400).json({ error: 'Thiếu thông tin thiết bị hoặc chi nhánh đích' });
    }

    // Get equipment's current location
    const eqResult = await pool.query(
      'SELECT id, branch_id, current_branch_id, name, code FROM equipment WHERE id = $1 AND is_deleted = false',
      [equipment_id]
    );
    if (eqResult.rows.length === 0) return res.status(404).json({ error: 'Thiết bị không tồn tại' });

    const eq = eqResult.rows[0];
    const from_branch_id = eq.current_branch_id || eq.branch_id;

    if (from_branch_id === parseInt(to_branch_id)) {
      return res.status(400).json({ error: 'Chi nhánh đích trùng với chi nhánh hiện tại' });
    }

    // Check if there's an active transfer already
    const activeTransfer = await pool.query(
      `SELECT id FROM equipment_transfers WHERE equipment_id = $1 AND status IN ('pending', 'approved', 'in_transit') AND is_deleted = false`,
      [equipment_id]
    );
    if (activeTransfer.rows.length > 0) {
      return res.status(400).json({ error: 'Thiết bị này đang có yêu cầu điều chuyển chưa hoàn tất' });
    }

    const result = await pool.query(`
      INSERT INTO equipment_transfers (equipment_id, from_branch_id, to_branch_id, status, reason, notes, requested_by, inserted_by)
      VALUES ($1, $2, $3, 'pending', $4, $5, $6, $6)
      RETURNING *
    `, [equipment_id, from_branch_id, to_branch_id, reason || null, notes || null, req.user.id]);

    await logActivity(
      'CREATE', 'equipment_transfer', result.rows[0].id,
      `Tạo yêu cầu điều chuyển ${eq.code || eq.name} từ chi nhánh ${from_branch_id} → ${to_branch_id}`,
      req.user.id
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Equipment transfer POST error:', error);
    res.status(500).json({ error: 'Lỗi khi tạo yêu cầu điều chuyển' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// PUT /api/equipment-transfers/:id/approve — Admin duyệt
// ─────────────────────────────────────────────────────────────────────
router.put('/:id/approve', authenticate, requireTransferManager, async (req, res) => {
  try {
    const { id } = req.params;
    const transfer = await pool.query('SELECT * FROM equipment_transfers WHERE id = $1 AND is_deleted = false', [id]);
    if (transfer.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    if (transfer.rows[0].status !== 'pending') return res.status(400).json({ error: 'Chỉ duyệt được yêu cầu đang chờ' });

    const result = await pool.query(`
      UPDATE equipment_transfers SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_by = $1, updated_at = NOW()
      WHERE id = $2 RETURNING *
    `, [req.user.id, id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Approve transfer error:', error);
    res.status(500).json({ error: 'Lỗi khi duyệt' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// PUT /api/equipment-transfers/:id/reject — Admin từ chối
// ─────────────────────────────────────────────────────────────────────
router.put('/:id/reject', authenticate, requireTransferManager, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const transfer = await pool.query('SELECT * FROM equipment_transfers WHERE id = $1 AND is_deleted = false', [id]);
    if (transfer.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    if (transfer.rows[0].status !== 'pending') return res.status(400).json({ error: 'Chỉ từ chối được yêu cầu đang chờ' });

    const result = await pool.query(`
      UPDATE equipment_transfers SET status = 'rejected', notes = COALESCE($1, notes), approved_by = $2, approved_at = NOW(), updated_by = $2, updated_at = NOW()
      WHERE id = $3 RETURNING *
    `, [reason || null, req.user.id, id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Reject transfer error:', error);
    res.status(500).json({ error: 'Lỗi khi từ chối' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// PUT /api/equipment-transfers/:id/complete — Hoàn tất (cập nhật current_branch_id)
// ─────────────────────────────────────────────────────────────────────
router.put('/:id/complete', authenticate, requireTransferManager, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const transfer = await client.query('SELECT * FROM equipment_transfers WHERE id = $1 AND is_deleted = false', [id]);
    if (transfer.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Không tìm thấy' }); }
    
    const t = transfer.rows[0];
    if (!['pending', 'approved'].includes(t.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Không thể hoàn tất yêu cầu ở trạng thái này' });
    }

    // Update transfer status
    const result = await client.query(`
      UPDATE equipment_transfers SET status = 'completed', completed_at = NOW(), approved_by = COALESCE(approved_by, $1), approved_at = COALESCE(approved_at, NOW()), updated_by = $1, updated_at = NOW()
      WHERE id = $2 RETURNING *
    `, [req.user.id, id]);

    // Update equipment's current_branch_id
    const eq = await client.query('SELECT branch_id FROM equipment WHERE id = $1', [t.equipment_id]);
    const homeBranchId = eq.rows[0]?.branch_id;

    // If transferring back to home branch, set NULL; otherwise set to_branch_id
    const newCurrentBranch = (t.to_branch_id === homeBranchId) ? null : t.to_branch_id;
    await client.query(
      'UPDATE equipment SET current_branch_id = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3',
      [newCurrentBranch, req.user.id, t.equipment_id]
    );

    await client.query('COMMIT');

    await logActivity(
      'UPDATE', 'equipment_transfer', parseInt(id),
      `Hoàn tất điều chuyển thiết bị #${t.equipment_id} → chi nhánh ${t.to_branch_id}`,
      req.user.id
    );

    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Complete transfer error:', error);
    res.status(500).json({ error: 'Lỗi khi hoàn tất điều chuyển' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────
// PUT /api/equipment-transfers/:id/cancel — Huỷ yêu cầu
// ─────────────────────────────────────────────────────────────────────
router.put('/:id/cancel', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const transfer = await pool.query('SELECT * FROM equipment_transfers WHERE id = $1 AND is_deleted = false', [id]);
    if (transfer.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });

    const t = transfer.rows[0];
    if (!['pending'].includes(t.status)) return res.status(400).json({ error: 'Chỉ huỷ được yêu cầu đang chờ' });

    // Only creator, driver, camera_manager or admin can cancel
    if (t.requested_by !== req.user.id && !hasRole(req.user, 'admin', 'camera_manager', 'driver')) {
      return res.status(403).json({ error: 'Bạn không có quyền huỷ yêu cầu này' });
    }

    const result = await pool.query(`
      UPDATE equipment_transfers SET status = 'cancelled', updated_by = $1, updated_at = NOW()
      WHERE id = $2 RETURNING *
    `, [req.user.id, id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Cancel transfer error:', error);
    res.status(500).json({ error: 'Lỗi khi huỷ' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/equipment-transfers/:id — Xoá mềm
// ─────────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query(
      'UPDATE equipment_transfers SET is_deleted = true, updated_by = $1, updated_at = NOW() WHERE id = $2',
      [req.user.id, req.params.id]
    );
    res.json({ message: 'Đã xoá' });
  } catch (error) {
    console.error('Delete transfer error:', error);
    res.status(500).json({ error: 'Lỗi khi xoá' });
  }
});

module.exports = router;
