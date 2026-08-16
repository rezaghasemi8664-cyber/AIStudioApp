// middlewares/requireAdmin.middleware.cjs - v2.0 Fixed
// Last Updated: 2026-02-23
'use strict';

/**
 * Require Admin Role Middleware
 * Must be used AFTER auth.middleware (authenticate)
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: '\u0627\u0628\u062A\u062F\u0627 \u0628\u0627\u06CC\u062F \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F.',
      messageEn: 'Authentication required first.',
      code: 'NOT_AUTHENTICATED'
    });
  }

  if (!req.user.isAdmin && req.user.role !== 'ADMIN') {
    console.warn(`[ADMIN_MW] Access denied for user: ${req.user.username || req.user.id} on ${req.method} ${req.originalUrl}`);
    return res.status(403).json({
      success: false,
      message: '\u0634\u0645\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A\u06CC \u0646\u062F\u0627\u0631\u06CC\u062F.',
      messageEn: 'You do not have admin access.',
      code: 'ADMIN_REQUIRED'
    });
  }

  next();
}

module.exports = requireAdmin;
