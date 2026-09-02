// routes/users.js
const express = require('express');
const { pool } = require('../utils/db');
const { logActivity } = require('../utils/logger');
const { authenticate, requireAdmin, hasRole } = require('../middleware/auth');

const router = express.Router();

// Get all users (admin, camera manager or saler)
router.get('/', authenticate, (req, res, next) => {
  if (!hasRole(req.user, 'admin', 'camera_manager', 'investor', 'saler', 'driver')) {
    return res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này.' });
  }
  next();
}, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id, u.username, u.full_name, u.inserted_at,
        u.base_salary, u.commission_rate, u.branch_id,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('id', r.id, 'name', r.name)
          ) FILTER (WHERE r.id IS NOT NULL AND ur.is_deleted = false),
          '[]'
        ) AS roles,
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object('id', b.id, 'name', b.name)
          ) FILTER (WHERE b.id IS NOT NULL AND ub.is_deleted = false),
          '[]'
        ) AS branches
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_deleted = false
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN user_branches ub ON u.id = ub.user_id AND ub.is_deleted = false
      LEFT JOIN branches b ON ub.branch_id = b.id
      WHERE u.is_deleted = false
      GROUP BY u.id, u.username, u.full_name, u.inserted_at,
               u.base_salary, u.commission_rate, u.branch_id
      ORDER BY u.inserted_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create new user (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { username, password, full_name, role_ids = [], branch_ids = [], base_salary = 0, commission_rate = 0 } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing required fields' });
  if (!Array.isArray(role_ids) || role_ids.length === 0) {
    return res.status(400).json({ error: 'Vui lòng chọn ít nhất một vai trò' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hash = await require('bcryptjs').hash(password, 10);
    const primaryBranchId = branch_ids.length > 0 ? branch_ids[0] : null;
    const userResult = await client.query(
      `INSERT INTO users (username, password, full_name, branch_id, base_salary, commission_rate, inserted_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING id, username, full_name, branch_id, base_salary, commission_rate`,
      [username, hash, full_name, primaryBranchId, base_salary, commission_rate, req.user.id]
    );
    const newUser = userResult.rows[0];

    // Insert roles
    for (const roleId of role_ids) {
      await client.query(
        'INSERT INTO user_roles (user_id, role_id, inserted_by, updated_by) VALUES ($1, $2, $3, $3) ON CONFLICT DO NOTHING',
        [newUser.id, roleId, req.user.id]
      );
    }

    // Insert branches
    for (const branchId of branch_ids) {
      await client.query(
        'INSERT INTO user_branches (user_id, branch_id, inserted_by, updated_by) VALUES ($1, $2, $3, $3) ON CONFLICT DO NOTHING',
        [newUser.id, branchId, req.user.id]
      );
    }

    await client.query('COMMIT');
    await logActivity('CREATE', 'user', newUser.id, `Tạo tài khoản "${username}" (${full_name})`, req.user.id);
    res.status(201).json(newUser);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(400).json({ error: 'Username already exists' });
    console.error('Failed to create user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  } finally {
    client.release();
  }
});

// Update user (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { full_name, role_ids = [], branch_ids = [], password, base_salary } = req.body;

  if (!Array.isArray(role_ids) || role_ids.length === 0) {
    return res.status(400).json({ error: 'Vui lòng chọn ít nhất một vai trò' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch old data for logging
    const oldResult = await client.query(`
      SELECT u.*,
             COALESCE(json_agg(DISTINCT r.name) FILTER (WHERE r.id IS NOT NULL AND ur.is_deleted = false), '[]') as roles,
             COALESCE(json_agg(DISTINCT b.name) FILTER (WHERE b.id IS NOT NULL AND ub.is_deleted = false), '[]') as branches
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_deleted = false
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN user_branches ub ON u.id = ub.user_id AND ub.is_deleted = false
      LEFT JOIN branches b ON ub.branch_id = b.id
      WHERE u.id = $1 AND u.is_deleted = false
      GROUP BY u.id
    `, [id]);
    
    if (oldResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    const old = oldResult.rows[0];

    const primaryBranchId = branch_ids.length > 0 ? branch_ids[0] : null;

    // Build SET clause dynamically — only include fields that are provided
    const setFields = [];
    const setValues = [];
    let paramIndex = 0;

    setFields.push('full_name');
    paramIndex++;
    setValues.push(full_name);

    setFields.push('branch_id');
    paramIndex++;
    setValues.push(primaryBranchId);

    setFields.push('base_salary');
    paramIndex++;
    setValues.push(base_salary ?? old.base_salary);

    // Only update commission_rate if explicitly provided in the request body
    if (req.body.commission_rate !== undefined) {
      setFields.push('commission_rate');
      paramIndex++;
      setValues.push(req.body.commission_rate);
    }

    if (password) {
      const hash = await require('bcryptjs').hash(password, 10);
      setFields.push('password');
      paramIndex++;
      setValues.push(hash);
    }

    paramIndex++;
    setValues.push(req.user.id);
    setFields.push('updated_at = NOW()');
    setFields.push(`updated_by = $${paramIndex}`);

    paramIndex++;
    setValues.push(id);

    const result = await client.query(
      `UPDATE users SET ${setFields.map((f, i) => f.includes(' ') ? f : `${f} = $${i + 1}`).join(', ')}
       WHERE id = $${paramIndex} AND is_deleted = false
       RETURNING id, username, full_name, branch_id, base_salary, commission_rate`,
      setValues
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    const updated = result.rows[0];

    // Replace roles
    await client.query('UPDATE user_roles SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE user_id = $2', [req.user.id, id]);
    for (const roleId of role_ids) {
      await client.query(
        'INSERT INTO user_roles (user_id, role_id, inserted_by, updated_by) VALUES ($1, $2, $3, $3) ON CONFLICT (user_id, role_id) DO UPDATE SET is_deleted = false, updated_at = NOW(), updated_by = $3',
        [id, roleId, req.user.id]
      );
    }

    // Replace branches
    await client.query('UPDATE user_branches SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE user_id = $2', [req.user.id, id]);
    for (const branchId of branch_ids) {
      await client.query(
        'INSERT INTO user_branches (user_id, branch_id, inserted_by, updated_by) VALUES ($1, $2, $3, $3) ON CONFLICT (user_id, branch_id) DO UPDATE SET is_deleted = false, updated_at = NOW(), updated_by = $3',
        [id, branchId, req.user.id]
      );
    }

    // Fetch new info for log
    const newInfo = await client.query(`
      SELECT COALESCE(json_agg(DISTINCT r.name) FILTER (WHERE r.id IS NOT NULL AND ur.is_deleted = false), '[]') as roles,
             COALESCE(json_agg(DISTINCT b.name) FILTER (WHERE b.id IS NOT NULL AND ub.is_deleted = false), '[]') as branches
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_deleted = false
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN user_branches ub ON u.id = ub.user_id AND ub.is_deleted = false
      LEFT JOIN branches b ON ub.branch_id = b.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [id]);
    const { roles: newRoles, branches: newBranches } = newInfo.rows[0];

    await client.query('COMMIT');

    // Build diff description
    const changes = [];
    if (old.full_name !== updated.full_name) changes.push(`Họ tên: "${old.full_name}" → "${updated.full_name}"`);
    
    // Branches diff
    const oldBranches = Array.isArray(old.branches) ? old.branches : [];
    const branchesChanged = oldBranches.length !== newBranches.length || !oldBranches.every(b => newBranches.includes(b));
    if (branchesChanged) {
      changes.push(`Cơ sở: [${oldBranches.join(', ')}] → [${newBranches.join(', ')}]`);
    }

    if (parseFloat(old.base_salary) !== parseFloat(updated.base_salary)) changes.push(`Lương cứng: ${Number(old.base_salary).toLocaleString()} → ${Number(updated.base_salary).toLocaleString()}`);
    if (parseFloat(old.commission_rate) !== parseFloat(updated.commission_rate)) changes.push(`% Hoa hồng: ${(old.commission_rate * 100).toFixed(2)}% → ${(updated.commission_rate * 100).toFixed(2)}%`);
    if (password) changes.push('Đã đổi mật khẩu');
    
    // Roles diff
    const oldRoles = Array.isArray(old.roles) ? old.roles : [];
    const rolesChanged = oldRoles.length !== newRoles.length || !oldRoles.every(r => newRoles.includes(r));
    if (rolesChanged) {
      changes.push(`Vai trò: [${oldRoles.join(', ')}] → [${newRoles.join(', ')}]`);
    }

    const desc = changes.length > 0 
      ? `Cập nhật tài khoản "${updated.username}": ${changes.join(', ')}`
      : `Cập nhật tài khoản "${updated.username}"`;

    await logActivity('UPDATE', 'user', id, desc, req.user.id);
    res.json(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to update user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  } finally {
    client.release();
  }
});

// Delete user (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  try {
    const userResult = await pool.query('SELECT username FROM users WHERE id=$1 AND is_deleted = false', [id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    // Check for active references before soft delete
    const checkRefs = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM rentals WHERE user_id = $1 AND is_deleted = false) as rental_count_staff,
        (SELECT COUNT(*) FROM rentals WHERE manager_id = $1 AND is_deleted = false) as rental_count_manager
    `, [id]);

    const { rental_count_staff, rental_count_manager } = checkRefs.rows[0];
    if (parseInt(rental_count_staff) > 0 || parseInt(rental_count_manager) > 0) {
      return res.status(400).json({
        error: 'Không thể xóa tài khoản này vì đang có dữ liệu liên kết.',
        details: { rentals_staff: rental_count_staff, rentals_manager: rental_count_manager }
      });
    }

    // Soft delete user and roles
    await pool.query('UPDATE users SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE id=$2', [req.user.id, id]);
    await pool.query('UPDATE user_roles SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE user_id = $2', [req.user.id, id]);

    await logActivity('DELETE', 'user', id, `Xóa tài khoản "${userResult.rows[0].username}"`, req.user.id);
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Failed to delete user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
