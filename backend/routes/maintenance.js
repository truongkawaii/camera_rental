const express = require('express');
const { pool } = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

const router = express.Router();

// Get maintenance records
router.get('/', async (req, res) => {
  const { equipment_id } = req.query;
  
  try {
    let query = `
      SELECT em.*, e.name as equipment_name, e.code as equipment_code
      FROM equipment_maintenance em
      JOIN equipment e ON em.equipment_id = e.id
      WHERE em.is_deleted = false
    `;
    const params = [];
    
    if (equipment_id) {
      params.push(equipment_id);
      query += ` AND em.equipment_id = $${params.length}`;
    }
    
    query += ` ORDER BY em.inserted_at DESC`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Fetch maintenance error:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance records' });
  }
});

// Create maintenance record
router.post('/', authenticate, async (req, res) => {
  const { equipment_id, maintenance_type, description, maintenance_cost, maintenance_date, completed_date, status, provider, notes } = req.body;
  
  if (!equipment_id) return res.status(400).json({ error: 'Equipment ID is required' });
  
  try {
    const result = await pool.query(
      `INSERT INTO equipment_maintenance (
        equipment_id, maintenance_type, description, maintenance_cost, 
        maintenance_date, completed_date, status, provider, notes, 
        inserted_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) RETURNING *`,
      [
        equipment_id, maintenance_type, description, maintenance_cost || 0,
        maintenance_date || new Date(), completed_date || null, status || 'Đã lên lịch',
        provider || '', notes || '', req.user.id
      ]
    );
    
    await logActivity('CREATE', 'equipment_maintenance', result.rows[0].id, `Tạo lịch bảo trì cho thiết bị ID ${equipment_id}`, req.user.id);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create maintenance error:', error);
    res.status(500).json({ error: 'Failed to create maintenance record' });
  }
});

// Update maintenance record
router.put('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { equipment_id, maintenance_type, description, maintenance_cost, maintenance_date, completed_date, status, provider, notes } = req.body;
  
  try {
    const result = await pool.query(
      `UPDATE equipment_maintenance 
       SET equipment_id = $1, maintenance_type = $2, description = $3, 
           maintenance_cost = $4, maintenance_date = $5, completed_date = $6, 
           status = $7, provider = $8, notes = $9, updated_by = $10, updated_at = NOW()
       WHERE id = $11 AND is_deleted = false RETURNING *`,
      [
        equipment_id, maintenance_type, description, maintenance_cost || 0,
        maintenance_date, completed_date, status, provider || '', notes || '',
        req.user.id, id
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Maintenance record not found' });
    }
    
    await logActivity('UPDATE', 'equipment_maintenance', id, `Cập nhật lịch bảo trì ID ${id}`, req.user.id);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update maintenance error:', error);
    res.status(500).json({ error: 'Failed to update maintenance record' });
  }
});

// Delete maintenance record
router.delete('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE equipment_maintenance 
       SET is_deleted = true, updated_by = $1, updated_at = NOW() 
       WHERE id = $2 AND is_deleted = false RETURNING id`,
      [req.user.id, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Maintenance record not found' });
    }
    
    await logActivity('DELETE', 'equipment_maintenance', id, `Xóa lịch bảo trì ID ${id}`, req.user.id);
    res.json({ success: true, message: 'Maintenance record deleted' });
  } catch (error) {
    console.error('Delete maintenance error:', error);
    res.status(500).json({ error: 'Failed to delete maintenance record' });
  }
});

module.exports = router;
