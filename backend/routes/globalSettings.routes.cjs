// routes/globalSettings.routes.cjs
'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/globalSettings.controller.cjs');

// ─── بارگذاری middleware ───
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
    console.warn('[GlobalSettings Routes] ⚠️ Auth middleware not found');
  }
}

// Fallback handler
const safeHandler = (fn, name) => {
  if (typeof fn === 'function') return fn;
  console.warn(`[GlobalSettings Routes] ⚠️ controller.${name} is not a function`);
  return (req, res) => res.status(501).json({
    success: false,
    message: `متد ${name} پیاده‌سازی نشده`,
  });
};

// ═══════════════════════════════════════════════════════════════
// Authenticated Routes (GET - خواندن تنظیمات)
// ═══════════════════════════════════════════════════════════════
if (authenticateToken) {
  router.get('/', authenticateToken, safeHandler(controller.getAllGlobalSettings, 'getAllGlobalSettings'));
  router.get('/:category', authenticateToken, safeHandler(controller.getGlobalSettingsByCategory, 'getGlobalSettingsByCategory'));
  router.get('/:category/:key', authenticateToken, safeHandler(controller.getGlobalSetting, 'getGlobalSetting'));
} else {
  router.get('/', safeHandler(controller.getAllGlobalSettings, 'getAllGlobalSettings'));
  router.get('/:category', safeHandler(controller.getGlobalSettingsByCategory, 'getGlobalSettingsByCategory'));
  router.get('/:category/:key', safeHandler(controller.getGlobalSetting, 'getGlobalSetting'));
}

// ═══════════════════════════════════════════════════════════════
// Admin Routes (PUT / DELETE - تغییر تنظیمات)
// ═══════════════════════════════════════════════════════════════
if (authenticateToken && requireAdmin) {
  router.put('/', authenticateToken, requireAdmin, safeHandler(controller.bulkUpsertGlobalSettings, 'bulkUpsertGlobalSettings'));
  router.put('/:category/:key', authenticateToken, requireAdmin, safeHandler(controller.upsertGlobalSetting, 'upsertGlobalSetting'));
  router.delete('/:category/:key', authenticateToken, requireAdmin, safeHandler(controller.deleteGlobalSetting, 'deleteGlobalSetting'));
} else if (authenticateToken) {
  router.put('/', authenticateToken, safeHandler(controller.bulkUpsertGlobalSettings, 'bulkUpsertGlobalSettings'));
  router.put('/:category/:key', authenticateToken, safeHandler(controller.upsertGlobalSetting, 'upsertGlobalSetting'));
  router.delete('/:category/:key', authenticateToken, safeHandler(controller.deleteGlobalSetting, 'deleteGlobalSetting'));
} else {
  router.put('/', safeHandler(controller.bulkUpsertGlobalSettings, 'bulkUpsertGlobalSettings'));
  router.put('/:category/:key', safeHandler(controller.upsertGlobalSetting, 'upsertGlobalSetting'));
  router.delete('/:category/:key', safeHandler(controller.deleteGlobalSetting, 'deleteGlobalSetting'));
}

console.log('[GlobalSettings Routes] ✅ All routes registered');

module.exports = router;
