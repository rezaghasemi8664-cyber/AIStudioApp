/**
 * Market Summary Routes
 * Path: routes/marketSummary.routes.cjs
 * Updated: 2026-08-20
 *
 * Goals:
 * - GET / and /latest return latest market summary
 * - /history, /dates and /by-date/:date are public
 * - /generate and /retention are admin-only
 * - /auto-generate is internal-key-only
 * - Optional authentication never blocks public routes
 * - Safe controller/middleware resolution
 */

'use strict';

const express = require('express');

const router = express.Router();

const marketSummaryController = require(
  '../controllers/marketSummary.controller.cjs'
);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function resolveMiddleware(
  mod,
  names = [],
  required = true,
  label = 'middleware'
) {
  if (typeof mod === 'function') {
    return mod;
  }

  if (mod && typeof mod === 'object') {
    for (const name of names) {
      if (typeof mod[name] === 'function') {
        return mod[name];
      }
    }

    if (typeof mod.default === 'function') {
      return mod.default;
    }
  }

  if (required) {
    throw new TypeError(
      `[MarketSummary Routes] "${label}" is not a function. Check module.exports shape.`
    );
  }

  return null;
}

function isFunction(fn) {
  return typeof fn === 'function';
}

/* -------------------------------------------------------------------------- */
/* Controller Handler                                                         */
/* -------------------------------------------------------------------------- */

function safeHandler(methodName) {
  return async function marketSummarySafeHandler(req, res, next) {
    try {
      const handler = marketSummaryController?.[methodName];

      if (!isFunction(handler)) {
        return res.status(501).json({
          success: false,
          message:
            `Handler "${methodName}" is not implemented ` +
            `in marketSummary.controller.cjs.`
        });
      }

      return await handler(req, res, next);
    } catch (err) {
      return next(err);
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

const authenticateModule = require(
  '../middlewares/authenticate.middleware.cjs'
);

const authenticate = resolveMiddleware(
  authenticateModule,
  ['authenticate', 'auth'],
  true,
  'authenticate'
);

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

const requireAdminModule = require(
  '../middlewares/requireAdmin.middleware.cjs'
);

const requireAdmin = resolveMiddleware(
  requireAdminModule,
  ['requireAdmin', 'admin'],
  true,
  'requireAdmin'
);

/* -------------------------------------------------------------------------- */
/* Optional Authentication                                                    */
/* -------------------------------------------------------------------------- */

function buildOptionalAuth(authenticateFn) {
  return function optionalAuth(req, res, next) {
    try {
      const hasBearer =
        typeof req.headers?.authorization === 'string' &&
        req.headers.authorization
          .trim()
          .toLowerCase()
          .startsWith('bearer ');

      const hasCookieToken =
        Boolean(req.cookies?.token) ||
        Boolean(req.cookies?.accessToken) ||
        Boolean(req.signedCookies?.token) ||
        Boolean(req.signedCookies?.accessToken);

      const hasAnyToken = hasBearer || hasCookieToken;

      /*
       * No token:
       * Public route must continue normally.
       */
      if (!hasAnyToken) {
        return next();
      }

      let called = false;

      const passthroughNext = () => {
        if (called) {
          return;
        }

        called = true;
        return next();
      };

      const originalJson = res.json.bind(res);
      const originalStatus = res.status.bind(res);

      let intercepted = false;

      res.status = function patchedStatus(code) {
        if (code === 401 || code === 403) {
          intercepted = true;
          return res;
        }

        return originalStatus(code);
      };

      res.json = function patchedJson(body) {
        if (intercepted) {
          res.status = originalStatus;
          res.json = originalJson;

          if (!called) {
            called = true;
            return next();
          }

          return;
        }

        return originalJson(body);
      };

      return authenticateFn(
        req,
        res,
        passthroughNext
      );
    } catch (_err) {
      return next();
    }
  };
}

const optionalAuth = buildOptionalAuth(authenticate);

/* -------------------------------------------------------------------------- */
/* Internal Key                                                               */
/* -------------------------------------------------------------------------- */

function requireInternalKey(req, res, next) {
  const internalKey =
    req.headers['x-internal-key'] ||
    req.headers['x-admin-secret'] ||
    req.query.internalKey;

  const validKey =
    process.env.INTERNAL_API_KEY ||
    process.env.ADMIN_SECRET;

  if (!validKey) {
    return res.status(500).json({
      success: false,
      message:
        'Internal key is not configured on server. ' +
        'Please set INTERNAL_API_KEY or ADMIN_SECRET.'
    });
  }

  if (!internalKey || internalKey !== validKey) {
    return res.status(403).json({
      success: false,
      message:
        'Internal access denied. Valid internal key required.'
    });
  }

  return next();
}

/* -------------------------------------------------------------------------- */
/* Startup Assertions                                                         */
/* -------------------------------------------------------------------------- */

if (!isFunction(authenticate)) {
  throw new TypeError(
    '[MarketSummary Routes] authenticate must be a function.'
  );
}

if (!isFunction(requireAdmin)) {
  throw new TypeError(
    '[MarketSummary Routes] requireAdmin must be a function.'
  );
}

if (!isFunction(optionalAuth)) {
  throw new TypeError(
    '[MarketSummary Routes] optionalAuth must be a function.'
  );
}

if (!isFunction(requireInternalKey)) {
  throw new TypeError(
    '[MarketSummary Routes] requireInternalKey must be a function.'
  );
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/v1/market-summary/_ping
 *
 * Route health check.
 */
router.get('/_ping', (req, res) => {
  return res.json({
    success: true,
    status: 'ok',
    service: 'Market Summary Service',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /api/v1/market-summary
 * @access  Public (optional auth)
 *
 * Alias برای آخرین تحلیل بازار.
 */
router.get('/', optionalAuth, safeHandler('getLatestMarketSummary'));

/**
 * @route   GET /api/v1/market-summary/latest
 * @access  Public (optional auth)
 */
router.get('/latest', optionalAuth, safeHandler('getLatestMarketSummary'));

/**
 * GET /api/v1/market-summary/latest
 *
 * Latest market summary.
 */
router.get(
  '/latest',
  optionalAuth,
  safeHandler('getLatestMarketSummary')
);

/**
 * GET /api/v1/market-summary/history
 *
 * Market summary history.
 */
router.get(
  '/history',
  optionalAuth,
  safeHandler('getMarketSummaryHistory')
);

/**
 * GET /api/v1/market-summary/dates
 *
 * Available summary dates.
 */
router.get(
  '/dates',
  optionalAuth,
  safeHandler('getAvailableDates')
);

/**
 * GET /api/v1/market-summary/by-date/:date
 *
 * Market summary for a specific date.
 */
router.get(
  '/by-date/:date',
  optionalAuth,
  safeHandler('getMarketSummaryByDate')
);

/**
 * POST /api/v1/market-summary/generate
 *
 * Admin only.
 */
router.post(
  '/generate',
  authenticate,
  requireAdmin,
  safeHandler('generateMarketSummary')
);

/**
 * POST /api/v1/market-summary/retention
 *
 * Admin only.
 */
router.post(
  '/retention',
  authenticate,
  requireAdmin,
  safeHandler('runRetentionNow')
);

/**
 * POST /api/v1/market-summary/auto-generate
 *
 * Internal system/cron only.
 */
router.post(
  '/auto-generate',
  requireInternalKey,
  safeHandler('autoGenerateMarketSummary')
);

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

module.exports = router;