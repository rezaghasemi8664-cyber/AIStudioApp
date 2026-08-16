// routes/auth.routes.cjs
// ---------------------------------------------------------------
// Auth Routes - All authentication and user-related endpoints
// v11.2 - Added recover-password & reset-password routes
// ---------------------------------------------------------------

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller.cjs');

// --- Load Auth Middleware (try multiple paths) ---
let authMiddleware;
const middlewarePaths = [
  '../middleware/auth.middleware.cjs',
  '../middlewares/auth.middleware.cjs',
];

for (const p of middlewarePaths) {
  try {
    const mod = require(p);
    // Handle different export patterns
    authMiddleware = mod.authenticate || mod.authMiddleware || mod.verifyToken || mod;
    if (typeof authMiddleware === 'function') {
      console.log('[AUTH_ROUTES] Middleware loaded from:', p);
      break;
    } else {
      authMiddleware = null;
    }
  } catch (_) {
    // try next path
  }
}

if (typeof authMiddleware !== 'function') {
  console.error('[AUTH_ROUTES] CRITICAL: No auth middleware found! Using 401 fallback.');
  authMiddleware = function (_req, res) {
    return res.status(401).json({
      success: false,
      message: 'سیستم احراز هویت پیکربندی نشده است',
      messageEn: 'Auth middleware not configured',
    });
  };
}

// --- Verify all required controller methods exist ---
const requiredMethods = [
  'login', 'register', 'verify', 'refreshToken',
  'logout', 'me', 'updateProfile', 'changePassword', 'getSubscription',
  'recoverPassword', 'resetPassword'    // ✅ NEW
];

requiredMethods.forEach(function (method) {
  if (typeof authController[method] !== 'function') {
    console.error('[AUTH_ROUTES] MISSING controller method: authController.' + method);
    // Create a fallback so Express doesn't crash
    authController[method] = function (_req, res) {
      return res.status(501).json({
        success: false,
        message: 'متد ' + method + ' هنوز پیاده‌سازی نشده',
        messageEn: 'Method ' + method + ' is not implemented',
      });
    };
  }
});

// ==============================================
// 🔓 Public routes (no authentication required)
// ==============================================

// Login
router.post('/login', authController.login);

// Register (+ alias /signup for frontend compatibility)
router.post('/register', authController.register);
router.post('/signup', authController.register);

// ✅ NEW: Password Recovery (public — no auth needed)
router.post('/recover-password', authController.recoverPassword);
router.post('/forgot-password', authController.recoverPassword);   // alias

// ✅ NEW: Password Reset with token (public — no auth needed)
router.post('/reset-password', authController.resetPassword);

// ==============================================
// 🔑 Token verification routes
// Both GET and POST supported for flexibility
// ==============================================

// /auth/verify — can work with or without middleware
router.get('/verify', function (req, res, next) {
  authMiddleware(req, res, function (err) {
    if (err) req.user = null;
    next();
  });
}, authController.verify);

router.post('/verify', function (req, res, next) {
  authMiddleware(req, res, function (err) {
    if (err) req.user = null;
    next();
  });
}, authController.verify);

// /auth/verify-token — alias for /verify
router.get('/verify-token', function (req, res, next) {
  authMiddleware(req, res, function (err) {
    if (err) req.user = null;
    next();
  });
}, authController.verify);

router.post('/verify-token', function (req, res, next) {
  authMiddleware(req, res, function (err) {
    if (err) req.user = null;
    next();
  });
}, authController.verify);

// ==============================================
// 🔄 Token refresh
// ==============================================
router.post('/refresh', authController.refreshToken);
router.post('/refresh-token', authController.refreshToken);

// ==============================================
// 🔒 Protected routes (authentication required)
// ==============================================

// Logout
router.post('/logout', authMiddleware, authController.logout);
router.get('/logout', authMiddleware, authController.logout);

// Get current user (me)
router.get('/me', authMiddleware, authController.me);

// Update profile
router.put('/profile', authMiddleware, authController.updateProfile);
router.patch('/profile', authMiddleware, authController.updateProfile);

// Change password
router.post('/change-password', authMiddleware, authController.changePassword);
router.put('/change-password', authMiddleware, authController.changePassword);

// Subscription info
router.get('/subscription', authMiddleware, authController.getSubscription);

// ==============================================
// 📋 Route summary (for debugging)
// ==============================================
// POST   /auth/login              → public
// POST   /auth/register           → public
// POST   /auth/signup             → public (alias)
// POST   /auth/recover-password   → public  ✅ NEW
// POST   /auth/forgot-password    → public  ✅ NEW (alias)
// POST   /auth/reset-password     → public  ✅ NEW
// GET    /auth/verify             → semi-public (token in header)
// POST   /auth/verify             → semi-public
// GET    /auth/verify-token       → semi-public (alias)
// POST   /auth/verify-token       → semi-public (alias)
// POST   /auth/refresh            → public (with refresh token)
// POST   /auth/refresh-token      → public (alias)
// POST   /auth/logout             → protected
// GET    /auth/logout             → protected
// GET    /auth/me                 → protected
// PUT    /auth/profile            → protected
// PATCH  /auth/profile            → protected
// POST   /auth/change-password    → protected
// PUT    /auth/change-password    → protected
// GET    /auth/subscription       → protected

console.log('[AUTH_ROUTES] All routes registered successfully (v11.2 — with recover/reset)');

module.exports = router;
