/**
 * Market History Controller - v6.1 (fixed)
 * ---------------------------------------
 * - Frontend-compatible /api/market/index contract
 * - Numeric coercion for MarketIndex.tsx (typeof index === 'number')
 * - Explicit DB fallback when BRS fails or payload is unusable
 * - Safe optional service/config loading
 * - Privileged access for debug/cache
 * - Backward-compatible exports
 */
'use strict';

let sharedMarketService = null;
try {
  sharedMarketService = require('../services/sharedMarket.service.cjs');
  console.log('[MARKET CTRL v7.0] shared market service loaded');
} catch (e) {
  console.error('[MARKET CTRL v7.0] shared market service load failed:', e.message);
}

let marketHistoryService = null;
try {
  marketHistoryService = require('../services/marketHistory.service.cjs');
  console.log('[MARKET CTRL v6.1] marketHistory.service loaded');
} catch (e) {
  console.warn('[MARKET CTRL v6.1] marketHistory.service unavailable:', e.message);
}

function getErrorMessage(err) {
  return err && err.message ? err.message : 'Unknown error';
}

function isDev() {
  return process.env.NODE_ENV !== 'production';
}

function parseLimit(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getDbHistoryMethod() {
  if (!marketHistoryService) return null;

  const candidates = [
    'getLatestMarketHistory',
    'getHistory',
    'getMarketHistory',
    'fetchHistory',
    'getAll'
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const name = candidates[i];
    if (typeof marketHistoryService[name] === 'function') {
      return {
        name: name,
        fn: marketHistoryService[name].bind(marketHistoryService)
      };
    }
  }

  return null;
}

function normalizeServiceEnvelope(result) {
  if (!isObject(result)) {
    return {
      data: result,
      cached: false,
      usedFallback: false
    };
  }

  return {
    data: hasOwn(result, 'data') ? result.data : result,
    cached: !!(result._cached || result.cached),
    usedFallback: !!(result._fallback || result.usedFallback || result._usedFallback)
  };
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return undefined;
}

function toIsoOrNull(dateLike) {
  if (dateLike === null || typeof dateLike === 'undefined' || dateLike === '') return null;
  const d = new Date(dateLike);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatFaDate(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('fa-IR').format(d);
  } catch (_e) {
    return d.toISOString().slice(0, 10);
  }
}

function formatFaTime(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(d);
  } catch (_e) {
    return d.toISOString().slice(11, 19);
  }
}

function coalesce() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i];
    if (value !== null && typeof value !== 'undefined') {
      return value;
    }
  }
  return null;
}

/**
 * Safe numeric coercion.
 * Returns null when value is missing/invalid (does NOT force 0).
 */
function toNumber(value, asInteger) {
  if (value === null || typeof value === 'undefined' || value === '') return null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return asInteger ? Math.trunc(value) : value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) return null;
    const parsed = asInteger ? parseInt(cleaned, 10) : parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function round2(value) {
  if (value === null || typeof value === 'undefined' || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function calcChangePercent(value, change) {
  if (value === null || change === null) return null;
  const previous = value - change;
  if (!previous) return 0;
  return round2((change / previous) * 100);
}

function deriveIsMarketOpen(raw) {
  // The Tehran regular session is Sunday through Thursday, 09:00–12:30.
  // Outside that window the market must be reported as closed, even if an
  // upstream/cached payload incorrectly says "open".
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date());

    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const weekday = values.weekday;
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    const totalMinutes = hour * 60 + minute;
    const tradingDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'].includes(weekday);
    const inRegularSession = tradingDay && totalMinutes >= 9 * 60 && totalMinutes < 12 * 60 + 30;

    if (!inRegularSession) return false;
  } catch (_error) {
    return false;
  }

  const explicit = normalizeBoolean(
    coalesce(raw.isMarketOpen, raw.marketOpen, raw.is_open, raw.open)
  );
  if (typeof explicit === 'boolean') return explicit;

  const stateRaw = coalesce(raw.marketState, raw.state, raw.market_status, raw.status);
  if (stateRaw !== null && typeof stateRaw !== 'undefined' && stateRaw !== '') {
    const state = String(stateRaw).toLowerCase();
    if (state.indexOf('open') !== -1 || state.indexOf('trading') !== -1 || state.indexOf('continuous') !== -1 || state.indexOf('باز') !== -1) return true;
    if (state.indexOf('close') !== -1 || state.indexOf('closed') !== -1 || state.indexOf('end') !== -1 || state.indexOf('بسته') !== -1) return false;
  }

  return true;
}

