// routes/equipment.js
const express = require('express');
const { pool } = require('../utils/db');
const { logActivity } = require('../utils/logger');
const { authenticate, requireAdmin, requireAdminOrManager, hasRole } = require('../middleware/auth');
const {
  ImageServiceError,
  normalizeImagePayload,
  replaceEntityImages,
  softDeleteEntityImages
} = require('../utils/imageService');

const router = express.Router();

const isInvestorOnly = (user) => hasRole(user, 'investor') && !hasRole(user, 'admin', 'camera_manager');
const isDriverOnly = (user) => hasRole(user, 'driver') && !hasRole(user, 'admin', 'camera_manager', 'investor', 'saler');

// GET equipment list with optional date filter and month stats filter
router.get('/', authenticate, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const { start_date, start_period, end_date, end_period, month, sortBy, sortOrder, search, availabilityStatus, asOf, owner_id, branch_id, model, brand } = req.query;

  try {
    let params = [];
    const driverOnly = isDriverOnly(req.user);
    
    // Month filter for subqueries
    let monthFilter = '';
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      params.push(month);
      monthFilter = ` AND to_char(r.start_date, 'YYYY-MM') = $${params.length}`;
    }

    // Search term
    let searchIdx = null;
    if (search) {
      params.push(`%${search}%`);
      searchIdx = params.length;
    }

    // Base WHERE for equipment (is_deleted and availability)
    const isAdmin = hasRole(req.user, 'admin');
    const isSaler = hasRole(req.user, 'saler');
    const isDriver = hasRole(req.user, 'driver');
    const investorOnly = isInvestorOnly(req.user);
    const branchIds = req.user.branch_ids || [];
    let baseWhere = 'WHERE e.is_deleted = false';
    if (investorOnly) {
      params.push(req.user.id);
      baseWhere += ` AND e.owner_id = $${params.length}`;
    } else if (!isAdmin && !isSaler && !isDriver) {
      params.push(branchIds.length > 0 ? branchIds : [-1]);
      baseWhere += ` AND e.branch_id = ANY($${params.length})`;
    }

    // Optional owner_id filter (admin / camera_manager only)
    if (owner_id && isAdmin) {
      params.push(parseInt(owner_id));
      baseWhere += ` AND e.owner_id = $${params.length}`;
    }

    // Optional branch_id filter (admin / camera_manager only)
    if (branch_id && isAdmin) {
      params.push(parseInt(branch_id));
      baseWhere += ` AND e.branch_id = $${params.length}`;
    }

    // Optional model filter
    if (model) {
      params.push(model.trim());
      baseWhere += ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(e.model), ''), TRIM(e.name)))) = LOWER($${params.length})`;
    }

    // Optional brand filter
    if (brand) {
      params.push(brand);
      baseWhere += ` AND e.brand = $${params.length}`;
    }

    if (start_date && end_date) {
      const { getDateTimeForPeriod } = require('../utils/dateHelpers');
      const mappedStart = getDateTimeForPeriod(start_date, start_period || 'sáng');
      const mappedEnd = getDateTimeForPeriod(end_date, end_period || 'chiều');

      params.push(mappedEnd, mappedStart);
      const endIdx = params.length - 1;
      const startIdx = params.length;

      baseWhere += `
        AND e.id NOT IN (
          SELECT equipment_id FROM rentals
          WHERE is_deleted = false
            AND status NOT IN ('cancelled', 'completed')
            AND (start_date < $${endIdx} AND end_date > $${startIdx})
        )
      `;
    }

    if (availabilityStatus === 'active' || availabilityStatus === 'available') {
      const parsedAsOf = asOf ? new Date(`${asOf}T23:59:59.999+07:00`) : null;
      const asOfIso = parsedAsOf && !Number.isNaN(parsedAsOf.getTime())
        ? parsedAsOf.toISOString()
        : new Date().toISOString();

      params.push(asOfIso);
      const asOfIdx = params.length;
      const activeRentalClause = `
        EXISTS (
          SELECT 1
          FROM rentals r
          WHERE r.equipment_id = e.id
            AND r.is_deleted = false
            AND r.inserted_at <= $${asOfIdx}
            AND r.status != 'cancelled'
            AND COALESCE(r.picked_up_at, r.pickup_time, r.start_date) <= $${asOfIdx}
            AND (
              r.status = 'active'
              OR (r.status = 'completed' AND COALESCE(r.returned_at, r.return_time, r.end_date) > $${asOfIdx})
            )
        )
      `;

      baseWhere += availabilityStatus === 'active'
        ? ` AND ${activeRentalClause}`
        : ` AND NOT ${activeRentalClause}`;
    }

    // CTE for computing stats
    const cte = `
      WITH equipment_stats AS (
        SELECT 
          e.id, e.name, e.category, e.brand, e.model, e.price_per_day, e.price_per_session, e.price_per_day_discount, e.discount_day_threshold, e.code,
          e.condition, e.purchase_date, e.inserted_at, e.branch_id, e.owner_id, e.current_branch_id,
          b.name as branch_name,
          owner.full_name as owner_name,
          owner.username as owner_username,
          COALESCE(
            (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
             FROM (
               SELECT id, sort_order, is_primary, COALESCE(secure_url, image_url) as url
               FROM entity_images
               WHERE entity_type = 'equipment' AND entity_id = e.id AND is_deleted = false AND provider NOT IN ('local')
             ) img),
            '[]'::json
          ) as images,
          EXISTS(
            SELECT 1 FROM equipment_maintenance em 
            WHERE em.equipment_id = e.id AND em.is_deleted = false 
              AND em.status = 'Đang bảo trì' 
              AND em.maintenance_date <= NOW() 
              AND (em.completed_date IS NULL OR em.completed_date >= NOW())
          ) as is_under_maintenance,
          (SELECT COUNT(*) FROM rentals r WHERE r.equipment_id = e.id AND r.is_deleted = false AND r.status != 'cancelled'${monthFilter}) as rental_count,
          (SELECT COALESCE(SUM(r.total_price), 0) FROM rentals r WHERE r.equipment_id = e.id AND r.is_deleted = false AND r.status != 'cancelled'${monthFilter}) as total_sales,
          (SELECT COALESCE(SUM(r.total_price), 0) FROM rentals r WHERE r.equipment_id = e.id AND r.is_deleted = false AND r.status = 'completed'${monthFilter}) as total_revenue,
          (SELECT COUNT(*) FROM rentals r WHERE r.is_deleted = false AND r.status != 'cancelled'${monthFilter}) as total_rentals
        FROM equipment e
        LEFT JOIN branches b ON e.branch_id = b.id
        LEFT JOIN users owner ON e.owner_id = owner.id
        ${baseWhere}
      )
    `;

    // Final WHERE for search across all fields (including computed)
    let finalWhere = '';
    if (searchIdx) {
      finalWhere = `WHERE name ILIKE $${searchIdx} OR code ILIKE $${searchIdx} OR category ILIKE $${searchIdx} OR brand ILIKE $${searchIdx} OR model ILIKE $${searchIdx} OR price_per_day::text ILIKE $${searchIdx} OR total_sales::text ILIKE $${searchIdx} OR total_revenue::text ILIKE $${searchIdx}`;
    }

    // Total Count
    const countResult = await pool.query(`${cte} SELECT COUNT(*) FROM equipment_stats ${finalWhere}`, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Determine ordering
    let orderClause = 'ORDER BY name ASC';
    const validSortCols = {
      name: 'name',
      brand: 'brand',
      model: 'model',
      price: 'price_per_day',
      rentals: 'rental_count',
      sales: 'total_sales',
      revenue: 'total_revenue',
      category: 'category',
      branch: 'branch_name',
      owner: 'owner_name',
      code: 'code',
      discount_price: 'price_per_day_discount'
    };
    
    if (sortBy && validSortCols[sortBy]) {
      const dir = (sortOrder || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      orderClause = `ORDER BY ${validSortCols[sortBy]} ${dir}${sortBy !== 'name' ? ', name ASC' : ''}`;
    }

    // Paging
    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const query = `${cte} SELECT * FROM equipment_stats ${finalWhere} ${orderClause} LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const result = await pool.query(query, params);
    const data = driverOnly
      ? result.rows.map(({ rental_count, total_sales, total_revenue, total_rentals, ...item }) => item)
      : result.rows;

    res.json({
      data,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Fetch equipment error:', error);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
});


