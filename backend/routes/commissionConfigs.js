const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, requireAdminOrManager } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

const router = express.Router();

const normalizeRate = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 100) return null;
  return num;
};

// ─── GET all rule sets (with assigned_user_count) ────────────────────────────
router.get('/', authenticate, requireAdminOrManager, async (req, res) => {
  try {
    const ruleType = req.query.rule_type || null;
    let whereClause = 'WHERE rs.is_deleted = false';
    const params = [];

    if (ruleType && ['saler', 'driver'].includes(ruleType)) {
      whereClause += ` AND rs.rule_type = $1`;
      params.push(ruleType);
    }

    const result = await pool.query(
      `
        SELECT rs.id, rs.name, rs.rule_type, rs.is_active, rs.effective_from, rs.effective_to,
               rs.rate_percent,
               COUNT(rsu.user_id) FILTER (WHERE rsu.is_deleted = false AND u.is_deleted = false) AS assigned_user_count
        FROM commission_rule_sets rs
        LEFT JOIN commission_rule_set_users rsu ON rsu.rule_set_id = rs.id AND rsu.is_deleted = false
        LEFT JOIN users u ON u.id = rsu.user_id
        ${whereClause}
        GROUP BY rs.id
        ORDER BY rs.is_active DESC, rs.rule_type ASC, rs.id DESC
      `,
      params
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Get commission configs error:', error);
    return res.status(500).json({ error: 'Failed to fetch commission configs' });
  }
});

// ─── GET active rule sets (one per rule_type: saler & driver) ────────────────
router.get('/active', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const ruleType = req.query.rule_type || null;

    let whereClause = `
      WHERE rs.is_deleted = false
        AND rs.is_active = true
        AND (rs.effective_from IS NULL OR rs.effective_from <= $1)
        AND (rs.effective_to IS NULL OR rs.effective_to >= $1)
    `;
    const params = [now];

    if (ruleType && ['saler', 'driver'].includes(ruleType)) {
      whereClause += ` AND rs.rule_type = $2`;
      params.push(ruleType);
    }

    const result = await pool.query(
      `
        SELECT rs.id, rs.name, rs.rule_type, rs.is_active, rs.effective_from, rs.effective_to,
               rs.rate_percent
        FROM commission_rule_sets rs
        ${whereClause}
        ORDER BY rs.rule_type ASC, rs.effective_from DESC NULLS LAST, rs.id DESC
      `,
      params
    );

    // If a specific rule_type was requested, return single object; otherwise return all
    if (ruleType && ['saler', 'driver'].includes(ruleType)) {
      return res.json(result.rows[0] || null);
    }
    return res.json(result.rows);
  } catch (error) {
    console.error('Get active commission config error:', error);
    return res.status(500).json({ error: 'Failed to fetch active commission config' });
  }
});

