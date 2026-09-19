/**
 * Market Summary Routes
 * Path: routes/marketSummary.routes.cjs
 * Updated: 2026-09-03
 */

'use strict';

const express = require('express');
const router = express.Router();

const marketSummaryController = require('../controllers/marketSummary.controller.cjs');
const liveMarketSummaryController = require('../controllers/liveMarketSummary.controller.cjs');
const prismaModule = require('../config/prisma.cjs');

function resolvePrismaClient(mod) {
  return mod?.prisma || mod?.db || mod?.client || mod?.default || mod;
}

const prisma = resolvePrismaClient(prismaModule);

function resolveMiddleware(mod, names = [], required = true, label = 'middleware') {
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod === 'object') {
    for (const name of names) if (typeof mod[name] === 'function') return mod[name];
    if (typeof mod.default === 'function') return mod.default;
  }
  if (required) throw new TypeError(`[MarketSummary Routes] "${label}" is not a function. Check module.exports shape.`);
  return null;
}

function isFunction(fn) { return typeof fn === 'function'; }

function safeHandler(controller, methodName) {
  return async function marketSummarySafeHandler(req, res, next) {
    try {
      const handler = controller?.[methodName];
      if (!isFunction(handler)) {
        return res.status(501).json({ success: false, message: `Handler "${methodName}" is not implemented.` });
      }
      return await handler(req, res, next);
    } catch (err) {
      return next(err);
    }
  };
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_, current) =>
    typeof current === 'bigint' ? current.toString() : current
  ));
}

/**
 * برای مصرف UI، latest باید آخرین رکورد ذخیره‌شده روزانه باشد؛ نه snapshot زنده.
 * این endpoint عمداً به liveMarketSummaryController متصل نیست.
 */
async function getPersistedLatestMarketSummary(req, res, next) {
  try {
    if (!prisma) throw new Error('Prisma client is unavailable.');

    const model = prisma.MarketSummary || prisma.marketSummary;
    if (!model) throw new Error('MarketSummary model is unavailable.');

    const record = await model.findFirst({
      orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }]
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'هیچ خلاصه بازار ذخیره‌شده‌ای وجود ندارد.'
      });
    }

    return res.json({
      success: true,
      data: jsonSafe(record),
      cached: true,
      sourceType: 'persisted_daily_summary',
      isStale: false,
      generatedAt: record.createdAt ? new Date(record.createdAt).toISOString() : null
    });
  } catch (err) {
    return next(err);
  }
}

const authenticateModule = require('../middlewares/authenticate.middleware.cjs');
const authenticate = resolveMiddleware(authenticateModule, ['authenticate', 'auth'], true, 'authenticate');

const requireAdminModule = require('../middlewares/requireAdmin.middleware.cjs');
const requireAdmin = resolveMiddleware(requireAdminModule, ['requireAdmin', 'admin'], true, 'requireAdmin');

function buildOptionalAuth(authenticateFn) {
  return function optionalAuth(req, res, next) {
    try {
      const hasBearer = typeof req.headers?.authorization === 'string' && req.headers.authorization.trim().toLowerCase().startsWith('bearer ');
      const hasCookieToken = Boolean(req.cookies?.token) || Boolean(req.cookies?.accessToken) || Boolean(req.signedCookies?.token) || Boolean(req.signedCookies?.accessToken);
      if (!hasBearer && !hasCookieToken) return next();

      let called = false;
      const passthroughNext = () => { if (!called) { called = true; return next(); } };
      const originalJson = res.json.bind(res);
      const originalStatus = res.status.bind(res);
      let intercepted = false;

      res.status = function patchedStatus(code) {
        if (code === 401 || code === 403) { intercepted = true; return res; }
        return originalStatus(code);
      };
      res.json = function patchedJson(body) {
        if (intercepted) {
          res.status = originalStatus;
          res.json = originalJson;
          if (!called) { called = true; return next(); }
          return;
        }
        return originalJson(body);
      };
      return authenticateFn(req, res, passthroughNext);
    } catch (_err) {
      return next();
    }
  };
}

const optionalAuth = buildOptionalAuth(authenticate);

function requireInternalKey(req, res, next) {
  const internalKey = req.headers['x-internal-key'] || req.headers['x-admin-secret'] || req.query.internalKey;
  const validKey = process.env.INTERNAL_API_KEY || process.env.ADMIN_SECRET;
  if (!validKey) return res.status(500).json({ success: false, message: 'Internal key is not configured on server.' });
  if (!internalKey || internalKey !== validKey) return res.status(403).json({ success: false, message: 'Internal access denied. Valid internal key required.' });
  return next();
}

if (!isFunction(authenticate) || !isFunction(requireAdmin) || !isFunction(optionalAuth) || !isFunction(requireInternalKey)) {
  throw new TypeError('[MarketSummary Routes] middleware resolution failed.');
}

router.get('/_ping', (req, res) => res.json({ success: true, status: 'ok', service: 'Market Summary Service', timestamp: new Date().toISOString() }));

// latest/current برای UI باید آخرین خلاصه روزانه ذخیره‌شده باشد، نه تحلیل زنده.
router.get('/', optionalAuth, getPersistedLatestMarketSummary);
router.get('/latest', optionalAuth, getPersistedLatestMarketSummary);

// فقط سرویس داخلی تولید روزانه می‌تواند تحلیل زنده ۱۴بخشی را برای ذخیره‌سازی دریافت کند.
// این endpoint عمداً از UI استفاده نمی‌شود.
router.get('/live', requireInternalKey, safeHandler(liveMarketSummaryController, 'getLatestMarketSummary'));

router.get('/history', optionalAuth, safeHandler(marketSummaryController, 'getMarketSummaryHistory'));
router.get('/dates', optionalAuth, safeHandler(marketSummaryController, 'getAvailableDates'));
router.get('/by-date/:date', optionalAuth, safeHandler(marketSummaryController, 'getMarketSummaryByDate'));

router.post('/generate', authenticate, requireAdmin, safeHandler(marketSummaryController, 'generateMarketSummary'));
router.post('/retention', authenticate, requireAdmin, safeHandler(marketSummaryController, 'runRetentionNow'));
router.post('/auto-generate', requireInternalKey, safeHandler(marketSummaryController, 'autoGenerateMarketSummary'));

module.exports = router;
