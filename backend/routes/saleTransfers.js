// routes/saleTransfers.js
// ─────────────────────────────────────────────────────────────────────
// API cho Nhân viên bán hàng (saler) quản lý chuyển tiền của chính mình.
//
// GET  /api/sale-transfers?month=YYYY-MM  → Xem lịch sử chuyển tiền của mình
// POST /api/sale-transfers                → Ghi nhận 1 lần chuyển tiền
// DELETE /api/sale-transfers/:id          → Xóa lệnh chuyển (chỉ của mình)
// ─────────────────────────────────────────────────────────────────────

const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, hasRole } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const {
  replaceEntityImages,
  getEntityImageUrls,
  normalizeImagePayload,
  softDeleteEntityImages,
  ImageServiceError
} = require('../utils/imageService');

const router = express.Router();

// Middleware: chỉ saler mới được dùng (admin dùng /api/payroll/transfers)
const requireSaler = (req, res, next) => {
  if (!hasRole(req.user, 'saler')) {
    return res.status(403).json({ error: 'Chỉ nhân viên bán hàng mới được dùng chức năng này.' });
  }
  next();
};

// ─────────────────────────────────────────────────────────────────────
// GET /api/sale-transfers?month=YYYY-MM
// ─────────────────────────────────────────────────────────────────────
router.get('/', authenticate, requireSaler, async (req, res) => {
  try {
    const { month } = req.query;
    let monthStr;

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      monthStr = month;
    } else {
      const now = new Date();
      monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const result = await pool.query(
      `SELECT stl.id,
              stl.month,
              stl.transfer_date,
              stl.amount,
              stl.notes,
              stl.inserted_at,
              au.username AS admin_username,
              au.full_name AS admin_full_name
       FROM sales_transfer_logs stl
       LEFT JOIN users au ON stl.admin_user_id = au.id
       WHERE stl.month = $1
         AND stl.sale_user_id = $2
         AND stl.is_deleted = false
       ORDER BY stl.transfer_date DESC, stl.inserted_at DESC`,
      [monthStr, req.user.id]
    );

    // Tổng đã chuyển trong tháng
    const totalTransferred = result.rows.reduce((s, r) => s + Number(r.amount), 0);

    // Lấy doanh thu tạo đơn & hoa hồng của sale trong tháng
    const startStr = `${monthStr}-01 00:00:00+07`;
    const [y, m] = monthStr.split('-').map(Number);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    const endStr = `${nextY}-${String(nextM).padStart(2, '0')}-01 00:00:00+07`;

    // Tính realtime: doanh thu từ đơn sale tự tạo (created_revenue không có trong snapshot)
    const revResult = await pool.query(
      `SELECT COALESCE(SUM(ren.total_price), 0)::numeric AS created_revenue
       FROM rentals ren
       WHERE ren.user_id = $1
         AND ren.status = 'completed'
         AND ren.is_deleted = false
         AND ren.returned_at >= $2::timestamptz
         AND ren.returned_at < $3::timestamptz`,
      [req.user.id, startStr, endStr]
    );
    const createdRevenue = revResult.rows.length > 0 ? Number(revResult.rows[0].created_revenue) : 0;

    // Lấy commission từ snapshot (nếu có), nếu không thì tính realtime
    const snapResult = await pool.query(
      `SELECT COALESCE(ps.commission_amount, 0)::numeric AS commission_amount,
              COALESCE(ps.driver_commission_amount, 0)::numeric AS driver_commission_amount
       FROM payroll_snapshots ps
       WHERE ps.user_id = $1 AND ps.month = $2 AND ps.is_deleted = false
       LIMIT 1`,
      [req.user.id, monthStr]
    );

    let commissionAmount = 0;
    let driverCommissionAmount = 0;

    if (snapResult.rows.length > 0) {
      commissionAmount = Number(snapResult.rows[0].commission_amount);
      driverCommissionAmount = Number(snapResult.rows[0].driver_commission_amount);
    } else {
      // Tính hoa hồng realtime
      const commResult = await pool.query(
        `SELECT COALESCE(SUM(
                 CASE
                   WHEN EXISTS (SELECT 1 FROM rental_commission_ledger l0
                                WHERE l0.rental_id = ren.id AND l0.is_deleted = false)
                   THEN COALESCE((SELECT SUM(l.commission_amount)
                                  FROM rental_commission_ledger l
                                  WHERE l.rental_id = ren.id AND l.user_id = u.id AND l.is_deleted = false), 0)
                   ELSE ren.total_price * COALESCE(u.commission_rate, 0)
                 END
               ), 0)::numeric AS commission_amount
         FROM users u
         CROSS JOIN rentals ren
         WHERE u.id = $1 AND u.is_deleted = false
           AND (ren.manager_id = u.id OR ren.user_id = u.id OR ren.handover_user_id = u.id)
           AND ren.status = 'completed'
           AND ren.is_deleted = false
           AND ren.returned_at >= $2::timestamptz
           AND ren.returned_at < $3::timestamptz`,
        [req.user.id, startStr, endStr]
      );
      commissionAmount = commResult.rows.length > 0 ? Number(commResult.rows[0].commission_amount) : 0;
      driverCommissionAmount = 0;
    }

    const netPayable = createdRevenue - commissionAmount - driverCommissionAmount;

    return res.json({
      month: monthStr,
      total_payable: netPayable,
      total_transferred: totalTransferred,
      remaining: netPayable - totalTransferred,
      transfers: await Promise.all(result.rows.map(async (r) => {
        const images = await getEntityImageUrls(pool, 'sale_transfers', r.id).catch(() => []);
        // Trả thẳng UTC ISO string – frontend sẽ dùng new Date() để hiển thị theo giờ địa phương (Việt Nam).
        const transferDate = r.transfer_date
          ? new Date(r.transfer_date).toISOString()
          : null;
        return {
          ...r,
          transfer_date: transferDate,
          amount: Number(r.amount),
          images,
        };
      })),
    });
  } catch (error) {
    console.error('Sale transfers GET error:', error);
    res.status(500).json({ error: 'Không thể tải dữ liệu chuyển tiền' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/sale-transfers
// Body: { month, transfer_date, amount, notes }
// sale_user_id luôn = req.user.id (không cho phép ghi đè)
// ─────────────────────────────────────────────────────────────────────
router.post('/', authenticate, requireSaler, async (req, res) => {
  try {
    const { month, transfer_date, amount, notes } = req.body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Thiếu hoặc sai định dạng tháng (YYYY-MM)' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    }

    const saleUserId = req.user.id;
    // Picker gửi "YYYY-MM-DDTHH:mm" (giờ VN, không timezone).
    // Nếu đã có timezone (±HH:MM hoặc Z) thì parse trực tiếp, nếu không thì gắn +07:00.
    const transferDate = transfer_date
      ? (transfer_date.includes('+') || transfer_date.includes('Z') || transfer_date.endsWith('z')
          ? new Date(transfer_date).toISOString()
          : (transfer_date.includes('T') ? new Date(transfer_date + ':00+07:00').toISOString() : new Date(transfer_date + 'T00:00:00+07:00').toISOString()))
      : new Date().toISOString();
    console.log('[POST sale-transfers] transfer_date=', transfer_date, '→ transferDate=', transferDate);

    // Tìm admin bất kỳ để gán làm người nhận (admin_user_id)
    const adminResult = await pool.query(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON u.id = ur.user_id AND ur.is_deleted = false
       JOIN roles r ON ur.role_id = r.id AND r.is_deleted = false
       WHERE r.name = 'admin' AND u.is_deleted = false
       LIMIT 1`
    );
    const adminUserId = adminResult.rows.length > 0 ? adminResult.rows[0].id : saleUserId;

    const insertResult = await pool.query(
      `INSERT INTO sales_transfer_logs (month, sale_user_id, admin_user_id, transfer_date, amount, notes, inserted_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING id, month, sale_user_id, admin_user_id, transfer_date, amount, notes`,
      [month, saleUserId, adminUserId, transferDate, Number(amount), notes || null, saleUserId]
    );

    const newTransfer = insertResult.rows[0];

    // Log activity
    await logActivity(
      'CREATE',
      'sale_transfer',
      newTransfer.id,
      `Ghi nhận chuyển tiền ${Number(amount).toLocaleString('vi-VN')}đ ngày ${transferDate}${notes ? ` (${notes})` : ''}`,
      saleUserId
    );

    return res.status(201).json({
      message: 'Đã ghi nhận chuyển tiền thành công!',
      transfer: newTransfer,
    });
  } catch (error) {
    console.error('Sale transfers POST error:', error);
    res.status(500).json({ error: 'Không thể ghi nhận chuyển tiền' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/sale-transfers/:id/upload-image
// Upload ảnh giao dịch cho 1 lệnh chuyển tiền
// ─────────────────────────────────────────────────────────────────────
router.post('/:id/upload-image', authenticate, requireSaler, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('[upload-image] START id=', id, 'body keys=', Object.keys(req.body));

    // Kiểm tra lệnh chuyển tồn tại và thuộc về user hiện tại
    const transferResult = await pool.query(
      `SELECT id FROM sales_transfer_logs
       WHERE id = $1 AND sale_user_id = $2 AND is_deleted = false`,
      [id, req.user.id]
    );
    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy lệnh chuyển tiền' });
    }

    console.log('[upload-image] body.imageData type=', typeof req.body.imageData, 'length=', req.body.imageData ? req.body.imageData.length : 0);
    console.log('[upload-image] body.filename=', req.body.filename);

    const imageInputs = normalizeImagePayload(req.body);
    console.log('[upload-image] normalizeImagePayload result count=', imageInputs.length);

    if (imageInputs.length === 0) {
      await softDeleteEntityImages(pool, 'sale_transfers', id, req.user.id);
      return res.json({ message: 'Đã xóa ảnh giao dịch', transfer_id: id, images: [] });
    }

    console.log('[upload-image] calling replaceEntityImages...');
    const savedImages = await replaceEntityImages(pool, 'sale_transfers', id, imageInputs, req.user.id);
    console.log('[upload-image] replaceEntityImages success, count=', savedImages.length);

    // Log activity
    await logActivity(
      'UPDATE',
      'sale_transfer',
      id,
      `Cập nhật ảnh giao dịch cho lệnh chuyển tiền #${id}`,
      req.user.id
    );

    return res.json({
      message: 'Tải ảnh giao dịch thành công!',
      transfer_id: id,
      images: savedImages.map((img) => img.secure_url || img.image_url),
    });
  } catch (error) {
    console.error('[upload-image] ERROR:', error.name, error.message, error.stack);
    if (error instanceof ImageServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: 'Không thể tải ảnh giao dịch' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// PUT /api/sale-transfers/:id
// Sửa lệnh chuyển tiền (chỉ của chính mình)
// Body: { month, transfer_date, amount, notes }
// ─────────────────────────────────────────────────────────────────────
router.put('/:id', authenticate, requireSaler, async (req, res) => {
  try {
    const { id } = req.params;
    const { month, transfer_date, amount, notes } = req.body;

    // Validate required fields
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    }

    // Check transfer exists and belongs to user, fetch old record for diff
    const oldResult = await pool.query(
      `SELECT id, month, transfer_date, amount, notes FROM sales_transfer_logs
       WHERE id = $1 AND sale_user_id = $2 AND is_deleted = false`,
      [id, req.user.id]
    );
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy lệnh chuyển tiền hoặc bạn không có quyền sửa.' });
    }
    const oldTransfer = oldResult.rows[0];

    // Picker gửi "YYYY-MM-DDTHH:mm" (giờ VN, không timezone).
    // Nếu đã có timezone (±HH:MM hoặc Z) thì parse trực tiếp, nếu không thì gắn +07:00.
    const transferDate = transfer_date
      ? (transfer_date.includes('+') || transfer_date.includes('Z') || transfer_date.endsWith('z')
          ? new Date(transfer_date).toISOString()
          : (transfer_date.includes('T') ? new Date(transfer_date + ':00+07:00').toISOString() : new Date(transfer_date + 'T00:00:00+07:00').toISOString()))
      : new Date().toISOString();
    console.log('[PUT sale-transfers] transfer_date=', transfer_date, '→ transferDate=', transferDate);

    const updateMonth = month || null;

    const result = await pool.query(
      `UPDATE sales_transfer_logs
       SET month = COALESCE($1, month),
           transfer_date = $2,
           amount = $3,
           notes = $4,
           updated_by = $5,
           updated_at = NOW()
       WHERE id = $6
         AND sale_user_id = $5
         AND is_deleted = false
       RETURNING id, month, sale_user_id, admin_user_id, transfer_date, amount, notes`,
      [updateMonth, transferDate, Number(amount), notes || null, req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy lệnh chuyển tiền hoặc bạn không có quyền sửa.' });
    }

    const updatedTransfer = result.rows[0];

    // Build old→new changes description
    const changes = [];
    if (oldTransfer.month !== updateMonth) changes.push(`Tháng: "${oldTransfer.month || 'không có'}" → "${updateMonth || 'không có'}"`);
    if (String(oldTransfer.transfer_date) !== String(transferDate)) changes.push(`Ngày chuyển: "${oldTransfer.transfer_date}" → "${transferDate}"`);
    if (Number(oldTransfer.amount) !== Number(amount)) changes.push(`Số tiền: ${Number(oldTransfer.amount).toLocaleString('vi-VN')}đ → ${Number(amount).toLocaleString('vi-VN')}đ`);
    if (String(oldTransfer.notes || '') !== String(notes || '')) changes.push(`Ghi chú: "${oldTransfer.notes || 'không có'}" → "${notes || 'không có'}"`);

    const desc = changes.length > 0
      ? `Sửa lệnh chuyển tiền #${id}: ${changes.join(', ')}`
      : `Sửa lệnh chuyển tiền #${id}`;

    // Log activity
    await logActivity('UPDATE', 'sale_transfer', parseInt(id), desc, req.user.id);

    return res.json({
      message: 'Đã cập nhật lệnh chuyển tiền thành công!',
      transfer: updatedTransfer,
    });
  } catch (error) {
    console.error('Sale transfers PUT error:', error);
    res.status(500).json({ error: 'Không thể cập nhật lệnh chuyển tiền' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/sale-transfers/:id
// Chỉ xóa được lệnh của chính mình
// ─────────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, requireSaler, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE sales_transfer_logs
       SET is_deleted = true,
           updated_by = $1,
           updated_at = NOW()
       WHERE id = $2
         AND sale_user_id = $1
         AND is_deleted = false`,
      [req.user.id, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Không tìm thấy lệnh chuyển tiền hoặc bạn không có quyền xóa.' });
    }

    // Log activity
    await logActivity(
      'DELETE',
      'sale_transfer',
      parseInt(id),
      `Xóa lệnh chuyển tiền #${id}`,
      req.user.id
    );

    return res.json({ message: 'Đã xóa lệnh chuyển tiền' });
  } catch (error) {
    console.error('Sale transfers DELETE error:', error);
    res.status(500).json({ error: 'Không thể xóa lệnh chuyển tiền' });
  }
});

module.exports = router;
