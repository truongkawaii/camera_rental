const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

router.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(`SELECT u.id,u.username,u.full_name,COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL),'{}') AS roles,
      (a.user_id IS NOT NULL) AS allowed
      FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id AND ur.is_deleted=false
      LEFT JOIN roles r ON r.id=ur.role_id LEFT JOIN pb_user_access a ON a.user_id=u.id
      WHERE u.is_deleted=false GROUP BY u.id,a.user_id
      HAVING BOOL_OR(r.name IN ('admin','saler','camera_manager','driver','investor'))
      ORDER BY u.full_name NULLS LAST,u.username`);
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.put('/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.allowed !== 'boolean') return res.status(400).json({ error: 'Quyền truy cập không hợp lệ.' });
  try {
    const target = await pool.query(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id AND ur.is_deleted=false
      JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 AND u.is_deleted=false AND r.name IN ('saler','camera_manager','driver','investor') LIMIT 1`, [id]);
    if (!target.rowCount) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
    if (req.body.allowed) await pool.query(`INSERT INTO pb_user_access(user_id,granted_by) VALUES($1,$2)
      ON CONFLICT(user_id) DO UPDATE SET granted_by=EXCLUDED.granted_by,granted_at=NOW()`, [id, req.user.id]);
    else await pool.query('DELETE FROM pb_user_access WHERE user_id=$1', [id]);
    res.json({ id, allowed: req.body.allowed });
  } catch (error) { next(error); }
});

module.exports = router;