/**
 * Supports:
 * 1) already-parsed index payload (getLatestMarketHistory)
 * 2) Prisma record with jsonData string
 * 3) { id, data, createdAt } history rows
 */
function extractDbSnapshot(snapshot) {
  if (!snapshot || !isObject(snapshot)) {
    return { payload: null, createdAt: null };
  }

  const createdAt = coalesce(
    snapshot._createdAt,
    snapshot.snapshotCreatedAt,
    snapshot.createdAt,
    snapshot.updatedAt,
    snapshot.lastUpdate
  );

  // History row shape from getMarketHistory
  if (hasOwn(snapshot, 'data')) {
    if (isObject(snapshot.data)) {
      return { payload: snapshot.data, createdAt: createdAt };
    }
    if (typeof snapshot.data === 'string' && snapshot.data.trim()) {
      try {
        const parsedNested = JSON.parse(snapshot.data);
        return {
          payload: isObject(parsedNested) ? parsedNested : null,
          createdAt: createdAt
        };
      } catch (_e) {
        return { payload: null, createdAt: createdAt };
      }
    }
  }

  // Prisma-like record still containing jsonData
  if (typeof snapshot.jsonData === 'string' && snapshot.jsonData.trim()) {
    try {
      const parsed = JSON.parse(snapshot.jsonData);
      return {
        payload: isObject(parsed) ? parsed : null,
        createdAt: createdAt
      };
    } catch (_e) {
      return { payload: null, createdAt: createdAt };
    }
  }

  // Already a usable market-index-like object
  if (
    hasOwn(snapshot, 'index') ||
    hasOwn(snapshot, 'value') ||
    hasOwn(snapshot, 'marketValue') ||
    hasOwn(snapshot, 'mv') ||
    hasOwn(snapshot, 'indexEqualWeight') ||
    hasOwn(snapshot, 'index_equalWeight')
  ) {
    return { payload: snapshot, createdAt: createdAt };
  }

  return { payload: snapshot, createdAt: createdAt };
}

/**
 * Normalize any BRS/DB/raw payload into a stable frontend contract.
 * Critical: `index` must be a number for MarketIndex.tsx.
 */