// ─── GET all rule-set-user assignments (for Users page, avoids N+1) ──────────
router.get('/all-users', authenticate, requireAdminOrManager, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT rsu.user_id, rsu.rule_set_id, rsu.role_name AS assigned_role,
             rs.name AS rule_set_name, rs.rule_type, rs.rate_percent, rs.is_active
      FROM commission_rule_set_users rsu
      JOIN commission_rule_sets rs ON rs.id = rsu.rule_set_id AND rs.is_deleted = false
      WHERE rsu.is_deleted = false
      ORDER BY rsu.user_id, rs.rule_type
    `);
    return res.json(result.rows);
  } catch (error) {
    console.error('Get all rule set users error:', error);
    return res.status(500).json({ error: 'Failed to fetch all rule set users' });
  }
});

// ─── GET users assigned to a rule set (optionally filtered by role_name) ─────
router.get('/:id/users', authenticate, requireAdminOrManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid rule set id' });
  }

  const roleName = req.query.role_name || null;

  try {
    let query = `
        SELECT u.id, u.username, u.full_name,
               r.name AS user_role_name,
               rsu.role_name AS assigned_role
        FROM commission_rule_set_users rsu
        JOIN users u ON u.id = rsu.user_id AND u.is_deleted = false
        LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.is_deleted = false
        LEFT JOIN roles r ON r.id = ur.role_id AND r.is_deleted = false
        WHERE rsu.rule_set_id = $1
          AND rsu.is_deleted = false
    `;
    const params = [id];

    if (roleName && ['saler', 'driver'].includes(roleName)) {
      query += ` AND rsu.role_name = $2`;
      params.push(roleName);
    }

    query += ` ORDER BY rsu.role_name ASC, u.full_name ASC`;

    const result = await pool.query(query, params);

    return res.json(result.rows);
  } catch (error) {
    console.error('Get rule set users error:', error);
    return res.status(500).json({ error: 'Failed to fetch rule set users' });
  }
});

// ─── Assign a user to a rule set for a specific role (saler/driver) ──────────
router.post('/:id/users', authenticate, requireAdminOrManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid rule set id' });
  }

  const userId = Number(req.body?.user_id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user_id' });
  }

  const roleName = req.body?.role_name;
  if (!roleName || !['saler', 'driver'].includes(roleName)) {
    return res.status(400).json({ error: 'role_name must be "saler" or "driver"' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify rule set exists
    const rsCheck = await client.query(
      'SELECT id, name FROM commission_rule_sets WHERE id = $1 AND is_deleted = false LIMIT 1',
      [id]
    );
    if (rsCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rule set not found' });
    }

    // Verify user exists
    const userCheck = await client.query(
      'SELECT id, username FROM users WHERE id = $1 AND is_deleted = false LIMIT 1',
      [userId]
    );
    if (userCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is already assigned to a DIFFERENT rule set for this role
    const existingAssignment = await client.query(
      `SELECT rsu.rule_set_id, rs.name AS old_rule_set_name
       FROM commission_rule_set_users rsu
       JOIN commission_rule_sets rs ON rs.id = rsu.rule_set_id AND rs.is_deleted = false
       WHERE rsu.user_id = $1
         AND rsu.role_name = $2
         AND rsu.is_deleted = false
         AND rsu.rule_set_id != $3
       LIMIT 1`,
      [userId, roleName, id]
    );

    // Upsert: if user+role already assigned somewhere, move them here
    await client.query(
      `
        INSERT INTO commission_rule_set_users (rule_set_id, user_id, role_name, inserted_by, updated_by, is_deleted)
        VALUES ($1, $2, $3, $4, $4, false)
        ON CONFLICT (user_id, role_name) DO UPDATE
          SET rule_set_id = EXCLUDED.rule_set_id,
              is_deleted  = false,
              updated_at  = NOW(),
              updated_by  = EXCLUDED.updated_by
      `,
      [id, userId, roleName, req.user.id]
    );

    await client.query('COMMIT');

    // Log removal from old rule set (if applicable)
    if (existingAssignment.rows.length > 0) {
      const old = existingAssignment.rows[0];
      await logActivity('UPDATE', 'commission_config', old.rule_set_id,
        `Gỡ user "${userCheck.rows[0].username}" khỏi bộ quy tắc "${old.old_rule_set_name}" (chuyển sang "${rsCheck.rows[0].name}")`,
        req.user.id);
    }

    await logActivity('UPDATE', 'commission_config', id, `Gán user "${userCheck.rows[0].username}" vào bộ quy tắc "${rsCheck.rows[0].name}" với vai trò ${roleName === 'saler' ? 'Saler' : 'Driver'}`, req.user.id);
    return res.status(201).json({ message: `User assigned to rule set as ${roleName}` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Assign user to rule set error:', error);
    return res.status(500).json({ error: 'Failed to assign user' });
  } finally {
    client.release();
  }
});

// ─── Remove a user from a rule set for a specific role ───────────────────────
router.delete('/:id/users/:userId', authenticate, requireAdminOrManager, async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.params.userId);

  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const roleName = req.query.role_name;

  try {
    let query = `
        UPDATE commission_rule_set_users
        SET is_deleted = true, updated_at = NOW(), updated_by = $3
        WHERE rule_set_id = $1
          AND user_id = $2
          AND is_deleted = false
    `;
    const params = [id, userId, req.user.id];

    if (roleName && ['saler', 'driver'].includes(roleName)) {
      query += ` AND role_name = $4`;
      params.push(roleName);
    }

    query += ` RETURNING id`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Lấy tên rule set và username để ghi log
    const [rsInfo, userInfo] = await Promise.all([
      pool.query('SELECT name FROM commission_rule_sets WHERE id = $1 LIMIT 1', [id]),
      pool.query('SELECT username FROM users WHERE id = $1 LIMIT 1', [userId])
    ]);
    const rsName = rsInfo.rows[0]?.name || `#${id}`;
    const targetUsername = userInfo.rows[0]?.username || `#${userId}`;
    await logActivity('UPDATE', 'commission_config', id, `Gỡ user "${targetUsername}" khỏi bộ quy tắc "${rsName}"`, req.user.id);

    return res.json({ message: 'User removed from rule set' });
  } catch (error) {
    console.error('Remove user from rule set error:', error);
    return res.status(500).json({ error: 'Failed to remove user' });
  }
});

