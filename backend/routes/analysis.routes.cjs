// routes/analysisHistory.routes.cjs
// Updated: 2026-02-26
'use strict';

const express = require('express');
const router = express.Router();

// ── بارگذاری Controller با مدیریت خطا ──────────────────────────
let controller;
try {
  controller = require('../controllers/analysisHistory.controller.cjs');
} catch (err) {
  console.error('[ANALYSIS_HISTORY_ROUTES] Failed to load controller:', err.message);
  controller = null;
}

// ── بارگذاری Middleware احراز هویت ──────────────────────────────
let authMiddleware;
try {
  const authModule = require('../middlewares/auth.middleware.cjs');
  authMiddleware = authModule.authMiddleware || authModule.authenticate || authModule;
  if (typeof authMiddleware !== 'function') {
    throw new Error('authMiddleware is not a function');
  }
} catch (err) {
  console.error('[ANALYSIS_HISTORY_ROUTES] Failed to load auth middleware:', err.message);
  // Fallback: middleware که همیشه رد می‌کند (امنیت)
  authMiddleware = function (req, res, next) {
    return res.status(401).json({
      success: false,
      message: '\u0633\u0631\u0648\u06cc\u0633 \u0627\u062d\u0631\u0627\u0632 \u0647\u0648\u06cc\u062a \u062f\u0631 \u062f\u0633\u062a\u0631\u0633 \u0646\u06cc\u0633\u062a'
      // سرویس احراز هویت در دسترس نیست
    });
  };
}

// ── Fallback handler اگر controller بارگذاری نشده باشد ─────────
function unavailableHandler(req, res) {
  return res.status(503).json({
    success: false,
    message: '\u0633\u0631\u0648\u06cc\u0633 \u062a\u0627\u0631\u06cc\u062e\u0686\u0647 \u062a\u062d\u0644\u06cc\u0644 \u062f\u0631 \u062f\u0633\u062a\u0631\u0633 \u0646\u06cc\u0633\u062a'
    // سرویس تاریخچه تحلیل در دسترس نیست
  });
}

// ── استخراج متدهای controller با fallback ──────────────────────
const createAnalysisHistory = (controller && typeof controller.createAnalysisHistory === 'function')
  ? controller.createAnalysisHistory
  : unavailableHandler;

const getAnalysisHistory = (controller && typeof controller.getAnalysisHistory === 'function')
  ? controller.getAnalysisHistory
  : unavailableHandler;

const getAnalysisById = (controller && typeof controller.getAnalysisById === 'function')
  ? controller.getAnalysisById
  : unavailableHandler;

const deleteAnalysis = (controller && typeof controller.deleteAnalysis === 'function')
  ? controller.deleteAnalysis
  : unavailableHandler;

const clearHistory = (controller && typeof controller.clearHistory === 'function')
  ? controller.clearHistory
  : unavailableHandler;

const getHistoryStats = (controller && typeof controller.getHistoryStats === 'function')
  ? controller.getHistoryStats
  : unavailableHandler;

// ── Validation Middleware ───────────────────────────────────────

// اعتبارسنجی پارامتر id (باید عدد صحیح مثبت باشد)
function validateIdParam(req, res, next) {
  var id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: '\u0634\u0646\u0627\u0633\u0647 \u0646\u0627\u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a'
      // شناسه نامعتبر است
    });
  }
  req.params.id = id; // تبدیل به عدد
  next();
}

// اعتبارسنجی بدنه درخواست ایجاد تحلیل
function validateCreateBody(req, res, next) {
  var body = req.body;
  if (!body) {
    return res.status(400).json({
      success: false,
      message: '\u0628\u062f\u0646\u0647 \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062e\u0627\u0644\u06cc \u0627\u0633\u062a'
      // بدنه درخواست خالی است
    });
  }

  // حداقل باید نماد سهم وجود داشته باشد
  var stock = body.stock || body.symbol;
  if (!stock || typeof stock !== 'string' || stock.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: '\u0646\u0645\u0627\u062f \u0633\u0647\u0645 \u0627\u0644\u0632\u0627\u0645\u06cc \u0627\u0633\u062a'
      // نماد سهم الزامی است
    });
  }

  // نرمال‌سازی: اطمینان از وجود فیلد stock
  if (!body.stock && body.symbol) {
    body.stock = body.symbol;
  }

  next();
}

// ── Query parameter validation برای GET لیست ───────────────────
function validateListQuery(req, res, next) {
  // اعتبارسنجی page و limit
  if (req.query.page) {
    var page = parseInt(req.query.page, 10);
    if (isNaN(page) || page < 1) {
      req.query.page = '1';
    }
  }
  if (req.query.limit) {
    var limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      req.query.limit = '20'; // حداکثر 100، پیش‌فرض 20
    }
  }
  next();
}

// ── اعمال Middleware احراز هویت روی تمام مسیرها ────────────────
router.use(authMiddleware);

// ══════════════════════════════════════════════════════════════════
// مسیرهای ثابت (STATIC) — حتماً قبل از مسیرهای پارامتری (:id)
// ══════════════════════════════════════════════════════════════════

// GET    /analysis-history/stats       → آمار تاریخچه
router.get('/stats', getHistoryStats);

// DELETE /analysis-history/clear-all   → حذف کل تاریخچه کاربر
// نکته: از /clear-all استفاده شد تا با DELETE /:id تداخل نکند
router.delete('/clear-all', clearHistory);

// ══════════════════════════════════════════════════════════════════
// مسیرهای ریشه (بدون پارامتر)
// ══════════════════════════════════════════════════════════════════

// POST   /analysis-history             → ایجاد تحلیل جدید
router.post('/', validateCreateBody, createAnalysisHistory);

// GET    /analysis-history             → دریافت لیست تاریخچه
router.get('/', validateListQuery, getAnalysisHistory);

// ══════════════════════════════════════════════════════════════════
// مسیرهای پارامتری — حتماً آخر تعریف شوند
// ══════════════════════════════════════════════════════════════════

// GET    /analysis-history/:id         → دریافت تحلیل خاص
router.get('/:id', validateIdParam, getAnalysisById);

// DELETE /analysis-history/:id         → حذف تحلیل خاص
router.delete('/:id', validateIdParam, deleteAnalysis);

// ── لاگ بارگذاری ───────────────────────────────────────────────
console.log('[ANALYSIS_HISTORY_ROUTES] Loaded. Routes: POST /, GET /, GET /stats, GET /:id, DELETE /:id, DELETE /clear-all');

module.exports = router;
