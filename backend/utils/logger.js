// utils/logger.js
const { pool } = require('./db');

/**
 * Logs an activity into the activity_logs table.
 * @param {string} action - Action type (e.g., CREATE, UPDATE, DELETE).
 * @param {string} entityType - The entity being affected.
 * @param {number} entityId - Primary key of the entity.
 * @param {string} description - Human‑readable description of the operation.
 * @param {number} userId - The user ID who performed the action.
 */
const logActivity = async (action, entityType, entityId, description, userId, details = null, isSuspicious = false) => {
  try {
    await pool.query(
      `INSERT INTO activity_logs (action, entity_type, entity_id, description, details, is_suspicious, inserted_by, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [action, entityType, entityId, description, details ? JSON.stringify(details) : null, isSuspicious, userId, userId]
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
};

module.exports = { logActivity };
