// routes/customers.js
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

// List customers with pagination
router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || '';
  const filterStatus = req.query.filterStatus || 'all';
  const offset = (page - 1) * limit;

  try {
    let countQuery = 'SELECT COUNT(*) FROM customers WHERE is_deleted = false';
    let countParams = [];
    let countParamIndex = 1;

    if (search) {
      countQuery += ` AND (name ILIKE $${countParamIndex} OR phone ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }

    if (filterStatus === 'normal') {
      countQuery += ` AND NOT EXISTS (SELECT 1 FROM blacklist WHERE customer_id = customers.id AND is_deleted = false AND unblacklisted_at IS NULL)`;
    } else if (filterStatus === 'restricted') {
      countQuery += ` AND EXISTS (SELECT 1 FROM blacklist WHERE customer_id = customers.id AND is_deleted = false AND unblacklisted_at IS NULL)`;
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    let dataQuery = `
      SELECT 
        c.id, c.name, c.email, c.phone, c.inserted_at,
        COALESCE(
          (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
           FROM (
             SELECT id, sort_order, is_primary, COALESCE(secure_url, image_url) as url
             FROM entity_images
             WHERE entity_type = 'customers' AND entity_id = c.id AND is_deleted = false AND provider NOT IN ('local')
           ) img),
          '[]'::json
        ) as images,
        COUNT(r.id)::int as total_rentals,
        CASE WHEN EXISTS (
          SELECT 1 FROM blacklist WHERE customer_id = c.id AND is_deleted = false AND unblacklisted_at IS NULL
        ) THEN true ELSE false END as is_blacklisted,
        (SELECT reason FROM blacklist WHERE customer_id = c.id AND is_deleted = false AND unblacklisted_at IS NULL ORDER BY blacklisted_at DESC LIMIT 1) as blacklist_reason,
        (SELECT id FROM blacklist WHERE customer_id = c.id AND is_deleted = false AND unblacklisted_at IS NULL ORDER BY blacklisted_at DESC LIMIT 1) as blacklist_id,
        (SELECT blacklisted_at FROM blacklist WHERE customer_id = c.id AND is_deleted = false AND unblacklisted_at IS NULL ORDER BY blacklisted_at DESC LIMIT 1) as blacklisted_at
      FROM customers c
      LEFT JOIN rentals r ON c.id = r.customer_id AND r.is_deleted = false
      WHERE c.is_deleted = false
    `;
    
    let dataParams = [limit, offset];
    let dataParamIndex = 3;

    if (search) {
      dataQuery += ` AND (c.name ILIKE $${dataParamIndex} OR c.phone ILIKE $${dataParamIndex})`;
      dataParams.push(`%${search}%`);
      dataParamIndex++;
    }

    if (filterStatus === 'normal') {
      dataQuery += ` AND NOT EXISTS (SELECT 1 FROM blacklist WHERE customer_id = c.id AND is_deleted = false AND unblacklisted_at IS NULL)`;
    } else if (filterStatus === 'restricted') {
      dataQuery += ` AND EXISTS (SELECT 1 FROM blacklist WHERE customer_id = c.id AND is_deleted = false AND unblacklisted_at IS NULL)`;
    }

    dataQuery += `
      GROUP BY c.id
      ORDER BY c.inserted_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(dataQuery, dataParams);
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
    console.error('Fetch customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Create customer
router.post('/', authenticate, async (req, res) => {
  const { name, email, phone } = req.body;
  try {
    // Check for existing customer with same name and phone
    const checkExist = await pool.query(
      'SELECT id FROM customers WHERE name = $1 AND phone = $2 AND is_deleted = false',
      [name, phone]
    );
    if (checkExist.rows.length > 0) {
      return res.status(400).json({ error: 'Khách hàng với tên và số điện thoại này đã tồn tại.' });
    }

    const result = await pool.query(
      'INSERT INTO customers (name, email, phone, inserted_by, updated_by) VALUES ($1, $2, $3, $4, $4) RETURNING *',
      [name, email, phone, req.user.id]
    );
    const cust = result.rows[0];
    await logActivity('CREATE', 'customer', cust.id, `Thêm khách hàng "${cust.name}" (${cust.email} / ${cust.phone})`, req.user.id);
    res.status(201).json(cust);
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Update customer
router.put('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, email, phone } = req.body;
  try {
    // Check if name/phone combination already exists for DIFFERENT customer
    const checkExist = await pool.query(
      'SELECT id FROM customers WHERE name = $1 AND phone = $2 AND id <> $3 AND is_deleted = false',
      [name, phone, id]
    );
    if (checkExist.rows.length > 0) {
      return res.status(400).json({ error: 'Tên và số điện thoại này đã được sử dụng bởi một khách hàng khác.' });
    }

    const oldResult = await pool.query('SELECT * FROM customers WHERE id=$1 AND is_deleted = false', [id]);
    if (oldResult.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const old = oldResult.rows[0];

    const result = await pool.query(
      'UPDATE customers SET name=$1, email=$2, phone=$3, updated_at=NOW(), updated_by=$4 WHERE id=$5 AND is_deleted = false RETURNING *',
      [name, email, phone, req.user.id, id]
    );
    const cust = result.rows[0];

    const changes = [];
    if (old.name !== name) changes.push(`Tên: "${old.name}" → "${name}"`);
    if (old.email !== email) changes.push(`Email: "${old.email || ''}" → "${email || ''}"`);
    if (old.phone !== phone) changes.push(`SĐT: "${old.phone || ''}" → "${phone || ''}"`);

    const desc = changes.length > 0 
      ? `Cập nhật khách hàng "${cust.name}": ${changes.join(', ')}`
      : `Cập nhật khách hàng "${cust.name}"`;

    await logActivity('UPDATE', 'customer', id, desc, req.user.id);
    res.json(cust);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Upload customer image
router.post('/:id/upload-image', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const imageInputs = normalizeImagePayload(req.body);
    await replaceEntityImages(pool, 'customers', id, imageInputs, req.user.id);
    const result = await pool.query(
      'UPDATE customers SET updated_at=NOW(), updated_by=$1 WHERE id=$2 AND is_deleted = false RETURNING id, name',
      [req.user.id, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });

    await logActivity('UPDATE', 'customer', id, `Cập nhật hình ảnh khách hàng "${result.rows[0].name}"`, req.user.id);
    res.json({ message: 'Customer image updated' });
  } catch (error) {
    if (error instanceof ImageServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error('Customer image upload error:', error);
    res.status(500).json({ error: 'Failed to upload customer image' });
  }
});

// Delete customer (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // Check for active references before soft delete
    const checkRefs = await pool.query(`
      SELECT COUNT(*) as rental_count FROM rentals WHERE customer_id = $1 AND is_deleted = false
    `, [id]);
    
    if (parseInt(checkRefs.rows[0].rental_count) > 0) {
      return res.status(400).json({ 
        error: 'Không thể xóa khách hàng này vì đang có đơn thuê liên kết.',
        details: { rentals: checkRefs.rows[0].rental_count }
      });
    }

    const result = await pool.query('UPDATE customers SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE id = $2 RETURNING id, name', [req.user.id, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    await softDeleteEntityImages(pool, 'customers', id, req.user.id);
    await logActivity('DELETE', 'customer', result.rows[0].id, `Xóa khách hàng "${result.rows[0].name}" (ID #${result.rows[0].id})`, req.user.id);
    res.json({ message: 'Customer deleted', id: result.rows[0].id });
  } catch (error) {
    console.error('Customer delete error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

module.exports = router;
