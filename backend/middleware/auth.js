// middleware/auth.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

/** Middleware to verify JWT and attach user to request */
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Không có quyền truy cập. Vui lòng đăng nhập.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    
    // Support Active Role from header
    const activeRoleHeader = req.headers['x-active-role'];
    if (activeRoleHeader) {
      if (Array.isArray(req.user.roles) && req.user.roles.includes(activeRoleHeader)) {
        req.user.activeRole = activeRoleHeader;
      } else if (req.user.role === activeRoleHeader) {
        req.user.activeRole = activeRoleHeader;
      }
    }
    next();
  } catch {
    res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  }
};

/**
 * Helper: check if user has at least one of the specified roles.
 * Supports activeRole, new format (roles: []) and legacy format (role: string).
 */
const hasRole = (user, ...roles) => {
  if (!user) return false;
  
  // If user requested a specific active role, check against that
  if (user.activeRole) {
    return roles.includes(user.activeRole);
  }
  
  // New format: roles is an array
  if (Array.isArray(user.roles)) {
    return roles.some(r => user.roles.includes(r));
  }
  // Legacy fallback: single role string
  if (typeof user.role === 'string') {
    return roles.includes(user.role);
  }
  return false;
};

/** Require admin role */
const requireAdmin = (req, res, next) => {
  if (!hasRole(req.user, 'admin')) {
    return res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này.' });
  }
  next();
};

/** Require admin, camera_manager, investor, or driver for status updates */
const requireStatusManager = (req, res, next) => {
  if (!hasRole(req.user, 'admin', 'camera_manager', 'investor', 'driver')) {
    return res.status(403).json({ error: 'Chỉ Quản lý Camera, Driver hoặc Quản trị viên mới có quyền cập nhật trạng thái đơn thuê.' });
  }
  next();
};

/** Require admin, camera_manager, or investor */
const requireAdminOrManager = (req, res, next) => {
  if (!hasRole(req.user, 'admin', 'camera_manager', 'investor')) {
    return res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này.' });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireStatusManager, requireAdminOrManager, hasRole };