function normalizeMarketIndexPayload(raw, fallbackCreatedAt) {
  if (!isObject(raw)) return null;

  // If envelope accidentally nested again
  if (isObject(raw.data) && !hasOwn(raw, 'index') && !hasOwn(raw, 'value') && !hasOwn(raw, 'mv')) {
    return normalizeMarketIndexPayload(raw.data, fallbackCreatedAt);
  }

  const derivedCreatedAt = coalesce(
    raw._createdAt,
    raw.snapshotCreatedAt,
    raw.createdAt,
    raw.updatedAt,
    raw.lastUpdate,
    fallbackCreatedAt
  );

  const isoLastUpdate =
    toIsoOrNull(raw.lastUpdate) ||
    toIsoOrNull(derivedCreatedAt) ||
    new Date().toISOString();

  const index = toNumber(
    coalesce(raw.index, raw.value, raw.marketIndex, raw.indexValue, raw.lastIndex),
    false
  );

  const indexChange = toNumber(
    coalesce(
      raw.indexChange,
      raw.index_change,
      raw.changeValue,
      raw.change,
      raw.marketIndexChange
    ),
    false
  );

  const indexEqualWeight = toNumber(
    coalesce(
      raw.indexEqualWeight,
      raw.index_equalWeight,
      raw.equalWeightedValue,
      raw.equalWeightedIndex,
      raw.equalWeightIndex
    ),
    false
  );

  const indexEqualWeightChange = toNumber(
    coalesce(
      raw.indexEqualWeightChange,
      raw.index_equalWeight_change,
      raw.equalWeightedChangeValue,
      raw.equalWeightedChange,
      raw.equalWeightedIndexChange,
      raw.equalWeightIndexChange
    ),
    false
  );

  let changePercent = toNumber(
    coalesce(raw.changePercent, raw.indexChangePercent, raw.percentChange),
    false
  );
  if (changePercent === null) {
    changePercent = calcChangePercent(index, indexChange);
  } else {
    changePercent = round2(changePercent);
  }

  let equalWeightedChangePercent = toNumber(
    coalesce(
      raw.equalWeightedChangePercent,
      raw.equalWeightChangePercent,
      raw.indexEqualWeightChangePercent
    ),
    false
  );
  if (equalWeightedChangePercent === null) {
    equalWeightedChangePercent = calcChangePercent(indexEqualWeight, indexEqualWeightChange);
  } else {
    equalWeightedChangePercent = round2(equalWeightedChangePercent);
  }

  const mv = toNumber(
    coalesce(raw.mv, raw.marketValue, raw.totalMarketValue),
    false
  );
  const tno = toNumber(
    coalesce(raw.tno, raw.tradeCount, raw.totalTrades),
    true
  );
  const tval = toNumber(
    coalesce(raw.tval, raw.tradeValue, raw.totalTradeValue),
    false
  );
  const tvol = toNumber(
    coalesce(raw.tvol, raw.tradeVolume, raw.totalTradeVolume, raw.volume),
    false
  );

  const marketState = coalesce(
    raw.marketState,
    raw.state,
    raw.market_status,
    raw.status
  );

  const isMarketOpen = deriveIsMarketOpen(raw);

  const date =
    (typeof raw.date === 'string' && raw.date) || formatFaDate(isoLastUpdate);
  const time =
    (typeof raw.time === 'string' && raw.time) || formatFaTime(isoLastUpdate);

  // Stable payload: raw aliases + frontend aliases
  return {
    // Core metrics (numeric or null)
    index: index,
    index_change: indexChange,
    indexChange: indexChange,

    mv: mv,
    marketValue: mv,
    tno: tno,
    tradeCount: tno,
    tval: tval,
    tradeValue: tval,
    tvol: tvol,
    tradeVolume: tvol,
    volume: tvol,

    indexEqualWeight: indexEqualWeight,
    index_equalWeight: indexEqualWeight,
    indexEqualWeightChange: indexEqualWeightChange,
    index_equalWeight_change: indexEqualWeightChange,

    // Frontend / types.ts compatible
    value: index,
    changeValue: indexChange,
    change: indexChange,
    changePercent: changePercent,
    equalWeightedValue: indexEqualWeight,
    equalWeightedChangeValue: indexEqualWeightChange,
    equalWeightedChange: indexEqualWeightChange,
    equalWeightedChangePercent: equalWeightedChangePercent,

    // State / timestamps
    isMarketOpen: isMarketOpen,
    marketState: marketState,
    state: marketState,
    lastUpdate: isoLastUpdate,
    date: date,
    time: time
  };
}

function hasUsableMarketIndexData(payload) {
  if (!isObject(payload)) return false;

  const metricCandidates = [
    payload.index,
    payload.value,
    payload.indexChange,
    payload.index_change,
    payload.changeValue,
    payload.mv,
    payload.marketValue,
    payload.tno,
    payload.tradeCount,
    payload.tval,
    payload.tradeValue,
    payload.tvol,
    payload.tradeVolume,
    payload.indexEqualWeight,
    payload.equalWeightedValue,
    payload.indexEqualWeightChange,
    payload.equalWeightedChangeValue,
    payload.changePercent,
    payload.equalWeightedChangePercent
  ];

  const hasMetrics = metricCandidates.some(function (value) {
    return typeof value === 'number' && Number.isFinite(value);
  });

  const hasState =
    typeof payload.isMarketOpen === 'boolean' ||
    (payload.marketState !== null &&
      typeof payload.marketState !== 'undefined' &&
      String(payload.marketState).trim() !== '') ||
    (payload.state !== null &&
      typeof payload.state !== 'undefined' &&
      String(payload.state).trim() !== '');

  return hasMetrics || hasState;
}

