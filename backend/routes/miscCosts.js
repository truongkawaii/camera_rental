// routes/miscCosts.js
// CRUD quản lý chi phí phát sinh
//
// GET  /api/misc-costs?month=YYYY-MM           → Lấy chi phí phát sinh trong tháng
// GET  /api/misc-costs?startDate=...&endDate=... → Lấy theo khoảng ngày (cho Performance)
// POST /api/misc-costs                          → Thêm chi phí
// PUT  /api/misc-costs/:id                      → Sửa chi phí
// DELETE /api/misc-costs/:id                   → Xóa mềm

const express = require('express');
const { pool } = require('../utils/db');
const { logActivity } = require('../utils/logger');
const { authenticate, requireAdmin, hasRole } = require('../middleware/auth');

const router = express.Router();

const formatMiscCostCode = (id) => `MISC-${String(id).padStart(6, '0')}`;

const formatDateValue = (value) => {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value).slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const normalizeMiscDates = ({ date, start_date, end_date }) => {
  const startDate = start_date || date;
  const endDate = end_date || startDate;
  return { date: startDate, startDate, endDate };
};

const formatMoney = (value) => `${Number(value || 0).toLocaleString('vi-VN')}đ`;

const formatTextValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
};

const buildMiscCostChanges = (oldCost, newCost, newBranchName) => {
  const changes = [];
  const oldDate = `${formatDateValue(oldCost.start_date || oldCost.date)} - ${formatDateValue(oldCost.end_date || oldCost.date)}`;
  const newDate = `${formatDateValue(newCost.start_date || newCost.date)} - ${formatDateValue(newCost.end_date || newCost.date)}`;

  if (oldDate !== newDate) {
    changes.push(`Ngày: ${oldDate} → ${newDate}`);
  }
  if (Number(oldCost.branch_id) !== Number(newCost.branch_id)) {
    changes.push(`Cơ sở: ${formatTextValue(oldCost.branch_name)} → ${formatTextValue(newBranchName)}`);
  }
  if (Number(oldCost.amount) !== Number(newCost.amount)) {
    changes.push(`Số tiền: ${formatMoney(oldCost.amount)} → ${formatMoney(newCost.amount)}`);
  }
  if (formatTextValue(oldCost.category) !== formatTextValue(newCost.category)) {
    changes.push(`Danh mục: ${formatTextValue(oldCost.category)} → ${formatTextValue(newCost.category)}`);
  }
  if (formatTextValue(oldCost.notes) !== formatTextValue(newCost.notes)) {
    changes.push(`Ghi chú: ${formatTextValue(oldCost.notes)} → ${formatTextValue(newCost.notes)}`);
  }

  return changes.length > 0 ? changes.join(', ') : 'không có thay đổi dữ liệu';
};

