const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

const router = express.Router();

const isValidPercentage = (value) => {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 && num <= 100;
};

const normalizeOptionalDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const hasInvalidEffectiveWindow = (effectiveFrom, effectiveTo) => {
  if (!effectiveFrom || !effectiveTo) return false;
  return new Date(effectiveFrom) > new Date(effectiveTo);
};

const userExists = async (client, userId) => {
  const result = await client.query(
    `
      SELECT 1
      FROM users
      WHERE id = $1
        AND is_deleted = false
      LIMIT 1
    `,
    [userId]
  );

  return result.rows.length > 0;
};

const hasCycle = async (client, childUserId, parentUserId, excludeId = null) => {
  const params = [parentUserId, childUserId, excludeId || null];

  const result = await client.query(
    `
      WITH RECURSIVE ancestors AS (
        SELECT h.parent_user_id, ARRAY[h.child_user_id, h.parent_user_id]::int[] AS path
        FROM collaborator_hierarchy h
        WHERE h.child_user_id = $1
          AND h.is_deleted = false
          AND h.is_active = true
          AND ($3::int IS NULL OR h.id <> $3)

        UNION ALL

        SELECT h2.parent_user_id, a.path || h2.parent_user_id
        FROM collaborator_hierarchy h2
        JOIN ancestors a ON a.parent_user_id = h2.child_user_id
        WHERE h2.is_deleted = false
          AND h2.is_active = true
          AND ($3::int IS NULL OR h2.id <> $3)
          AND NOT (h2.parent_user_id = ANY(a.path))
      )
      SELECT 1
      FROM ancestors
      WHERE parent_user_id = $2
      LIMIT 1
    `,
    params
  );

  return result.rows.length > 0;
};

const validateDuplicateRelationOverlap = async (
  client,
  childUserId,
  parentUserId,
  effectiveFrom,
  effectiveTo,
  excludeId = null
) => {
  const params = [childUserId, parentUserId, effectiveFrom || null, effectiveTo || null, excludeId || null];

  const result = await client.query(
    `
      SELECT 1
      FROM collaborator_hierarchy
      WHERE child_user_id = $1
        AND parent_user_id = $2
        AND is_deleted = false
        AND ($5::int IS NULL OR id <> $5)
        AND (
          (COALESCE($3::timestamptz, '-infinity'::timestamptz), COALESCE($4::timestamptz, 'infinity'::timestamptz))
            OVERLAPS
          (COALESCE(effective_from, '-infinity'::timestamptz), COALESCE(effective_to, 'infinity'::timestamptz))
        )
      LIMIT 1
    `,
    params
  );

  return result.rows.length > 0;
};

const validateShareLimit = async (client, childUserId, shareRatePercent, effectiveFrom, effectiveTo, excludeId = null) => {
  const params = [childUserId, effectiveFrom || null, effectiveTo || null];
  let exclusion = '';
  if (excludeId) {
    params.push(excludeId);
    exclusion = ` AND id <> $${params.length}`;
  }

  const result = await client.query(
    `
      SELECT COALESCE(SUM(share_rate_percent), 0) AS total_share
      FROM collaborator_hierarchy
      WHERE child_user_id = $1
        AND is_deleted = false
        AND is_active = true
        ${exclusion}
        AND (
          (COALESCE($2::timestamptz, '-infinity'::timestamptz), COALESCE($3::timestamptz, 'infinity'::timestamptz))
            OVERLAPS
          (COALESCE(effective_from, '-infinity'::timestamptz), COALESCE(effective_to, 'infinity'::timestamptz))
        )
    `,
    params
  );

  const existing = Number(result.rows[0]?.total_share || 0);
  return existing + Number(shareRatePercent) <= 100;
};

