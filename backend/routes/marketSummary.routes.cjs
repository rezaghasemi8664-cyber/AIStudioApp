'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/marketSummary.controller.cjs');

// برای سازگاری با ساختارهای مختلف middleware در پروژه
let authMiddleware = {};
try {
  // مسیر اصلی پیشنهادی
  authMiddleware = require('../middlewares/auth.middleware.cjs');
} catch (_) {
  authMiddleware = {};
}

const authenticate =
  authMiddleware.authenticate ||
  authMiddleware.auth ||
  ((req, _res, next) => next());

const optionalAuth =
  authMiddleware.optionalAuth ||
  authMiddleware.optionalAuthenticate ||
  ((req, _res, next) => next());

const requireAdmin =
  authMiddleware.requireAdmin ||
  (() => {
    try {
      return require('../middlewares/requireAdmin.middleware.cjs');
    } catch (_) {
      return (_req, _res, next) => next();
    }
  })();

/**
 * Internal guard for cron/internal endpoint.
 * اولویت secrets:
 * 1) INTERNAL_CRON_KEY
 * 2) CRON_SECRET
 * 3) INTERNAL_CRON_SECRET
 * 4) ADMIN_SECRET (فقط fallback نهایی)
 */
function requireInternalKey(req, res, next) {
  try {
    const expected =
      process.env.INTERNAL_CRON_KEY ||
      process.env.CRON_SECRET ||
      process.env.INTERNAL_CRON_SECRET ||
      process.env.ADMIN_SECRET;

    if (!expected) {
      return res.status(503).json({
        success: false,
        message: 'Internal cron key is not configured on server'
      });
    }

    const provided =
      req.headers['x-internal-key'] ||
      req.headers['x-cron-key'] ||
      req.headers['x-api-key'] ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '');

    if (!provided || String(provided).trim() !== String(expected).trim()) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: invalid internal key'
      });
    }

    return next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Internal key validation failed',
      error: err?.message || 'Unknown error'
    });
  }
}

// اگر متد controller وجود نداشت، پاسخ 501
function safeHandler(fn, name) {
  if (typeof fn === 'function') return fn;

  console.warn(`[MarketSummary Routes] controller.${name} is not a function`);
  return (_req, res) =>
    res.status(501).json({
      success: false,
      message: `متد ${name} پیاده‌سازی نشده`
    });
}

// Health ping سبک برای این ماژول (اختیاری اما مفید)
router.get('/_ping', (_req, res) => {
  res.json({
    success: true,
    module: 'marketSummary.routes',
    timestamp: new Date().toISOString()
  });
});

// Public / Optional Auth
router.get(
  '/latest',
  optionalAuth,
  safeHandler(controller.getLatestMarketSummary, 'getLatestMarketSummary')
);

router.get(
  '/history',
  optionalAuth,
  safeHandler(controller.getMarketSummaryHistory, 'getMarketSummaryHistory')
);

// Protected (Admin)
router.post(
  '/generate',
  authenticate,
  requireAdmin,
  safeHandler(controller.generateMarketSummary, 'generateMarketSummary')
);

// Internal only (Cron / service-to-service)
router.post(
  '/auto-generate',
  requireInternalKey,
  safeHandler(controller.autoGenerateMarketSummary, 'autoGenerateMarketSummary')
);

console.log('[MarketSummary Routes] ✅ All routes registered');

module.exports = router;