// ── Lightweight paginated equipment list for calendar view (no heavy stats) ──
router.get('/calendar', authenticate, async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const rawLimit = parseInt(req.query.limit, 10) || 7;
  const limit = Math.min(Math.max(rawLimit, 1), 100);
  const offset = (page - 1) * limit;
  const { branch_id, model, sortBy, sortOrder } = req.query;

  try {
    const params = [];
    const isAdmin = hasRole(req.user, 'admin');
    const isSaler = hasRole(req.user, 'saler');
    const isDriver = hasRole(req.user, 'driver');
    const investorOnly = isInvestorOnly(req.user);
    const branchIds = req.user.branch_ids || [];

    let whereClause = 'WHERE e.is_deleted = false';

    if (investorOnly) {
      params.push(req.user.id);
      whereClause += ` AND e.owner_id = $${params.length}`;
    } else if (!isAdmin && !isSaler && !isDriver) {
      params.push(branchIds.length > 0 ? branchIds : [-1]);
      whereClause += ` AND e.branch_id = ANY($${params.length})`;
    }

    // branch_id filter (comma-separated, skip if ALL)
    if (branch_id && branch_id !== 'ALL') {
      const ids = branch_id.split(',').map(Number).filter(n => !Number.isNaN(n));
      if (ids.length > 0) {
        params.push(ids);
        whereClause += ` AND e.branch_id = ANY($${params.length})`;
      }
    }

    // model filter (comma-separated, skip if ALL)
    if (model && model !== 'ALL') {
      const models = model.split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
      if (models.length > 0) {
        params.push(models);
        whereClause += ` AND LOWER(TRIM(COALESCE(NULLIF(TRIM(e.model), ''), TRIM(e.name)))) = ANY($${params.length})`;
      }
    }

    // ── Total count ──
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM equipment e ${whereClause}`,
      params
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // ── Sorting ──
    const validSortCols = { name: 'e.name', code: 'e.code', model: 'e.model', brand: 'e.brand' };
    const sortCol = validSortCols[sortBy] || 'e.code';
    const sortDir = (sortOrder || '').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const orderClause = `ORDER BY ${sortCol} ${sortDir}`;

    // ── Data query ──
    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const result = await pool.query(
      `SELECT e.id, e.name, e.code, e.model, e.brand, e.condition,
              e.category,
              e.branch_id, b.name as branch_name,
              e.current_branch_id, cb.name as current_branch_name,
              e.price_per_day, e.price_per_session,
              e.price_per_day_discount, e.discount_day_threshold,
              e.owner_id,
              COALESCE(
                (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
                 FROM (
                   SELECT COALESCE(secure_url, image_url) as url,
                          is_primary, sort_order, id
                   FROM entity_images
                   WHERE entity_type = 'equipment'
                     AND entity_id = e.id
                     AND is_deleted = false AND provider NOT IN ('local')
                 ) img),
                '[]'::json
              ) as images
       FROM equipment e
       LEFT JOIN branches b ON e.branch_id = b.id
       LEFT JOIN branches cb ON e.current_branch_id = cb.id
       ${whereClause}
       ${orderClause}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    res.json({
      data: result.rows,
      totalCount,
      page,
      limit
    });
  } catch (error) {
    console.error('Fetch calendar equipment error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar equipment' });
  }
});