async function getLatestMarketSnapshotFallback() {
  if (!marketHistoryService) return null;

  // Preferred dedicated method
  if (typeof marketHistoryService.getLatestMarketHistory === 'function') {
    const latest = await marketHistoryService.getLatestMarketHistory();
    const extracted = extractDbSnapshot(latest);
    const normalized = normalizeMarketIndexPayload(extracted.payload, extracted.createdAt);
    return hasUsableMarketIndexData(normalized) ? normalized : null;
  }

  const dbMethod = getDbHistoryMethod();
  if (!dbMethod) return null;

  let result;
  if (dbMethod.name === 'getLatestMarketHistory') {
    result = await dbMethod.fn();
  } else {
    result = await dbMethod.fn({ limit: 1 });
  }

  const firstItem = Array.isArray(result) ? result[0] : result;
  const extracted = extractDbSnapshot(firstItem);
  const normalized = normalizeMarketIndexPayload(extracted.payload, extracted.createdAt);

  return hasUsableMarketIndexData(normalized) ? normalized : null;
}

function isAdminLikeRequest(req) {
  if (!req || !req.user) return false;

  const role =
    req.user.role ||
    req.user.Role ||
    req.user.roleName ||
    req.user.type ||
    '';

  return String(role).toLowerCase() === 'admin' || req.user.isAdmin === true;
}

function isInternalRequest(req) {
  const provided =
    req.headers['x-internal-secret'] ||
    req.headers['x-cron-secret'] ||
    req.query.internalSecret ||
    (req.body && req.body.internalSecret);

  return (
    !!process.env.INTERNAL_CRON_SECRET &&
    provided === process.env.INTERNAL_CRON_SECRET
  );
}

function ensurePrivilegedAccess(req, res) {
  if (isAdminLikeRequest(req) || isInternalRequest(req)) {
    return true;
  }

  res.status(403).json({
    success: false,
    message: 'دسترسی مجاز نیست'
  });
  return false;
}

// GET /api/market/index
async function getMarketIndex(req, res) {
  // Shared DB is the only user-facing source for the market index.
  // BRS/TSETMC refreshes are performed by the central market worker,
  // not by individual dashboard requests.
  if (!sharedMarketService || typeof sharedMarketService.getMarketCurrent !== 'function') {
    return res.status(503).json({
      success: false,
      message: 'سرویس داده مشترک بازار در دسترس نیست',
      code: 'SHARED_MARKET_SERVICE_UNAVAILABLE'
    });
  }

  try {
    const snapshot = await sharedMarketService.getMarketCurrent();

    if (!snapshot) {
      return res.status(503).json({
        success: false,
        message: 'هنوز داده‌ای از بازار در دیتابیس مشترک ثبت نشده است',
        code: 'NO_SHARED_MARKET_DATA'
      });
    }

    const stableData = normalizeMarketIndexPayload({
      date: snapshot.marketDate,
      time: snapshot.updatedAt,
      state: snapshot.marketStatus,
      index: snapshot.overallIndex,
      indexChange: snapshot.overallChange,
      indexEqualWeight: snapshot.equalIndex,
      indexEqualWeightChange: snapshot.equalChange,
      tradeCount: snapshot.totalTrades,
      tradeVolume: snapshot.totalVolume,
      tradeValue: snapshot.totalValue,
      volume: snapshot.totalVolume,
      isMarketOpen: String(snapshot.marketStatus || '').toLowerCase().includes('open'),
      lastUpdate: snapshot.updatedAt,
      source: snapshot.source || 'shared-db',
      isStale: snapshot.isStale
    }, snapshot.updatedAt);

    if (!hasUsableMarketIndexData(stableData)) {
      return res.status(503).json({
        success: false,
        message: 'داده شاخص بازار در دیتابیس مشترک کامل نیست',
        code: 'INVALID_SHARED_MARKET_DATA'
      });
    }

    return res.json({
      success: true,
      data: stableData,
      cached: true,
      stale: !!snapshot.isStale,
      source: 'shared-db',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[MARKET CTRL v7.0] Shared market index error:', getErrorMessage(err));
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت شاخص بازار از دیتابیس مشترک',
      code: 'SHARED_MARKET_READ_ERROR',
      error: isDev() ? getErrorMessage(err) : undefined
    });
  }
}

