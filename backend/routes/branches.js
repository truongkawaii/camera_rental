// routes/branches.js
const express = require('express');
const { pool } = require('../utils/db');
const { logActivity } = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  ImageServiceError,
  normalizeImagePayload,
  replaceEntityImages,
  softDeleteEntityImages
} = require('../utils/imageService');

const router = express.Router();

// Get all branches (public)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        b.id, b.name, b.code, b.order_number, b.address, b.address_detail, b.phone, b.map_url, b.is_hidden, b.inserted_at, b.updated_at,
        COALESCE(
          (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
           FROM (
             SELECT id, sort_order, is_primary, COALESCE(secure_url, image_url) as url
             FROM entity_images
             WHERE entity_type = 'branches' AND entity_id = b.id AND is_deleted = false AND provider NOT IN ('local')
           ) img),
          '[]'::json
        ) as images
      FROM branches b
      WHERE b.is_deleted = false
      ORDER BY b.inserted_at ASC
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// Create branch (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { name, address, address_detail, phone, map_url } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO branches (name, address, address_detail, phone, map_url, order_number, inserted_by, updated_by) 
       VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(order_number), 0) + 1 FROM branches), $6, $6) 
       RETURNING *`,
      [name, address, address_detail, phone, map_url, req.user.id]
    );
    const newBranch = result.rows[0];
    const autoCode = `BR${String(newBranch.order_number).padStart(4, '0')}`;
    const updateRes = await pool.query('UPDATE branches SET code = $1 WHERE id = $2 RETURNING *', [autoCode, newBranch.id]);
    
    await logActivity('CREATE', 'branch', newBranch.id, `Thêm cơ sở "${name}" với mã ${autoCode}`, req.user.id);
    res.status(201).json(updateRes.rows[0]);
  } catch (error) {
    console.error('Create branch error:', error);
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

// Update branch (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, code, address, address_detail, phone, map_url, is_hidden } = req.body;
  try {
    const oldResult = await pool.query('SELECT * FROM branches WHERE id = $1', [id]);
    if (oldResult.rows.length === 0) return res.status(404).json({ error: 'Branch not found' });
    const old = oldResult.rows[0];

    const result = await pool.query(
      'UPDATE branches SET name=$1, code=$2, address=$3, address_detail=$4, phone=$5, map_url=$6, is_hidden=COALESCE($7, is_hidden), updated_at=NOW(), updated_by=$8 WHERE id=$9 RETURNING *',
      [name, code, address, address_detail, phone, map_url, is_hidden, req.user.id, id]
    );
    
    const changes = [];
    if (old.name !== name) changes.push(`Tên: "${old.name}" → "${name}"`);
    if (old.code !== code) changes.push(`Mã: "${old.code}" → "${code}"`);
    if (old.address !== address) changes.push(`Địa chỉ: "${old.address || ''}" → "${address || ''}"`);
    if (old.address_detail !== address_detail) changes.push(`Chi tiết ĐC: "${old.address_detail || ''}" → "${address_detail || ''}"`);
    if (old.phone !== phone) changes.push(`SĐT: "${old.phone || ''}" → "${phone || ''}"`);
    if (old.map_url !== map_url) changes.push(`Google Maps: "${old.map_url || ''}" → "${map_url || ''}"`);
    if (is_hidden !== undefined && old.is_hidden !== is_hidden) changes.push(is_hidden ? 'Đã ẩn cơ sở khỏi báo cáo' : 'Đã hiện cơ sở trên báo cáo');
    
    const desc = changes.length > 0 
      ? `Cập nhật cơ sở "${name}" (Mã: ${result.rows[0].code}): ${changes.join(', ')}`
      : `Cập nhật cơ sở "${name}" (Mã: ${result.rows[0].code})`;

    await logActivity('UPDATE', 'branch', id, desc, req.user.id);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update branch' });
  }
});

// Upload branch image (admin only)
router.post('/:id/upload-image', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const imageInputs = normalizeImagePayload(req.body);
    await replaceEntityImages(pool, 'branches', id, imageInputs, req.user.id);
    const result = await pool.query('UPDATE branches SET updated_at=NOW(), updated_by=$1 WHERE id=$2 RETURNING name, code', [req.user.id, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Branch not found' });
    await logActivity('UPDATE', 'branch', id, `Tải ảnh lên cho cơ sở "${result.rows[0].name}" (Mã: ${result.rows[0].code})`, req.user.id);
    res.json({ message: 'Branch image updated' });
  } catch (error) {
    if (error instanceof ImageServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to upload branch image' });
  }
});

// Delete branch (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const branchRes = await pool.query('SELECT name, code FROM branches WHERE id = $1', [id]);
    if (branchRes.rows.length === 0) return res.status(404).json({ error: 'Branch not found' });
    const { name, code } = branchRes.rows[0];

    // Check for active references before soft delete
    const checkRefs = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE branch_id = $1 AND is_deleted = false) as user_count,
        (SELECT COUNT(*) FROM equipment WHERE branch_id = $1 AND is_deleted = false) as equip_count,
        (SELECT COUNT(*) FROM rentals WHERE branch_id = $1 AND is_deleted = false) as rental_count
    `, [id]);
    
    const { user_count, equip_count, rental_count } = checkRefs.rows[0];
    if (parseInt(user_count) > 0 || parseInt(equip_count) > 0 || parseInt(rental_count) > 0) {
      return res.status(400).json({ 
        error: 'Không thể xóa cơ sở này vì đang có dữ liệu liên kết.',
        details: { users: user_count, equipment: equip_count, rentals: rental_count }
      });
    }

    await pool.query('UPDATE branches SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE id = $2', [req.user.id, id]);
    await softDeleteEntityImages(pool, 'branches', id, req.user.id);
    await logActivity('DELETE', 'branch', id, `Xóa cơ sở "${name}" (Mã: ${code})`, req.user.id);
    res.json({ message: 'Branch deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete branch' });
  }
});

module.exports = router;
