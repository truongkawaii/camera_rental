// routes/calendar.js
const express = require('express');
const { pool } = require('../utils/db');
const { authenticate, hasRole } = require('../middleware/auth');

const router = express.Router();
const isInvestorOnly = (user) => hasRole(user, 'investor') && !hasRole(user, 'admin', 'camera_manager');

// Equipment Calendar – GET /api/calendar/equipment/:id
router.get('/equipment/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        r.id, r.start_date, r.start_period, r.end_date, r.end_period, r.status,
        c.name as customer_name, false as is_maintenance
      FROM rentals r
      JOIN customers c ON r.customer_id = c.id AND c.is_deleted = false
      JOIN equipment e ON r.equipment_id = e.id AND e.is_deleted = false
      WHERE r.equipment_id = $1 
        AND r.is_deleted = false
        AND r.status != 'cancelled'
        ${isInvestorOnly(req.user) ? 'AND e.owner_id = $2' : ''}
      
      UNION ALL
      
      SELECT
        em.id, em.maintenance_date as start_date, 'sáng' as start_period,
        COALESCE(em.completed_date, em.maintenance_date) as end_date, 'tối' as end_period,
        em.status, em.provider as customer_name, true as is_maintenance
      FROM equipment_maintenance em
      JOIN equipment e ON em.equipment_id = e.id AND e.is_deleted = false
      WHERE em.equipment_id = $1
        AND em.is_deleted = false
        AND em.status IN ('Đã lên lịch', 'Đang bảo trì')
        ${isInvestorOnly(req.user) ? 'AND e.owner_id = $2' : ''}
      ORDER BY start_date ASC
    `, isInvestorOnly(req.user) ? [id, req.user.id] : [id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch equipment calendar:', error);
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

// Global Calendar – GET /api/calendar/rentals
router.get('/rentals', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.id, r.start_date, r.start_period, r.end_date, r.end_period, r.status, r.equipment_id,
        r.user_id, r.manager_id, r.handover_user_id, r.total_price, r.deposit_amount, r.paid_amount,
        r.pickup_time, r.return_time, r.code, r.order_number,
        c.name as customer_name, c.phone as customer_phone,
        e.name as equipment_name, e.code as equipment_code, e.category,
        e.current_branch_id,
        b.name as original_branch_name,
        cb.name as current_branch_name,
        pb.name as pickup_branch_name,
        rb.name as return_branch_name,
        COALESCE(u.full_name, u.username) as creator_name,
        COALESCE(m.full_name, m.username) as manager_name,
        false as is_maintenance,
        r.notes as maintenance_notes
      FROM rentals r
      JOIN customers c ON r.customer_id = c.id AND c.is_deleted = false
      JOIN equipment e ON r.equipment_id = e.id AND e.is_deleted = false
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users m ON r.manager_id = m.id
      LEFT JOIN branches b ON r.branch_id = b.id
      LEFT JOIN branches cb ON e.current_branch_id = cb.id
      LEFT JOIN branches pb ON r.pickup_branch_id = pb.id
      LEFT JOIN branches rb ON r.return_branch_id = rb.id
      WHERE r.is_deleted = false AND r.status != 'cancelled'
        ${isInvestorOnly(req.user) ? 'AND e.owner_id = $1' : ''}
      
      UNION ALL
      
      SELECT
        em.id, em.maintenance_date as start_date, 'sáng' as start_period, 
        COALESCE(em.completed_date, em.maintenance_date) as end_date, 'tối' as end_period,
        em.status, em.equipment_id,
        NULL as user_id, NULL as manager_id, NULL as handover_user_id, em.maintenance_cost as total_price, 0 as deposit_amount, 0 as paid_amount,
        NULL as pickup_time, NULL as return_time, 'BAO-TRI' as code, 0 as order_number,
        em.provider as customer_name, '' as customer_phone,
        e.name as equipment_name, e.code as equipment_code, e.category,
        e.current_branch_id,
        '' as original_branch_name,
        cb.name as current_branch_name,
        '' as pickup_branch_name,
        '' as return_branch_name,
        '' as creator_name,
        '' as manager_name,
        true as is_maintenance,
        em.notes as maintenance_notes
      FROM equipment_maintenance em
      JOIN equipment e ON em.equipment_id = e.id AND e.is_deleted = false
      LEFT JOIN branches cb ON e.current_branch_id = cb.id
      WHERE em.is_deleted = false AND em.status IN ('Đã lên lịch', 'Đang bảo trì')
        ${isInvestorOnly(req.user) ? 'AND e.owner_id = $1' : ''}
      ORDER BY start_date ASC
    `, isInvestorOnly(req.user) ? [req.user.id] : []);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch global calendar:', error);
    res.status(500).json({ error: 'Failed to fetch global calendar data' });
  }
});

module.exports = router;