// Public equipment list for user-facing pages
router.get('/public', async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const rawLimit = parseInt(req.query.limit, 10) || 12;
  const limit = Math.min(Math.max(rawLimit, 1), 50);
  const offset = (page - 1) * limit;
  const { search, category, sortBy, sortOrder } = req.query;

  try {
    const params = [];
    const filters = ["e.is_deleted = false", "COALESCE(e.condition, '') != 'maintenance'"];

    if (search) {
      params.push(`%${search}%`);
      filters.push(`(
        e.name ILIKE $${params.length}
        OR e.category ILIKE $${params.length}
        OR e.brand ILIKE $${params.length}
        OR e.model ILIKE $${params.length}
      )`);
    }

    if (category) {
      params.push(category);
      filters.push(`e.category = $${params.length}`);
    }

    const whereClause = `WHERE ${filters.join(' AND ')}`;
    const cte = `
      WITH public_equipment AS (
        SELECT
          e.id,
          e.name,
          e.category,
          e.brand,
          e.model,
          e.price_per_day,
          e.price_per_session,
          e.price_per_day_discount,
          e.discount_day_threshold,
          e.condition,
          COALESCE(
            (SELECT json_agg(img.url ORDER BY img.is_primary DESC, img.sort_order ASC, img.id ASC)
             FROM (
               SELECT id, sort_order, is_primary, COALESCE(secure_url, image_url) as url
               FROM entity_images
               WHERE entity_type = 'equipment' AND entity_id = e.id AND is_deleted = false AND provider NOT IN ('local')
             ) img),
            '[]'::json
          ) as images,
          (SELECT COUNT(*)
           FROM rentals r
           WHERE r.equipment_id = e.id
             AND r.is_deleted = false
             AND r.status = 'completed')::integer as rental_count
        FROM equipment e
        ${whereClause}
      )
    `;

    const countResult = await pool.query(`${cte} SELECT COUNT(*) FROM public_equipment`, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    const validSortCols = {
      name: 'name',
      price: 'price_per_day',
      popular: 'rental_count',
      category: 'category'
    };
    const sortCol = validSortCols[sortBy] || 'rental_count';
    const sortDir = (sortOrder || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderClause = `ORDER BY ${sortCol} ${sortDir}, name ASC`;

    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const result = await pool.query(
      `${cte}
       SELECT
         id,
         name,
         category,
         brand,
         model,
         price_per_day,
         price_per_session,
         price_per_day_discount,
         discount_day_threshold,
         condition,
         images,
         images->>0 as image,
         rental_count
       FROM public_equipment
       ${orderClause}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

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
    console.error('Fetch public equipment list error:', error);
    res.status(500).json({ error: 'Failed to fetch public equipment list' });
  }
});


// Create equipment (admin only)
router.post('/', authenticate, requireAdminOrManager, async (req, res) => {
  const { name, category, brand, model, price_per_day, price_per_session, code, condition = 'good', branch_id, owner_id, price_per_day_discount, discount_day_threshold } = req.body;
  if (!name || !category || !price_per_day || !code) {
    return res.status(400).json({ error: 'Missing required fields: name, category, price_per_day, code' });
  }
  try {
    const finalOwnerId = isInvestorOnly(req.user) ? req.user.id : (owner_id || null);
    const result = await pool.query(
      `INSERT INTO equipment (name, category, brand, model, price_per_day, price_per_session, code, condition, branch_id, owner_id, price_per_day_discount, discount_day_threshold, inserted_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13) RETURNING *`,
      [name, category, brand || null, model || null, parseFloat(price_per_day), price_per_session ? parseFloat(price_per_session) : null, code, condition, branch_id || null, finalOwnerId, price_per_day_discount ? parseFloat(price_per_day_discount) : null, discount_day_threshold ? parseInt(discount_day_threshold) : null, req.user.id]
    );
    const eq = result.rows[0];
    await logActivity('CREATE', 'equipment', eq.id, `Thêm thiết bị "${eq.name}" (${eq.category}) với mã ${eq.code}`, req.user.id);
    res.status(201).json(eq);
  } catch (error) {
    console.error('Equipment creation error:', error);
    res.status(500).json({ error: 'Failed to create equipment', details: error.message });
  }
});

// Update equipment (admin only)
router.put('/:id', authenticate, requireAdminOrManager, async (req, res) => {
  const { id } = req.params;
  const { name, category, brand, model, price_per_day, price_per_session, code, condition, branch_id, owner_id, price_per_day_discount, discount_day_threshold } = req.body;
  if (!name || !category || !price_per_day || !code) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const oldResult = await pool.query('SELECT * FROM equipment WHERE id=$1 AND is_deleted = false', [id]);
    if (oldResult.rows.length === 0) return res.status(404).json({ error: 'Equipment not found' });
    const old = oldResult.rows[0];
    if (isInvestorOnly(req.user) && Number(old.owner_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Bạn chỉ có quyền chỉnh sửa thiết bị thuộc sở hữu của mình.' });
    }

    const finalOwnerId = isInvestorOnly(req.user) ? req.user.id : (owner_id || null);
    const result = await pool.query(
      `UPDATE equipment
         SET name=$1, category=$2, brand=$3, model=$4, price_per_day=$5, price_per_session=$6, code=$7, condition=$8, branch_id=$9, owner_id=$10, price_per_day_discount=$11, discount_day_threshold=$12, updated_at=NOW(), updated_by=$13
         WHERE id=$14 RETURNING *`,
      [name, category, brand || null, model || null, parseFloat(price_per_day), price_per_session ? parseFloat(price_per_session) : null, code, condition, branch_id || null, finalOwnerId, price_per_day_discount ? parseFloat(price_per_day_discount) : null, discount_day_threshold ? parseInt(discount_day_threshold) : null, req.user.id, id]
    );
    const eq = result.rows[0];
    // Fetch names for branch log
    const oldBranchRes = await pool.query('SELECT name FROM branches WHERE id = $1', [old.branch_id]);
    const newBranchRes = await pool.query('SELECT name FROM branches WHERE id = $1', [branch_id]);
    const oldBranchName = oldBranchRes.rows[0]?.name || 'Không';
    const newBranchName = newBranchRes.rows[0]?.name || 'Không';
    const ownerIds = [old.owner_id, eq.owner_id].filter(Boolean);
    const ownerRes = ownerIds.length > 0
      ? await pool.query('SELECT id, username, full_name FROM users WHERE id = ANY($1)', [ownerIds])
      : { rows: [] };
    const ownersById = new Map(ownerRes.rows.map((user) => [Number(user.id), user.full_name || user.username]));

    const LABELS = { 
      name: 'Tên', category: 'Danh mục', price_per_day: 'Giá/ngày', price_per_session: 'Giá/buổi', 
      code: 'Mã TB', condition: 'Tình trạng', branch: 'Cơ sở',
      discount_price: 'Giá ưu đãi', discount_threshold: 'Ngưỡng ưu đãi',
      owner: 'Chủ sở hữu'
    };
    const changes = [];
    if (old.name !== eq.name) changes.push(`${LABELS.name}: "${old.name}" → "${eq.name}"`);
    if (old.category !== eq.category) changes.push(`${LABELS.category}: "${old.category}" → "${eq.category}"`);
    if (parseFloat(old.price_per_day) !== parseFloat(eq.price_per_day)) changes.push(`${LABELS.price_per_day}: ${Number(old.price_per_day).toLocaleString('vi-VN')} → ${Number(eq.price_per_day).toLocaleString('vi-VN')} VND`);
    if (parseFloat(old.price_per_session || 0) !== parseFloat(eq.price_per_session || 0)) changes.push(`${LABELS.price_per_session}: ${Number(old.price_per_session || 0).toLocaleString('vi-VN')} → ${Number(eq.price_per_session || 0).toLocaleString('vi-VN')} VND`);
    if (old.code !== eq.code) changes.push(`${LABELS.code}: ${old.code} → ${eq.code}`);
    if (old.condition !== eq.condition) changes.push(`${LABELS.condition}: "${old.condition}" → "${eq.condition}"`);
    if (old.branch_id !== eq.branch_id) changes.push(`${LABELS.branch}: "${oldBranchName}" → "${newBranchName}"`);
    if (Number(old.owner_id || 0) !== Number(eq.owner_id || 0)) changes.push(`${LABELS.owner}: "${ownersById.get(Number(old.owner_id)) || 'Không'}" → "${ownersById.get(Number(eq.owner_id)) || 'Không'}"`);
    if (parseFloat(old.price_per_day_discount || 0) !== parseFloat(eq.price_per_day_discount || 0)) changes.push(`${LABELS.discount_price}: ${Number(old.price_per_day_discount || 0).toLocaleString('vi-VN')} → ${Number(eq.price_per_day_discount || 0).toLocaleString('vi-VN')} VND`);
    if (parseInt(old.discount_day_threshold || 0) !== parseInt(eq.discount_day_threshold || 0)) changes.push(`${LABELS.discount_threshold}: ${old.discount_day_threshold || 0} → ${eq.discount_day_threshold || 0} ngày`);
    
    const desc = changes.length > 0
      ? `Cập nhật thiết bị "${eq.name}" (Mã: ${eq.code}): ${changes.join(', ')}`
      : `Cập nhật thiết bị "${eq.name}" (Mã: ${eq.code})`;
    await logActivity('UPDATE', 'equipment', eq.id, desc, req.user.id);
    res.json(eq);
  } catch (error) {
    console.error('Equipment update error:', error);
    res.status(500).json({ error: 'Failed to update equipment', details: error.message });
  }
});

// Delete equipment (admin only)
router.delete('/:id', authenticate, requireAdminOrManager, async (req, res) => {
  const { id } = req.params;
  try {
    if (isInvestorOnly(req.user)) {
      const ownerCheck = await pool.query('SELECT owner_id FROM equipment WHERE id=$1 AND is_deleted = false', [id]);
      if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Equipment not found' });
      if (Number(ownerCheck.rows[0].owner_id) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Bạn chỉ có quyền xóa thiết bị thuộc sở hữu của mình.' });
      }
    }

    // Check for active references before soft delete
    const checkRefs = await pool.query(`
      SELECT COUNT(*) as rental_count FROM rentals WHERE equipment_id = $1 AND is_deleted = false
    `, [id]);
    
    if (parseInt(checkRefs.rows[0].rental_count) > 0) {
      return res.status(400).json({ 
        error: 'Không thể xóa thiết bị này vì đang có đơn thuê liên kết.',
        details: { rentals: checkRefs.rows[0].rental_count }
      });
    }

    const result = await pool.query('UPDATE equipment SET is_deleted = true, updated_at = NOW(), updated_by = $1 WHERE id=$2 RETURNING id, name, code', [req.user.id, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Equipment not found' });
    await softDeleteEntityImages(pool, 'equipment', id, req.user.id);
    await logActivity('DELETE', 'equipment', result.rows[0].id, `Xóa thiết bị "${result.rows[0].name}" (Mã: ${result.rows[0].code})`, req.user.id);
    res.json({ message: 'Equipment deleted', id: result.rows[0].id });
  } catch (error) {
    console.error('Equipment delete error:', error);
    res.status(500).json({ error: 'Failed to delete equipment', details: error.message });
  }
});

// Image upload (admin only)
router.post('/:id/upload-image', authenticate, requireAdminOrManager, async (req, res) => {
  const { id } = req.params;
  try {
    const equipmentResult = await pool.query('SELECT id, owner_id FROM equipment WHERE id=$1 AND is_deleted = false', [id]);
    if (equipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Equipment not found' });
    }
    if (isInvestorOnly(req.user) && Number(equipmentResult.rows[0].owner_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Bạn chỉ có quyền cập nhật ảnh thiết bị thuộc sở hữu của mình.' });
    }
    const imageInputs = normalizeImagePayload(req.body);
    if (imageInputs.length === 0) {
      await softDeleteEntityImages(pool, 'equipment', id, req.user.id);
      const result = await pool.query('UPDATE equipment SET updated_at=NOW(), updated_by=$1 WHERE id=$2 RETURNING id, name, code', [req.user.id, id]);
      await logActivity('UPDATE', 'equipment', id, `Xóa hình ảnh thiết bị "${result.rows[0].name}" (Mã: ${result.rows[0].code})`, req.user.id);
      return res.json({ message: 'Images cleared successfully', equipment_id: id, images: [] });
    }
    const savedImages = await replaceEntityImages(pool, 'equipment', id, imageInputs, req.user.id);
    const result = await pool.query('UPDATE equipment SET updated_at=NOW(), updated_by=$1 WHERE id=$2 RETURNING id, name, code', [req.user.id, id]);
    await logActivity('UPDATE', 'equipment', id, `Cập nhật hình ảnh thiết bị "${result.rows[0].name}" (Mã: ${result.rows[0].code})`, req.user.id);
    res.json({ message: 'Images uploaded successfully', equipment_id: id, images: savedImages.map((image) => image.secure_url || image.image_url) });
  } catch (error) {
    if (error instanceof ImageServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to upload images', details: error.message });
  }
});

// GET distinct equipment models for filter dropdown
router.get('/models', authenticate, async (req, res) => {
  try {
    const isAdmin = hasRole(req.user, 'admin');
    const isSaler = hasRole(req.user, 'saler');
    const isDriver = hasRole(req.user, 'driver');
    const investorOnly = isInvestorOnly(req.user);
    const branchIds = req.user.branch_ids || [];
    let conditions = 'e.is_deleted = false';
    const params = [];

    if (investorOnly) {
      params.push(req.user.id);
      conditions += ` AND e.owner_id = $${params.length}`;
    } else if (!isAdmin && !isSaler && !isDriver) {
      params.push(branchIds.length > 0 ? branchIds : [-1]);
      conditions += ` AND e.branch_id = ANY($${params.length})`;
    }

    const result = await pool.query(
      `SELECT DISTINCT TRIM(COALESCE(NULLIF(TRIM(e.model), ''), TRIM(e.name))) AS model
       FROM equipment e
       WHERE ${conditions}
       ORDER BY model ASC`,
      params
    );
    res.json({ data: result.rows.map(r => r.model).filter(Boolean) });
  } catch (error) {
    console.error('Fetch models error:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// GET distinct equipment brands for filter dropdown
router.get('/brands', authenticate, async (req, res) => {
  try {
    const isAdmin = hasRole(req.user, 'admin');
    const isSaler = hasRole(req.user, 'saler');
    const isDriver = hasRole(req.user, 'driver');
    const investorOnly = isInvestorOnly(req.user);
    const branchIds = req.user.branch_ids || [];
    let conditions = 'e.is_deleted = false AND e.brand IS NOT NULL AND e.brand != \'\'';
    const params = [];

    if (investorOnly) {
      params.push(req.user.id);
      conditions += ` AND e.owner_id = $${params.length}`;
    } else if (!isAdmin && !isSaler && !isDriver) {
      params.push(branchIds.length > 0 ? branchIds : [-1]);
      conditions += ` AND e.branch_id = ANY($${params.length})`;
    }

    const result = await pool.query(
      `SELECT DISTINCT e.brand FROM equipment e WHERE ${conditions} ORDER BY e.brand ASC`,
      params
    );
    res.json({ data: result.rows.map(r => r.brand) });
  } catch (error) {
    console.error('Fetch brands error:', error);
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

// GET equipment ranking with rental counts, revenue and percentages
router.get('/ranking', authenticate, async (req, res) => {
  const { month } = req.query;

  try {
    let params = [];

    // Month filter
    let monthFilter = '';
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      params.push(month);
      monthFilter = ` AND to_char(r.start_date, 'YYYY-MM') = $${params.length}`;
    }

    // Exclude cancelled rentals
    const rentalStatusFilter = "r.is_deleted = false AND r.status != 'cancelled'";

    const query = `
      WITH model_ranking AS (
        SELECT
          LOWER(TRIM(COALESCE(NULLIF(TRIM(e.model), ''), TRIM(e.name)))) AS model_key,
          MAX(TRIM(COALESCE(NULLIF(TRIM(e.model), ''), TRIM(e.name)))) AS model,
          MAX(NULLIF(TRIM(e.brand), '')) AS brand,
          COUNT(*)::integer AS rental_count,
          COALESCE(SUM(r.total_price), 0)::numeric AS total_revenue
        FROM rentals r
        JOIN equipment e ON r.equipment_id = e.id AND e.is_deleted = false
        WHERE ${rentalStatusFilter}
          ${monthFilter}
        GROUP BY LOWER(TRIM(COALESCE(NULLIF(TRIM(e.model), ''), TRIM(e.name))))
      ),
      equipment_counts AS (
        SELECT
          LOWER(TRIM(COALESCE(NULLIF(TRIM(model), ''), TRIM(name)))) AS model_key,
          COUNT(*)::integer AS equipment_count
        FROM equipment
        WHERE is_deleted = false
        GROUP BY LOWER(TRIM(COALESCE(NULLIF(TRIM(model), ''), TRIM(name))))
      ),
      total_rentals AS (
        SELECT SUM(rental_count)::numeric AS grand_total FROM model_ranking
      )
      SELECT
        mr.model,
        mr.brand,
        mr.rental_count,
        mr.total_revenue,
        COALESCE(ec.equipment_count, 0) AS equipment_count,
        CASE
          WHEN tr.grand_total > 0
          THEN ROUND((mr.rental_count::numeric / tr.grand_total) * 100, 1)
          ELSE 0
        END AS percentage
      FROM model_ranking mr
      LEFT JOIN equipment_counts ec ON ec.model_key = mr.model_key, total_rentals tr
      WHERE mr.rental_count > 0
      ORDER BY mr.rental_count DESC, mr.total_revenue DESC
    `;

    const result = await pool.query(query, params);

    res.json({
      data: result.rows,
      meta: {
        total_rentals: result.rows.length > 0
          ? result.rows.reduce((sum, r) => sum + parseInt(r.rental_count), 0)
          : 0,
        month: month || null,
      }
    });
  } catch (error) {
    console.error('Fetch equipment ranking error:', error);
    res.status(500).json({ error: 'Failed to fetch equipment ranking' });
  }
});

module.exports = router;