router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const childUserId = Number(req.query.child_user_id || 0);
    const params = [];
    let where = 'WHERE h.is_deleted = false';

    if (Number.isInteger(childUserId) && childUserId > 0) {
      params.push(childUserId);
      where += ` AND h.child_user_id = $${params.length}`;
    }

    const result = await pool.query(
      `
        SELECT h.*,
               cu.full_name AS child_full_name,
               cu.username AS child_username,
               pu.full_name AS parent_full_name,
               pu.username AS parent_username
        FROM collaborator_hierarchy h
        LEFT JOIN users cu ON cu.id = h.child_user_id
        LEFT JOIN users pu ON pu.id = h.parent_user_id
        ${where}
        ORDER BY h.id DESC
      `,
      params
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Get collaborator hierarchy error:', error);
    return res.status(500).json({ error: 'Failed to fetch collaborator hierarchy' });
  }
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  const {
    child_user_id,
    parent_user_id,
    share_rate_percent,
    effective_from,
    effective_to,
    is_active = true
  } = req.body;

  const childUserId = Number(child_user_id);
  const parentUserId = Number(parent_user_id);

  if (!Number.isInteger(childUserId) || !Number.isInteger(parentUserId) || childUserId <= 0 || parentUserId <= 0) {
    return res.status(400).json({ error: 'Invalid child_user_id or parent_user_id' });
  }

  if (childUserId === parentUserId) {
    return res.status(400).json({ error: 'child_user_id cannot equal parent_user_id' });
  }

  if (!isValidPercentage(share_rate_percent)) {
    return res.status(400).json({ error: 'share_rate_percent must be between 0 and 100' });
  }

  const normalizedEffectiveFrom = normalizeOptionalDate(effective_from);
  const normalizedEffectiveTo = normalizeOptionalDate(effective_to);
  if (hasInvalidEffectiveWindow(normalizedEffectiveFrom, normalizedEffectiveTo)) {
    return res.status(400).json({ error: 'effective_from must be before or equal to effective_to' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const [childExists, parentExists] = await Promise.all([
      userExists(client, childUserId),
      userExists(client, parentUserId)
    ]);

    if (!childExists || !parentExists) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'child_user_id or parent_user_id does not exist' });
    }

    const cycle = await hasCycle(client, childUserId, parentUserId);
    if (cycle) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Hierarchy would create a cycle' });
    }

    const hasDuplicate = await validateDuplicateRelationOverlap(
      client,
      childUserId,
      parentUserId,
      normalizedEffectiveFrom,
      normalizedEffectiveTo
    );

    if (hasDuplicate) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Duplicate child-parent relation in overlapping effective window' });
    }

    const withinLimit = await validateShareLimit(
      client,
      childUserId,
      share_rate_percent,
      normalizedEffectiveFrom,
      normalizedEffectiveTo
    );

    if (!withinLimit) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Total share rate for child exceeds 100% in the same effective window' });
    }

    const result = await client.query(
      `
        INSERT INTO collaborator_hierarchy (
          child_user_id, parent_user_id, share_rate_percent,
          effective_from, effective_to, is_active,
          inserted_by, updated_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
        RETURNING *
      `,
      [
        childUserId,
        parentUserId,
        Number(share_rate_percent),
        normalizedEffectiveFrom,
        normalizedEffectiveTo,
        Boolean(is_active),
        req.user.id
      ]
    );

    await client.query('COMMIT');
    const created = result.rows[0];
    // Lấy tên users để ghi log
    const namesResult = await pool.query(
      'SELECT id, username, full_name FROM users WHERE id IN ($1, $2)',
      [childUserId, parentUserId]
    );
    const userMap = {};
    namesResult.rows.forEach(u => { userMap[u.id] = u.full_name || u.username || `User#${u.id}`; });
    const childName = userMap[childUserId] || `User#${childUserId}`;
    const parentName = userMap[parentUserId] || `User#${parentUserId}`;
    await logActivity('CREATE', 'collaborator_hierarchy', created.id, `Tạo phân cấp cộng tác: "${childName}" → "${parentName}" (${Number(created.share_rate_percent)}%)`, req.user.id);
    return res.status(201).json(created);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create collaborator hierarchy error:', error);
    return res.status(500).json({ error: 'Failed to create collaborator hierarchy' });
  } finally {
    client.release();
  }
});

