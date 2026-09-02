// routes/images.js
const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, hasRole } = require('../middleware/auth');
const { getEntityImageUrls, ImageServiceError } = require('../utils/imageService');

const router = express.Router();
const isInvestorOnly = (user) => hasRole(user, 'investor') && !hasRole(user, 'admin', 'camera_manager');

/**
 * GET /api/images/:entity/:id
 * Fetches image URLs for a specific record.
 * entity: equipment, branches, customers, rentals
 */
router.get('/:entity/:id', authenticate, async (req, res) => {
  const { entity, id } = req.params;

  try {
    if (isInvestorOnly(req.user) && entity === 'equipment') {
      const ownerCheck = await pool.query(
        'SELECT owner_id FROM equipment WHERE id = $1 AND is_deleted = false',
        [id]
      );
      if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Equipment not found' });
      if (Number(ownerCheck.rows[0].owner_id) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Bạn chỉ có quyền xem ảnh thiết bị thuộc sở hữu của mình.' });
      }
    }

    if (isInvestorOnly(req.user) && entity === 'rentals') {
      const ownerCheck = await pool.query(`
        SELECT e.owner_id
        FROM rentals r
        JOIN equipment e ON r.equipment_id = e.id
        WHERE r.id = $1 AND r.is_deleted = false
      `, [id]);
      if (ownerCheck.rows.length === 0) return res.status(404).json({ error: 'Rental not found' });
      if (Number(ownerCheck.rows[0].owner_id) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'Bạn chỉ có quyền xem ảnh đơn thuê của thiết bị thuộc sở hữu của mình.' });
      }
    }

    const images = await getEntityImageUrls(pool, entity, id);
    res.json({ images });
  } catch (error) {
    if (error instanceof ImageServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error(`Fetch image error for ${entity} ${id}:`, error);
    res.status(500).json({ error: 'Failed to fetch image' });
  }
});

module.exports = router;
