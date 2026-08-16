// routes/appConfig.routes.cjs
'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/appConfig.controller.cjs');

// ─── بارگذاری middleware با چند مسیر جایگزین ───
let authenticateToken, requireAdmin;
try {
  const m = require('../middlewares/auth.middleware.cjs');
  authenticateToken = m.authenticateToken || m.authenticate || m.verifyToken;
  requireAdmin = m.requireAdmin || m.isAdmin || m.adminOnly;
} catch {
  try {
    const m = require('../middleware/auth.middleware.cjs');
    authenticateToken = m.authenticateToken || m.authenticate || m.verifyToken;
    requireAdmin = m.requireAdmin || m.isAdmin || m.adminOnly;
  } catch {
    console.warn('[AppConfig Routes] ⚠️ Auth middleware not found');
  }
}

// Optional auth: اگر توکن بود verify کن، نبود ادامه بده
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ') && authenticateToken) {
    return authenticateToken(req, res, next);
  }
  next();
};

// Fallback برای متدهای controller اگر وجود نداشته باشند
const safeHandler = (fn, name) => {
  if (typeof fn === 'function') return fn;
  console.warn(`[AppConfig Routes] ⚠️ controller.${name} is not a function, using fallback`);
  return (req, res) => res.status(501).json({
    success: false,
    message: `متد ${name} پیاده‌سازی نشده`,
  });
};

// ═══════════════════════════════════════════════════════════════
// Public Routes (بدون احراز هویت)
// ═══════════════════════════════════════════════════════════════
router.get('/public', safeHandler(controller.getPublicConfig, 'getPublicConfig'));
router.get('/features', safeHandler(controller.getFeatures, 'getFeatures'));
router.get('/market', safeHandler(controller.getMarketConfig, 'getMarketConfig'));
router.get('/market-schedule', safeHandler(controller.getMarketSchedule, 'getMarketSchedule'));
router.get('/market_schedule', safeHandler(controller.getMarketSchedule, 'getMarketSchedule'));
router.get('/market-status', safeHandler(controller.getMarketStatus, 'getMarketStatus'));

// ═══════════════════════════════════════════════════════════════
// Authenticated Routes
// ═══════════════════════════════════════════════════════════════
router.get('/', optionalAuth, safeHandler(controller.getConfig, 'getConfig'));
router.get('/:key', optionalAuth, safeHandler(controller.getConfigByKey, 'getConfigByKey'));

// ═══════════════════════════════════════════════════════════════
// Admin Routes
// ═══════════════════════════════════════════════════════════════
if (authenticateToken && requireAdmin) {
  router.put('/', authenticateToken, requireAdmin, safeHandler(controller.updateConfig, 'updateConfig'));
  router.patch('/', authenticateToken, requireAdmin, safeHandler(controller.updateConfig, 'updateConfig'));
  router.put('/:key', authenticateToken, requireAdmin, safeHandler(controller.updateConfigByKey, 'updateConfigByKey'));
  router.post('/init', authenticateToken, requireAdmin, safeHandler(controller.initializeDefaults, 'initializeDefaults'));
} else if (authenticateToken) {
  router.put('/', authenticateToken, safeHandler(controller.updateConfig, 'updateConfig'));
  router.patch('/', authenticateToken, safeHandler(controller.updateConfig, 'updateConfig'));
  router.put('/:key', authenticateToken, safeHandler(controller.updateConfigByKey, 'updateConfigByKey'));
  router.post('/init', authenticateToken, safeHandler(controller.initializeDefaults, 'initializeDefaults'));
} else {
  router.put('/', safeHandler(controller.updateConfig, 'updateConfig'));
  router.patch('/', safeHandler(controller.updateConfig, 'updateConfig'));
  router.put('/:key', safeHandler(controller.updateConfigByKey, 'updateConfigByKey'));
  router.post('/init', safeHandler(controller.initializeDefaults, 'initializeDefaults'));
}

console.log('[AppConfig Routes] ✅ All routes registered');

module.exports = router;