// ─── CREATE a new rule set ────────────────────────────────────────────────────
router.post('/', authenticate, requireAdminOrManager, async (req, res) => {
  const {
    name,
    rule_type = 'saler',
    is_active = false,
    effective_from = null,
    effective_to = null,
    rates = {}
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  if (!['saler', 'driver'].includes(rule_type)) {
    return res.status(400).json({ error: 'rule_type must be "saler" or "driver"' });
  }

  // Validate: saler rule set needs saler rate, driver rule set needs driver rate
  const rateValue = rule_type === 'saler'
    ? normalizeRate(rates.saler)
    : normalizeRate(rates.driver);

  if (rateValue === null) {
    const rateKey = rule_type === 'saler' ? 'saler' : 'driver';
    return res.status(400).json({ error: `Rates.${rateKey} must be a number between 0 and 100` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // is_active is now a simple toggle — multiple configs of the same type can be active.
    // Each user is individually assigned to a rule set; activation only controls whether
    // the config can be used in rentals at all.

    const ruleSetResult = await client.query(
      `
        INSERT INTO commission_rule_sets (
          name, rule_type, rate_percent, is_active, effective_from, effective_to, inserted_by, updated_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
        RETURNING *
      `,
      [name.trim(), rule_type, rateValue, Boolean(is_active), effective_from, effective_to, req.user.id]
    );

    const ruleSet = ruleSetResult.rows[0];

    await client.query('COMMIT');
    await logActivity('CREATE', 'commission_config', ruleSet.id, `Tạo bộ quy tắc hoa hồng "${ruleSet.name}" (${ruleSet.rule_type === 'saler' ? 'Saler' : 'Driver'}, ${Number(ruleSet.rate_percent)}%)`, req.user.id);
    return res.status(201).json(ruleSet);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create commission config error:', error);
    return res.status(500).json({ error: 'Failed to create commission config' });
  } finally {
    client.release();
  }
});

// ─── PATCH a rule set (name, dates, is_active) ───────────────────────────────
router.patch('/:id', authenticate, requireAdminOrManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid rule set id' });
  }

  const {
    name,
    is_active,
    effective_from,
    effective_to
  } = req.body;

  const fields = [];
  const params = [];

  if (name !== undefined) {
    params.push(String(name).trim());
    fields.push(`name = $${params.length}`);
  }

  if (is_active !== undefined) {
    params.push(Boolean(is_active));
    fields.push(`is_active = $${params.length}`);
  }

  if (effective_from !== undefined) {
    params.push(effective_from);
    fields.push(`effective_from = $${params.length}`);
  }

  if (effective_to !== undefined) {
    params.push(effective_to);
    fields.push(`effective_to = $${params.length}`);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(req.user.id);
  fields.push(`updated_at = NOW()`);
  fields.push(`updated_by = $${params.length}`);

  params.push(id);

  try {
    // Fetch old record for diff
    const oldResult = await pool.query(
      'SELECT * FROM commission_rule_sets WHERE id = $1 AND is_deleted = false LIMIT 1',
      [id]
    );

    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rule set not found' });
    }

    const old = oldResult.rows[0];

    const result = await pool.query(
      `
        UPDATE commission_rule_sets
        SET ${fields.join(', ')}
        WHERE id = $${params.length}
          AND is_deleted = false
        RETURNING *
      `,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule set not found' });
    }

    const updated = result.rows[0];

    // Build old→new changes description
    const changes = [];
    if (name !== undefined && old.name !== updated.name) changes.push(`Tên: "${old.name}" → "${updated.name}"`);
    if (is_active !== undefined && Boolean(old.is_active) !== Boolean(updated.is_active)) changes.push(`Kích hoạt: ${old.is_active ? 'Có' : 'Không'} → ${updated.is_active ? 'Có' : 'Không'}`);
    if (effective_from !== undefined && String(old.effective_from || '') !== String(updated.effective_from || '')) changes.push(`Hiệu lực từ: "${old.effective_from || 'không có'}" → "${updated.effective_from || 'không có'}"`);
    if (effective_to !== undefined && String(old.effective_to || '') !== String(updated.effective_to || '')) changes.push(`Hiệu lực đến: "${old.effective_to || 'không có'}" → "${updated.effective_to || 'không có'}"`);

    const desc = changes.length > 0
      ? `Cập nhật bộ quy tắc hoa hồng "${updated.name}": ${changes.join(', ')}`
      : `Cập nhật bộ quy tắc hoa hồng "${updated.name}"`;

    await logActivity('UPDATE', 'commission_config', id, desc, req.user.id);
    return res.json(updated);
  } catch (error) {
    console.error('Update commission config error:', error);
    return res.status(500).json({ error: 'Failed to update commission config' });
  }
});

// ─── ACTIVATE a rule set (deactivates others of the SAME rule_type) ──────────
router.patch('/:id/activate', authenticate, requireAdminOrManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid rule set id' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const exists = await client.query(
      'SELECT id, rule_type FROM commission_rule_sets WHERE id = $1 AND is_deleted = false LIMIT 1',
      [id]
    );

    if (exists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rule set not found' });
    }

    // is_active is now a simple toggle — activating does NOT deactivate other configs.
    // Multiple configs of the same type can be active simultaneously.
    // Each user is individually assigned; activation only controls whether the config
    // can be used in rentals at all.

    const updated = await client.query(
      `
        UPDATE commission_rule_sets
        SET is_active = true,
            updated_at = NOW(),
            updated_by = $2
        WHERE id = $1
          AND is_deleted = false
        RETURNING *
      `,
      [id, req.user.id]
    );

    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rule set not found' });
    }

    await client.query('COMMIT');
    await logActivity('UPDATE', 'commission_config', id, `Kích hoạt bộ quy tắc hoa hồng "${updated.rows[0].name}"`, req.user.id);
    return res.json(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Activate commission config error:', error);
    return res.status(500).json({ error: 'Failed to activate commission config' });
  } finally {
    client.release();
  }
});

