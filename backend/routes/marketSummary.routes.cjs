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
const marketSummaryPrismaModule = require('../config/prisma.cjs');

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

function resolvePrismaClient(mod) {
  const candidates = [mod?.prisma, mod?.db, mod?.client, mod?.default, mod];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') return candidate;
  }
  return null;
}

const prisma = resolvePrismaClient(marketSummaryPrismaModule);

function resolveMarketSummaryModel() {
  return prisma?.MarketSummary || prisma?.marketSummary || null;
}

/*
 * تاریخ و ساعت رسمی این بخش همیشه بر اساس تهران محاسبه می‌شود.
 * این کنترل فقط جلوی تولید «خلاصه نهایی امروز» قبل از ۱۲:۳۵ را می‌گیرد.
 * اسنپ‌شات زنده /latest همچنان مستقل و بدون ذخیره MarketSummary کار می‌کند.
 */
function getTehranParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  }).formatToParts(date);

  const out = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }

  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute)
  };
}

function isBeforeFinalGenerationTime(date = new Date()) {
  const p = getTehranParts(date);
  return (p.hour * 60 + p.minute) < (12 * 60 + 35);
}

function tehranDateOnly(date = new Date()) {
  const p = getTehranParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function getRecordedTimestampsByIds(ids) {
  const MarketSummary = resolveMarketSummaryModel();
  if (!MarketSummary || typeof MarketSummary.findMany !== 'function' || !ids.length) {
    return Promise.resolve(new Map());
  }

  return MarketSummary.findMany({
    where: { id: { in: ids } },
    select: { id: true, createdAt: true, updatedAt: true }
  })
    .then(records => new Map(records.map(record => [Number(record.id), record])))
    .catch(error => {
      console.warn('[MarketSummary Routes] Failed to read recorded timestamps:', error?.message || error);
      return new Map();
    });
}

async function enrichPayloadWithRecordedTimestamps(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  const dataItems = Array.isArray(payload.data)
    ? payload.data
    : payload.data && typeof payload.data === 'object'
      ? [payload.data]
      : [];

  const ids = dataItems
    .map(item => Number(item?.id))
    .filter(id => Number.isInteger(id) && id > 0);

  if (!ids.length) return payload;

  const byId = await getRecordedTimestampsByIds(ids);

  const merge = item => {
    const record = byId.get(Number(item?.id));
    if (!record) return item;

    return {
      ...item,
      // این مقادیر مستقیماً از MarketSummary دیتابیس خوانده می‌شوند.
      createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : null,
      updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null
    };
  };

  return {
    ...payload,
    data: Array.isArray(payload.data) ? payload.data.map(merge) : merge(payload.data)
  };
}

/*
 * کنترل پاسخ تاریخچه: منطق اصلی Controller دست‌نخورده می‌ماند و فقط
 * createdAt/updatedAt واقعی رکورد DB به پاسخ اضافه می‌شود.
 */
async function historyWithRecordedTimestamps(req, res, next) {
  try {
    const originalJson = res.json.bind(res);
    res.json = function patchedJson(payload) {
      enrichPayloadWithRecordedTimestamps(payload)
        .then(enriched => originalJson(enriched))
        .catch(error => {
          console.warn('[MarketSummary Routes] History timestamp enrichment failed:', error?.message || error);
          originalJson(payload);
        });
      return res;
    };

    return await marketSummaryController.getMarketSummaryHistory(req, res, next);
  } catch (error) {
    return next(error);
  }
}

async function byDateWithRecordedTimestamp(req, res, next) {
  try {
    const originalJson = res.json.bind(res);
    res.json = function patchedJson(payload) {
      enrichPayloadWithRecordedTimestamps(payload)
        .then(enriched => originalJson(enriched))
        .catch(error => {
          console.warn('[MarketSummary Routes] By-date timestamp enrichment failed:', error?.message || error);
          originalJson(payload);
        });
      return res;
    };

    return await marketSummaryController.getMarketSummaryByDate(req, res, next);
  } catch (error) {
    return next(error);
  }
}

/*
 * تولید نهایی امروز قبل از ۱۲:۳۵ مجاز نیست.
 * این guard علاوه بر cron/service، مسیرهای دستی را نیز پوشش می‌دهد.
 */
function blockPrematureFinalGeneration(req, res, next) {
  if (!isBeforeFinalGenerationTime()) return next();

  return res.status(409).json({
    success: false,
    data: null,
    message: 'تولید خلاصه نهایی بازار امروز قبل از ساعت ۱۲:۳۵ به وقت تهران مجاز نیست.',
    meta: {
      generated: false,
      cached: false,
      reason: 'BEFORE_12_35_TEHRAN',
      finalGenerationTimeTehran: '12:35',
      currentTehranDate: tehranDateOnly()
    }
  });
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

// مهم: /latest همچنان اسنپ‌شات زنده BRS را از Controller اصلی می‌گیرد.
// این مسیر تولید/ذخیره MarketSummary انجام نمی‌دهد و منطق تحلیل کامل آن دست‌نخورده است.
router.get('/', optionalAuth, safeHandler(liveMarketSummaryController, 'getLatestMarketSummary'));
router.get('/latest', optionalAuth, safeHandler(liveMarketSummaryController, 'getLatestMarketSummary'));

// تاریخچه و مشاهده بر اساس تاریخ: زمان ثبت واقعی DB به پاسخ اضافه می‌شود.
router.get('/history', optionalAuth, historyWithRecordedTimestamps);
router.get('/dates', optionalAuth, safeHandler(marketSummaryController, 'getAvailableDates'));
router.get('/by-date/:date', optionalAuth, byDateWithRecordedTimestamp);

// تولید دستی/خودکار نهایی نیز قبل از ۱۲:۳۵ مسدود است.
router.post('/generate', authenticate, requireAdmin, blockPrematureFinalGeneration, safeHandler(marketSummaryController, 'generateMarketSummary'));
router.post('/retention', authenticate, requireAdmin, safeHandler(marketSummaryController, 'runRetentionNow'));
router.post('/auto-generate', requireInternalKey, blockPrematureFinalGeneration, safeHandler(marketSummaryController, 'autoGenerateMarketSummary'));

module.exports = router;