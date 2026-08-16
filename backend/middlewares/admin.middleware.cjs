// backend/middleware/admin.middleware.cjs
// ═══════════════════════════════════════════════════════════════
// Admin-only access middleware
// Must be used AFTER auth.middleware
// ═══════════════════════════════════════════════════════════════
// Database Role Mapping:
//   roleId = 1  →  user (کاربر عادی)
//   roleId = 2  →  admin (مدیر)
// ═══════════════════════════════════════════════════════════════
'use strict';

const MESSAGES = require('../constants/messages.cjs');

// ─── Role ID Constants ────────────────────────────────────────
const ROLE_IDS = {
  USER: 1,
  ADMIN: 2,
};

/**
 * Require admin role
 * Checks req.user.role === 'admin' OR req.user.role === 'superadmin' OR req.user.roleId === 2
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function adminMiddleware(req, res, next) {
  // ── Step 1: Ensure user is authenticated ──
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: MESSAGES.AUTH.UNAUTHORIZED || 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }

  // ── Step 2: Check admin access (roleId=2 OR role name) ──
  const roleName = (req.user.role || '').toLowerCase().trim();

  const isAdmin = (
    roleName === 'admin' ||
    roleName === 'superadmin' ||
    req.user.roleId === ROLE_IDS.ADMIN       // roleId === 2
  );

  if (!isAdmin) {
    console.warn(
      `[AdminMiddleware] Access denied for user #${req.user.id} ` +
      `(role: "${req.user.role}", roleId: ${req.user.roleId})`
    );
    return res.status(403).json({
      success: false,
      message: MESSAGES.AUTH.ADMIN_REQUIRED || 'Admin access required',
      code: 'ADMIN_REQUIRED',
    });
  }

  // ── Step 3: Grant access ──
  next();
}

/**
 * Require specific role(s)
 * Usage:
 *   router.get('/route', authMiddleware, requireRole('admin'), handler)
 *   router.get('/route', authMiddleware, requireRole('admin', 'editor'), handler)
 *
 * @param {...string} roles - Allowed role names
 * @returns {Function} Express middleware
 */
function requireRole() {
  const allowedRoles = Array.prototype.slice.call(arguments).map(function (r) {
    return r.toLowerCase().trim();
  });

  return function (req, res, next) {
    // ── Must be authenticated first ──
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: MESSAGES.AUTH.UNAUTHORIZED || 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    const userRole = (req.user.role || '').toLowerCase().trim();

    const hasRole = allowedRoles.some(function (role) {
      return userRole === role;
    });

    if (!hasRole) {
      console.warn(
        `[requireRole] Access denied for user #${req.user.id} ` +
        `(role: "${req.user.role}"). Required: [${allowedRoles.join(', ')}]`
      );
      return res.status(403).json({
        success: false,
        message: MESSAGES.AUTH.FORBIDDEN || 'Insufficient permissions',
        code: 'INSUFFICIENT_ROLE',
      });
    }

    next();
  };
}

// ─── Exports ──────────────────────────────────────────────────
module.exports = adminMiddleware;
module.exports.adminMiddleware = adminMiddleware;
module.exports.requireRole = requireRole;
module.exports.ROLE_IDS = ROLE_IDS;