// GET /api/market/symbol/:name
async function getSymbolData(req, res) {
  if (!sharedMarketService || typeof sharedMarketService.getSymbols !== 'function') {
    return res.status(503).json({
      success: false,
      message: 'سرویس داده مشترک بازار در دسترس نیست',
      code: 'SHARED_MARKET_SERVICE_UNAVAILABLE'
    });
  }

  const symbol = req.params.name || req.query.symbol || req.query.l18;
  if (!symbol) {
    return res.status(400).json({
      success: false,
      message: 'نام نماد الزامی است',
      example: '/api/market/symbol/فولاد'
    });
  }

  try {
    const rows = await sharedMarketService.getSymbols({ symbol, limit: 1 });
    const data = rows[0] || null;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'نماد در داده مشترک بازار پیدا نشد',
        code: 'SYMBOL_NOT_FOUND'
      });
    }

    return res.json({
      success: true,
      data,
      cached: true,
      stale: !!data.isStale,
      source: 'shared-db',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[MARKET CTRL v8.0] Shared symbol error (' + symbol + '):', getErrorMessage(err));
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت اطلاعات نماد',
      code: 'SHARED_SYMBOL_READ_ERROR',
      error: isDev() ? getErrorMessage(err) : undefined
    });
  }
}

// GET /api/market/history/:name
async function getSymbolHistory(req, res) {
  if (!sharedMarketService || typeof sharedMarketService.getSymbolHistory !== 'function') {
    return res.status(503).json({
      success: false,
      message: 'سرویس تاریخچه مشترک بازار در دسترس نیست',
      code: 'SHARED_HISTORY_SERVICE_UNAVAILABLE'
    });
  }

  const symbol = req.params.name || req.query.symbol || req.query.l18;
  if (!symbol) {
    return res.status(400).json({
      success: false,
      message: 'نام نماد الزامی است',
      example: '/api/market/history/فولاد?limit=60'
    });
  }

  const limit = parseLimit(req.query.limit || req.query.days) || 60;

  try {
    const data = await sharedMarketService.getSymbolHistory(symbol, limit);

    return res.json({
      success: true,
      data,
      total: data.length,
      limited: data.length >= limit,
      symbol,
      source: 'shared-db',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[MARKET CTRL v8.1] Shared history error (' + symbol + '):', getErrorMessage(err));
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت تاریخچه نماد',
      code: 'SHARED_HISTORY_READ_ERROR',
      error: isDev() ? getErrorMessage(err) : undefined
    });
  }
}

// GET /api/market/history
async function getMarketHistory(req, res) {
  const symbol = req.query.symbol || req.query.l18;

  if (!symbol) {
    return res.status(400).json({
      success: false,
      message: 'نام نماد الزامی است',
      example: '/api/market/history?symbol=فولاد&limit=60'
    });
  }

  return getSymbolHistory({
    ...req,
    params: { ...(req.params || {}), name: symbol }
  }, res);
}

// GET /api/market/symbols
async function getAllSymbols(req, res) {
  if (!sharedMarketService || typeof sharedMarketService.getSymbols !== 'function') {
    return res.status(503).json({
      success: false,
      message: 'سرویس داده مشترک بازار در دسترس نیست',
      code: 'SHARED_MARKET_SERVICE_UNAVAILABLE'
    });
  }

  try {
    const data = await sharedMarketService.getSymbols({
      limit: parseLimit(req.query.limit) || 5000
    });

    return res.json({
      success: true,
      data,
      total: data.length,
      source: 'shared-db',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[MARKET CTRL v8.0] Shared symbols error:', getErrorMessage(err));
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت لیست نمادها',
      code: 'SHARED_SYMBOLS_READ_ERROR',
      error: isDev() ? getErrorMessage(err) : undefined
    });
  }
}