// ─────────────────────────────────────────────────────────────────────
// GET /api/misc-costs
// Supports ?month=YYYY-MM  OR  ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const { month, startDate, endDate } = req.query;

    // Chỉ cho phép role được xem báo cáo (giống ALLOWED_ROLES trong revenueByBranchService)
    if (!hasRole(req.user, 'admin', 'investor')) {
      return res.status(403).json({ error: 'Bạn không có quyền xem dữ liệu này.' });
    }

    let start, end;

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      start = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
      end   = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    } else if (startDate && endDate) {
      start = startDate;
      end   = endDate;
    } else {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      start = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      end   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    const result = await pool.query(
      `SELECT
         mc.id,
         mc.date,
         COALESCE(mc.start_date, mc.date) AS start_date,
         COALESCE(mc.end_date, mc.date) AS end_date,
         mc.branch_id,
         b.name AS branch_name,
         mc.amount,
         mc.category,
         mc.notes,
         mc.inserted_at,
         mc.updated_at,
         u.full_name AS created_by_name
       FROM misc_costs mc
       LEFT JOIN branches b ON mc.branch_id = b.id
       LEFT JOIN users u ON mc.inserted_by = u.id
       WHERE mc.is_deleted = false
         AND COALESCE(mc.start_date, mc.date) <= $2
         AND COALESCE(mc.end_date, mc.date) >= $1
       ORDER BY COALESCE(mc.start_date, mc.date) DESC, mc.inserted_at DESC`,
      [start, end]
    );

    const total = result.rows.reduce((s, r) => s + parseFloat(r.amount), 0);

    return res.json({
      misc_costs: result.rows.map(r => ({
        ...r,
        amount: parseFloat(r.amount),
      })),
      total_misc_cost: total,
      start,
      end,
    });
  } catch (error) {
    console.error('Misc costs GET error:', error);
    res.status(500).json({ error: 'Không thể tải dữ liệu chi phí phát sinh' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /api/misc-costs  — Thêm chi phí
// Body: { date, start_date, end_date, amount, category, notes, branch_id }
// ─────────────────────────────────────────────────────────────────────
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { date, start_date, end_date, amount, category, notes, branch_id } = req.body;
    const miscDates = normalizeMiscDates({ date, start_date, end_date });

    if (!miscDates.startDate || !miscDates.endDate || !amount || !branch_id) {
      return res.status(400).json({ error: 'Thiếu ngày, số tiền hoặc cơ sở' });
    }
    if (miscDates.endDate < miscDates.startDate) {
      return res.status(400).json({ error: 'Đến ngày phải lớn hơn hoặc bằng từ ngày' });
    }
    if (isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    }

    const branchResult = await pool.query('SELECT id, name FROM branches WHERE id = $1 AND is_deleted = false', [branch_id]);
    if (branchResult.rows.length === 0) {
      return res.status(400).json({ error: 'Cơ sở không hợp lệ' });
    }

    const duplicateResult = await pool.query(
      `SELECT id, amount
       FROM misc_costs
       WHERE is_deleted = false
         AND COALESCE(start_date, date) = $1
         AND COALESCE(end_date, date) = $2
         AND branch_id = $3
         AND lower(trim(COALESCE(category, ''))) = lower(trim($4))
       LIMIT 1`,
      [miscDates.startDate, miscDates.endDate, Number(branch_id), category || '']
    );
    if (duplicateResult.rows.length > 0) {
      const existing = duplicateResult.rows[0];
      return res.status(409).json({
        error: `Đã có chi phí phát sinh ${formatMiscCostCode(existing.id)} cho ngày ${date}, cơ sở "${branchResult.rows[0].name}", danh mục "${category || '-'}" với số tiền ${Number(existing.amount).toLocaleString('vi-VN')}đ. Vui lòng kiểm tra lại trước khi thêm mới.`,
        duplicate_id: existing.id,
      });
    }

    const userId = req.user.id;
    const result = await pool.query(
      `INSERT INTO misc_costs (date, start_date, end_date, branch_id, amount, category, notes, inserted_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING id, date, start_date, end_date, branch_id, amount, category, notes, inserted_at`,
      [miscDates.date, miscDates.startDate, miscDates.endDate, Number(branch_id), Number(amount), category || null, notes || null, userId]
    );
    const miscCost = result.rows[0];
    const branchName = branchResult.rows[0].name;
    const categoryText = category ? ` [${category}]` : '';
    await logActivity(
      'CREATE',
      'misc_cost',
      miscCost.id,
      `Thêm chi phí phát sinh ${formatMiscCostCode(miscCost.id)}${categoryText} ngày ${date} tại "${branchName}" với số tiền ${Number(amount).toLocaleString('vi-VN')}đ`,
      userId
    );

    return res.status(201).json({
      message: 'Đã thêm chi phí phát sinh thành công',
      misc_cost: { ...result.rows[0], amount: parseFloat(result.rows[0].amount) },
    });
  } catch (error) {
    console.error('Misc costs POST error:', error);
    res.status(500).json({ error: 'Không thể thêm chi phí phát sinh' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// PUT /api/misc-costs/:id  — Sửa chi phí
// ─────────────────────────────────────────────────────────────────────
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, start_date, end_date, amount, category, notes, branch_id } = req.body;
    const miscDates = normalizeMiscDates({ date, start_date, end_date });

    if (!miscDates.startDate || !miscDates.endDate || !amount || !branch_id) {
      return res.status(400).json({ error: 'Thiếu ngày, số tiền hoặc cơ sở' });
    }
    if (isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ error: 'Số tiền không hợp lệ' });
    }

    const branchResult = await pool.query('SELECT id, name FROM branches WHERE id = $1 AND is_deleted = false', [branch_id]);
    if (branchResult.rows.length === 0) {
      return res.status(400).json({ error: 'Cơ sở không hợp lệ' });
    }

    const userId = req.user.id;
    const oldResult = await pool.query(
      `SELECT mc.id, mc.date, COALESCE(mc.start_date, mc.date) AS start_date, COALESCE(mc.end_date, mc.date) AS end_date, mc.branch_id, mc.amount, mc.category, mc.notes, b.name AS branch_name
       FROM misc_costs mc
       LEFT JOIN branches b ON mc.branch_id = b.id
       WHERE mc.id = $1 AND mc.is_deleted = false`,
      [id]
    );

    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy chi phí phát sinh' });
    }

    const result = await pool.query(
      `UPDATE misc_costs
       SET date = $1, start_date = $2, end_date = $3, branch_id = $4, amount = $5, category = $6, notes = $7,
           updated_by = $8, updated_at = NOW()
       WHERE id = $9 AND is_deleted = false
       RETURNING id, date, start_date, end_date, branch_id, amount, category, notes, updated_at`,
      [miscDates.date, miscDates.startDate, miscDates.endDate, Number(branch_id), Number(amount), category || null, notes || null, userId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy chi phí phát sinh' });
    }

    const miscCost = result.rows[0];
    const changeSummary = buildMiscCostChanges(oldResult.rows[0], miscCost, branchResult.rows[0].name);
    await logActivity(
      'UPDATE',
      'misc_cost',
      miscCost.id,
      `Cập nhật chi phí phát sinh ${formatMiscCostCode(miscCost.id)}: ${changeSummary}`,
      userId
    );

    return res.json({
      message: 'Đã cập nhật chi phí phát sinh',
      misc_cost: { ...result.rows[0], amount: parseFloat(result.rows[0].amount) },
    });
  } catch (error) {
    console.error('Misc costs PUT error:', error);
    res.status(500).json({ error: 'Không thể cập nhật chi phí phát sinh' });
  }
});

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/misc-costs/:id  — Xóa mềm
// ─────────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(
      `UPDATE misc_costs SET is_deleted = true, updated_by = $1, updated_at = NOW()
       WHERE id = $2 AND is_deleted = false
       RETURNING id, date, amount, category,
         (SELECT name FROM branches WHERE branches.id = misc_costs.branch_id) AS branch_name`,
      [userId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy chi phí phát sinh' });
    }

    const miscCost = result.rows[0];
    const categoryText = miscCost.category ? ` [${miscCost.category}]` : '';
    const branchText = miscCost.branch_name ? ` tại "${miscCost.branch_name}"` : '';
    await logActivity(
      'DELETE',
      'misc_cost',
      miscCost.id,
      `Xóa chi phí phát sinh ${formatMiscCostCode(miscCost.id)}${categoryText} ngày ${formatDateValue(miscCost.date)}${branchText} với số tiền ${Number(miscCost.amount).toLocaleString('vi-VN')}đ`,
      userId
    );

    return res.json({ message: 'Đã xóa chi phí phát sinh' });
  } catch (error) {
    console.error('Misc costs DELETE error:', error);
    res.status(500).json({ error: 'Không thể xóa chi phí phát sinh' });
  }
});

module.exports = router;