router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid hierarchy id' });
  }

  const {
    parent_user_id,
    share_rate_percent,
    effective_from,
    effective_to,
    is_active
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `
        SELECT *
        FROM collaborator_hierarchy
        WHERE id = $1
          AND is_deleted = false
        LIMIT 1
      `,
      [id]
    );

    if (currentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Hierarchy entry not found' });
    }

    const current = currentResult.rows[0];
    const nextParentUserId = parent_user_id !== undefined ? Number(parent_user_id) : Number(current.parent_user_id);
    const nextShareRate = share_rate_percent !== undefined ? Number(share_rate_percent) : Number(current.share_rate_percent);
    const nextEffectiveFrom = effective_from !== undefined ? normalizeOptionalDate(effective_from) : current.effective_from;
    const nextEffectiveTo = effective_to !== undefined ? normalizeOptionalDate(effective_to) : current.effective_to;
    const nextIsActive = is_active !== undefined ? Boolean(is_active) : Boolean(current.is_active);

    if (!Number.isInteger(nextParentUserId) || nextParentUserId <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid parent_user_id' });
    }

    if (Number(current.child_user_id) === nextParentUserId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'child_user_id cannot equal parent_user_id' });
    }

    if (!isValidPercentage(nextShareRate)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'share_rate_percent must be between 0 and 100' });
    }

    if (hasInvalidEffectiveWindow(nextEffectiveFrom, nextEffectiveTo)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'effective_from must be before or equal to effective_to' });
    }

    const parentExists = await userExists(client, nextParentUserId);
    if (!parentExists) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'parent_user_id does not exist' });
    }

    const cycle = await hasCycle(client, Number(current.child_user_id), nextParentUserId, id);
    if (cycle) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Hierarchy would create a cycle' });
    }

    const hasDuplicate = await validateDuplicateRelationOverlap(
      client,
      Number(current.child_user_id),
      nextParentUserId,
      nextEffectiveFrom,
      nextEffectiveTo,
      id
    );

    if (hasDuplicate) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Duplicate child-parent relation in overlapping effective window' });
    }

    if (nextIsActive) {
      const withinLimit = await validateShareLimit(
        client,
        Number(current.child_user_id),
        nextShareRate,
        nextEffectiveFrom,
        nextEffectiveTo,
        id
      );

      if (!withinLimit) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Total share rate for child exceeds 100% in the same effective window' });
      }
    }

    const updated = await client.query(
      `
        UPDATE collaborator_hierarchy
        SET parent_user_id = $2,
            share_rate_percent = $3,
            effective_from = $4,
            effective_to = $5,
            is_active = $6,
            updated_at = NOW(),
            updated_by = $7
        WHERE id = $1
        RETURNING *
      `,
      [id, nextParentUserId, nextShareRate, nextEffectiveFrom, nextEffectiveTo, nextIsActive, req.user.id]
    );

    await client.query('COMMIT');

    // Build old→new changes description
    const changes = [];
    if (Number(current.parent_user_id) !== nextParentUserId) changes.push(`Cấp trên: #${current.parent_user_id} → #${nextParentUserId}`);
    if (Number(current.share_rate_percent) !== nextShareRate) changes.push(`Tỷ lệ chia sẻ: ${Number(current.share_rate_percent)}% → ${nextShareRate}%`);
    if (String(current.effective_from || '') !== String(nextEffectiveFrom || '')) changes.push(`Hiệu lực từ: "${current.effective_from || 'không có'}" → "${nextEffectiveFrom || 'không có'}"`);
    if (String(current.effective_to || '') !== String(nextEffectiveTo || '')) changes.push(`Hiệu lực đến: "${current.effective_to || 'không có'}" → "${nextEffectiveTo || 'không có'}"`);
    if (Boolean(current.is_active) !== nextIsActive) changes.push(`Kích hoạt: ${current.is_active ? 'Có' : 'Không'} → ${nextIsActive ? 'Có' : 'Không'}`);

    const desc = changes.length > 0
      ? `Cập nhật phân cấp cộng tác #${id}: ${changes.join(', ')}`
      : `Cập nhật phân cấp cộng tác #${id}`;

    await logActivity('UPDATE', 'collaborator_hierarchy', id, desc, req.user.id);
    return res.json(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update collaborator hierarchy error:', error);
    return res.status(500).json({ error: 'Failed to update collaborator hierarchy' });
  } finally {
    client.release();
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid hierarchy id' });
  }

  try {
    const result = await pool.query(
      `
        UPDATE collaborator_hierarchy
        SET is_deleted = true,
            is_active = false,
            updated_at = NOW(),
            updated_by = $2
        WHERE id = $1
          AND is_deleted = false
        RETURNING id
      `,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Hierarchy entry not found' });
    }

    await logActivity('DELETE', 'collaborator_hierarchy', id, `Xóa phân cấp cộng tác #${id}`, req.user.id);
    return res.json({ message: 'Hierarchy entry deleted' });
  } catch (error) {
    console.error('Delete collaborator hierarchy error:', error);
    return res.status(500).json({ error: 'Failed to delete collaborator hierarchy' });
  }
});

module.exports = router;