// GET /api/market/search?q=فولاد
async function searchSymbols(req, res) {
  if (!sharedMarketService || typeof sharedMarketService.searchSymbols !== 'function') {
    return res.status(503).json({
      success: false,
      message: 'سرویس داده مشترک بازار در دسترس نیست',
      code: 'SHARED_MARKET_SERVICE_UNAVAILABLE'
    });
  }

  const query = req.query.q || req.query.query || req.query.search;
  if (!query) {
    return res.status(400).json({
      success: false,
      message: 'عبارت جستجو الزامی است',
      example: '/api/market/search?q=فولاد'
    });
  }

  try {
    const data = await sharedMarketService.searchSymbols(query, parseLimit(req.query.limit) || 50);

    return res.json({
      success: true,
      data,
      total: data.length,
      query,
      source: 'shared-db',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[MARKET CTRL v8.0] Shared symbol search error (' + query + '):', getErrorMessage(err));
    return res.status(500).json({
      success: false,
      message: 'خطا در جستجوی نماد',
      code: 'SHARED_SYMBOL_SEARCH_ERROR',
      error: isDev() ? getErrorMessage(err) : undefined
    });
  }
}

// GET /api/market/debug
function debugMarketData(req, res) {
  if (!ensurePrivilegedAccess(req, res)) return;

  const sharedMethods = sharedMarketService
    ? Object.keys(sharedMarketService).filter(function (key) {
        return typeof sharedMarketService[key] === 'function';
      })
    : [];

  return res.json({
    success: true,
    version: '8.0',
    source: 'shared-db',
    services: {
      sharedMarketService: !!sharedMarketService,
      sharedMarketServiceMethods: sharedMethods
    },
    env: {
      NODE_ENV: process.env.NODE_ENV || 'not set'
    },
    timestamp: new Date().toISOString()
  });
}

// POST /api/market/cache/clear
function clearCacheEndpoint(req, res) {
  if (!ensurePrivilegedAccess(req, res)) return;

  return res.json({
    success: true,
    message: 'کش درخواست‌های بازار در این معماری مستقل است؛ داده‌ها از دیتابیس مشترک خوانده می‌شوند.',
    source: 'shared-db',
    cleared: 0,
    timestamp: new Date().toISOString()
  });
}


// Backward-compatible handlers for /api/market-history routes.
async function getHistory(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const records = await marketHistoryService.getMarketHistory(page * limit);
    const start = (page - 1) * limit;
    const data = records.slice(start, start + limit).map((record) => ({
      id: record?._recordId ?? record?.id ?? null,
      data: record,
      createdAt: record?._createdAt ?? record?.createdAt ?? null
    }));
    return res.json({ success: true, data, pagination: { page, limit, total: data.length < limit ? start + data.length : null, totalPages: data.length < limit ? Math.ceil((start + data.length) / limit) : null }, source: 'legacy-market-history' });
  } catch (error) {
    console.error('[MARKET-HISTORY] GET / error:', getErrorMessage(error));
    return res.status(500).json({ success: false, message: 'خطا در دریافت تاریخچه بازار' });
  }
}

async function create(req, res) {
  try {
    const data = req.body && Object.prototype.hasOwnProperty.call(req.body, 'data') ? req.body.data : req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ success: false, message: 'داده تاریخچه الزامی است' });
    const record = await marketHistoryService.saveMarketSnapshot(data);
    if (!record) return res.status(422).json({ success: false, message: 'داده تاریخچه قابل ذخیره نیست' });
    return res.status(201).json({ success: true, data: { id: record?._recordId ?? record?.id ?? null, data: record, createdAt: record?._createdAt ?? record?.createdAt ?? null }, message: 'ذخیره شد' });
  } catch (error) {
    console.error('[MARKET-HISTORY] POST / error:', getErrorMessage(error));
    return res.status(500).json({ success: false, message: 'خطا در ذخیره داده' });
  }
}

async function getLatest(req, res) {
  try {
    const latest = await marketHistoryService.getLatestMarketHistory();
    if (!latest) return res.json({ success: true, data: null });
    return res.json({ success: true, data: { id: latest?._recordId ?? latest?.id ?? null, data: latest, createdAt: latest?._createdAt ?? latest?.createdAt ?? null }, source: 'legacy-market-history' });
  } catch (error) {
    console.error('[MARKET-HISTORY] GET /latest error:', getErrorMessage(error));
    return res.status(500).json({ success: false, message: 'خطا در دریافت آخرین رکورد' });
  }
}

module.exports = {
  getMarketIndex,
  getSymbolData,
  getSymbolHistory,
  getMarketHistory,
  getAllSymbols,
  searchSymbols,
  debugMarketData,
  clearCache: clearCacheEndpoint,

  // backward-compatible aliases
  index: getMarketIndex,
  history: getMarketHistory,
  debug: debugMarketData,
  getHistory,
  create,
  getLatest
};
