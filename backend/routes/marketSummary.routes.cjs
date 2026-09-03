/**
 * Market Summary Routes
 * Path: routes/marketSummary.routes.cjs
 * Updated: 2026-09-02
 */

'use strict';

const express = require('express');
const router = express.Router();

const marketSummaryController = require('../controllers/marketSummary.controller.cjs');
const liveMarketSummaryController = require('../controllers/liveMarketSummary.controller.cjs');

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

// IMPORTANT: latest/current must use the live BRS snapshot. Historical routes remain on the original controller.
router.get('/', optionalAuth, safeHandler(liveMarketSummaryController, 'getLatestMarketSummary'));
router.get('/latest', optionalAuth, safeHandler(liveMarketSummaryController, 'getLatestMarketSummary'));

router.get('/history', optionalAuth, safeHandler(marketSummaryController, 'getMarketSummaryHistory'));
router.get('/dates', optionalAuth, safeHandler(marketSummaryController, 'getAvailableDates'));
router.get('/by-date/:date', optionalAuth, safeHandler(marketSummaryController, 'getMarketSummaryByDate'));

router.post('/generate', authenticate, requireAdmin, safeHandler(marketSummaryController, 'generateMarketSummary'));
router.post('/retention', authenticate, requireAdmin, safeHandler(marketSummaryController, 'runRetentionNow'));
router.post('/auto-generate', requireInternalKey, safeHandler(marketSummaryController, 'autoGenerateMarketSummary'));

module.exports = router;
