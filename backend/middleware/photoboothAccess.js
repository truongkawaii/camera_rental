const { pool } = require('../utils/db');
const { hasRole } = require('./auth');

async function requirePhotoboothAccess(req, res, next) {
  if (hasRole(req.user, 'admin')) return next();
  if (!['saler', 'camera_manager', 'driver'].some(role => hasRole(req.user, role))) return res.status(403).json({ error: 'Bạn chưa được cấp quyền truy cập Photobooth.' });
  if (!Number.isSafeInteger(Number(req.user?.id))) return res.status(403).json({ error: 'Bạn chưa được cấp quyền truy cập Photobooth.' });
  try {
    const result = await pool.query(`SELECT 1 FROM pb_user_access a JOIN users u ON u.id=a.user_id
      WHERE a.user_id=$1 AND u.is_deleted=false`, [req.user.id]);
    if (!result.rowCount) return res.status(403).json({ error: 'Bạn chưa được cấp quyền truy cập Photobooth.' });
    next();
  } catch (error) { next(error); }
}

module.exports = { requirePhotoboothAccess };