// ─── DEACTIVATE a rule set ───────────────────────────────────────────────────
router.patch('/:id/deactivate', authenticate, requireAdminOrManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid rule set id' });
  }

  try {
    const result = await pool.query(
      `
        UPDATE commission_rule_sets
        SET is_active = false,
            updated_at = NOW(),
            updated_by = $2
        WHERE id = $1
          AND is_deleted = false
        RETURNING *
      `,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule set not found' });
    }

    await logActivity('UPDATE', 'commission_config', id, `Vô hiệu hóa bộ quy tắc hoa hồng "${result.rows[0].name}"`, req.user.id);
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Deactivate commission config error:', error);
    return res.status(500).json({ error: 'Failed to deactivate commission config' });
  }
});

// ─── UPDATE rates for a rule set ─────────────────────────────────────────────
router.put('/:id/rates', authenticate, requireAdminOrManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid rule set id' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch old rate for diff
    const oldRateResult = await client.query(
      'SELECT rate_percent, name FROM commission_rule_sets WHERE id = $1 AND is_deleted = false FOR UPDATE LIMIT 1',
      [id]
    );
    if (oldRateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rule set not found' });
    }

    const oldRate = Number(oldRateResult.rows[0].rate_percent);
    const oldName = oldRateResult.rows[0].name;
    const ruleType = oldRateResult.rows[0].rule_type;
    const rateKey = ruleType === 'saler' ? 'saler' : 'driver';
    const rateValue = normalizeRate(req.body?.[rateKey]);

    if (rateValue === null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Rates.${rateKey} must be a number between 0 and 100` });
    }

    const result = await client.query(
      `
        UPDATE commission_rule_sets
        SET rate_percent = $2,
            updated_at = NOW(),
            updated_by = $3
        WHERE id = $1
          AND is_deleted = false
        RETURNING *
      `,
      [id, rateValue, req.user.id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rule set not found or already deleted' });
    }

    await client.query('COMMIT');

    const newRate = Number(result.rows[0].rate_percent);
    const desc = oldRate !== newRate
      ? `Cập nhật tỷ lệ hoa hồng cho "${result.rows[0].name}": ${oldRate}% → ${newRate}%`
      : `Cập nhật tỷ lệ hoa hồng cho "${result.rows[0].name}" thành ${newRate}%`;

    await logActivity('UPDATE', 'commission_config', id, desc, req.user.id);
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update commission rates error:', error);
    return res.status(500).json({ error: 'Failed to update rates' });
  } finally {
    client.release();
  }
});

// ─── DELETE a rule set ────────────────────────────────────────────────────────
router.delete('/:id', authenticate, requireAdminOrManager, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid rule set id' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if the rule set exists and is active
    const checkResult = await client.query(
      'SELECT id, name, is_active FROM commission_rule_sets WHERE id = $1 AND is_deleted = false LIMIT 1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Rule set not found' });
    }

    if (checkResult.rows[0].is_active) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Không thể xóa bộ quy tắc đang hoạt động. Vui lòng kích hoạt bộ quy tắc khác trước.' });
    }

    // Mark the rule set as deleted
    await client.query(
      `
        UPDATE commission_rule_sets
        SET is_deleted = true,
            updated_at = NOW(),
            updated_by = $2
        WHERE id = $1
      `,
      [id, req.user.id]
    );

    // Also mark user assignments as deleted
    await client.query(
      `
        UPDATE commission_rule_set_users
        SET is_deleted = true,
            updated_at = NOW(),
            updated_by = $2
        WHERE rule_set_id = $1
      `,
      [id, req.user.id]
    );

    await client.query('COMMIT');
    await logActivity('DELETE', 'commission_config', id, `Xóa bộ quy tắc hoa hồng "${checkResult.rows[0].name}"`, req.user.id);
    return res.json({ message: 'Xóa bộ quy tắc thành công' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete commission config error:', error);
    return res.status(500).json({ error: 'Failed to delete commission config' });
  } finally {
    client.release();
  }
});

module.exports = router;

