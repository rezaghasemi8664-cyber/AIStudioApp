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

let brsService = null;
try {
  brsService = require('../services/brs.service.cjs');
  console.log('[MARKET CTRL v6.1] brs.service loaded');
} catch (e) {
  console.error('[MARKET CTRL v6.1] brs.service load failed:', e.message);
}

let marketHistoryService = null;
try {
  marketHistoryService = require('../services/marketHistory.service.cjs');
  console.log('[MARKET CTRL v6.1] marketHistory.service loaded');
} catch (e) {
  console.warn('[MARKET CTRL v6.1] marketHistory.service unavailable:', e.message);
}

let endpoints = {};
try {
  endpoints = require('../config/defaultEndpoints.cjs');
} catch (_e) {
  endpoints = {};
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

function getEndpointUrl(name) {
  const value = endpoints && endpoints[name];
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.url === 'string') return value.url;
  return '';
}

function maskApiKeyInUrl(url) {
  if (!url || typeof url !== 'string') return '';

  return url
    .replace(/([?&]key=)([^&]+)/i, '$1***')
    .replace(/([?&]api[_-]?key=)([^&]+)/i, '$1***')
    .replace(/([?&]token=)([^&]+)/i, '$1***');
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

async function callMarketIndex() {
  if (!brsService) {
    const err = new Error('BRS service not available');
    err.statusCode = 503;
    throw err;
  }

  if (typeof brsService.getMarketIndex === 'function') {
    return brsService.getMarketIndex();
  }

  if (typeof brsService.fetchIndex === 'function') {
    return brsService.fetchIndex();
  }

  const err = new Error('No compatible BRS market index method found');
  err.statusCode = 500;
  throw err;
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
  const explicit = normalizeBoolean(
    coalesce(raw.isMarketOpen, raw.marketOpen, raw.is_open, raw.open)
  );
  if (typeof explicit === 'boolean') return explicit;

  const stateRaw = coalesce(raw.marketState, raw.state, raw.market_status, raw.status);
  if (stateRaw === null || typeof stateRaw === 'undefined' || stateRaw === '') {
    return undefined;
  }

  const state = String(stateRaw).toLowerCase();

  if (
    state.indexOf('open') !== -1 ||
    state.indexOf('trading') !== -1 ||
    state.indexOf('continuous') !== -1 ||
    state.indexOf('باز') !== -1
  ) {
    return true;
  }

  if (
    state.indexOf('close') !== -1 ||
    state.indexOf('closed') !== -1 ||
    state.indexOf('end') !== -1 ||
    state.indexOf('بسته') !== -1
  ) {
    return false;
  }

  return undefined;
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
  let upstreamError = null;

  try {
    const result = await callMarketIndex();
    const envelope = normalizeServiceEnvelope(result);
    const stableData = normalizeMarketIndexPayload(envelope.data);

    if (hasUsableMarketIndexData(stableData)) {
      return res.json({
        success: true,
        data: stableData,
        cached: envelope.cached,
        source: envelope.usedFallback ? 'db-fallback' : 'brs-api',
        message: envelope.usedFallback
          ? 'داده‌ها از آخرین ذخیره‌سازی نمایش داده می‌شوند'
          : 'موفق',
        timestamp: new Date().toISOString()
      });
    }

    upstreamError = new Error('Market index payload is empty or unusable');
    upstreamError.statusCode = 502;
  } catch (err) {
    upstreamError = err;
    console.error('[MARKET CTRL v6.1] Index upstream error:', getErrorMessage(err));
  }

  try {
    const fallbackData = await getLatestMarketSnapshotFallback();

    if (hasUsableMarketIndexData(fallbackData)) {
      return res.json({
        success: true,
        data: fallbackData,
        cached: true,
        source: 'db-fallback',
        message: 'داده‌ها از آخرین ذخیره‌سازی نمایش داده می‌شوند',
        timestamp: new Date().toISOString()
      });
    }
  } catch (fallbackErr) {
    console.error('[MARKET CTRL v6.1] DB fallback error:', getErrorMessage(fallbackErr));
  }

  return res
    .status(upstreamError && upstreamError.statusCode ? upstreamError.statusCode : 502)
    .json({
      success: false,
      message: 'در حال حاضر داده‌ای برای نمایش موجود نیست. لطفا دقایقی دیگر تلاش کنید.',
      code: 'NO_MARKET_DATA',
      error: isDev() ? getErrorMessage(upstreamError) : undefined
    });
}

// GET /api/market/symbol/:name
async function getSymbolData(req, res) {
  if (!brsService || typeof brsService.getSymbolData !== 'function') {
    return res.status(503).json({
      success: false,
      message: 'سرویس BRS برای دریافت اطلاعات نماد در دسترس نیست'
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
    const result = await brsService.getSymbolData(symbol);

    return res.json({
      success: true,
      data: hasOwn(result, 'data') ? result.data : result,
      cached: !!(result && result._cached),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[MARKET CTRL v6.1] Symbol error (' + symbol + '):', getErrorMessage(err));

    return res.status(502).json({
      success: false,
      message: 'خطا در دریافت اطلاعات نماد: ' + symbol,
      error: isDev() ? getErrorMessage(err) : undefined
    });
  }
}

// GET /api/market/history/:name
async function getSymbolHistory(req, res) {
  if (!brsService || typeof brsService.getSymbolHistory !== 'function') {
    return res.status(503).json({
      success: false,
      message: 'سرویس BRS برای دریافت تاریخچه نماد در دسترس نیست'
    });
  }

  const symbol = req.params.name || req.query.symbol || req.query.l18;
  if (!symbol) {
    return res.status(400).json({
      success: false,
      message: 'نام نماد الزامی است',
      example: '/api/market/history/فولاد?limit=30'
    });
  }

  const limit = parseLimit(req.query.limit);

  try {
    const result = await brsService.getSymbolHistory(symbol, limit);

    return res.json({
      success: true,
      data: hasOwn(result, 'data') ? result.data : result,
      total: result && typeof result.total !== 'undefined' ? result.total : undefined,
      limited: result && typeof result.limited !== 'undefined' ? result.limited : undefined,
      symbol: symbol,
      cached: !!(result && result._cached),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[MARKET CTRL v6.1] History error (' + symbol + '):', getErrorMessage(err));

    return res.status(502).json({
      success: false,
      message: 'خطا در دریافت تاریخچه: ' + symbol,
      error: isDev() ? getErrorMessage(err) : undefined
    });
  }
}

// GET /api/market/history
async function getMarketHistory(req, res) {
  const symbol = req.query.symbol || req.query.l18;

  if (symbol) {
    if (!brsService || typeof brsService.getSymbolHistory !== 'function') {
      return res.status(503).json({
        success: false,
        message: 'سرویس BRS برای دریافت تاریخچه نماد در دسترس نیست'
      });
    }

    const limit = parseLimit(req.query.limit || req.query.days);

    try {
      const result = await brsService.getSymbolHistory(symbol, limit);

      return res.json({
        success: true,
        data: hasOwn(result, 'data') ? result.data : result,
        total: result && typeof result.total !== 'undefined' ? result.total : undefined,
        limited: result && typeof result.limited !== 'undefined' ? result.limited : undefined,
        source: 'brs-api',
        cached: !!(result && result._cached),
        symbol: symbol,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      return res.status(502).json({
        success: false,
        message: 'خطا در دریافت تاریخچه',
        error: isDev() ? getErrorMessage(err) : undefined
      });
    }
  }

  const dbMethod = getDbHistoryMethod();
  if (!dbMethod) {
    return res.status(400).json({
      success: false,
      message: 'نام نماد الزامی است',
      example: '/api/market/history?symbol=فولاد&limit=30',
      alternativeExample: '/api/market/history/فولاد?limit=30'
    });
  }

  try {
    let data;

    if (dbMethod.name === 'getLatestMarketHistory') {
      data = await dbMethod.fn();
    } else {
      data = await dbMethod.fn(req.query);
    }

    return res.json({
      success: true,
      data: data,
      source: 'database',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت تاریخچه از دیتابیس',
      error: isDev() ? getErrorMessage(err) : undefined
    });
  }
}

// GET /api/market/symbols
async function getAllSymbols(req, res) {
  if (!brsService || typeof brsService.getAllSymbols !== 'function') {
    return res.status(503).json({
      success: false,
      message: 'سرویس BRS برای دریافت لیست نمادها در دسترس نیست'
    });
  }

  try {
    const result = await brsService.getAllSymbols();

    return res.json({
      success: true,
      data: hasOwn(result, 'data') ? result.data : result,
      total: result && typeof result.total !== 'undefined' ? result.total : undefined,
      cached: !!(result && result._cached),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[MARKET CTRL v6.1] AllSymbols error:', getErrorMessage(err));

    return res.status(502).json({
      success: false,
      message: 'خطا در دریافت لیست نمادها',
      error: isDev() ? getErrorMessage(err) : undefined
    });
  }
}

// GET /api/market/search?q=فولاد
async function searchSymbols(req, res) {
  if (!brsService || typeof brsService.searchSymbols !== 'function') {
    return res.status(503).json({
      success: false,
      message: 'سرویس BRS برای جستجوی نماد در دسترس نیست'
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
    const result = await brsService.searchSymbols(query);

    return res.json({
      success: true,
      data: hasOwn(result, 'data') ? result.data : result,
      total: result && typeof result.total !== 'undefined' ? result.total : undefined,
      query: result && typeof result.query !== 'undefined' ? result.query : query,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[MARKET CTRL v6.1] Search error (' + query + '):', getErrorMessage(err));

    return res.status(502).json({
      success: false,
      message: 'خطا در جستجوی نماد',
      error: isDev() ? getErrorMessage(err) : undefined
    });
  }
}

// GET /api/market/debug
function debugMarketData(req, res) {
  if (!ensurePrivilegedAccess(req, res)) return;

  const cacheStats =
    brsService && typeof brsService.getCacheStats === 'function'
      ? brsService.getCacheStats()
      : {};

  const serviceMethods = brsService
    ? Object.keys(brsService).filter(function (key) {
        return typeof brsService[key] === 'function';
      })
    : [];

  res.json({
    success: true,
    version: '6.1',
    api: {
      keyPresent: !!process.env.BRS_API_KEY,
      keyPreview: process.env.BRS_API_KEY
        ? process.env.BRS_API_KEY.substring(0, 4) + '...' + process.env.BRS_API_KEY.slice(-4)
        : 'NOT SET',
      endpoints: {
        index: maskApiKeyInUrl(getEndpointUrl('BRS_INDEX')),
        symbol: maskApiKeyInUrl(getEndpointUrl('BRS_SYMBOL')),
        history: maskApiKeyInUrl(getEndpointUrl('BRS_HISTORY')),
        allSymbols: maskApiKeyInUrl(getEndpointUrl('BRS_ALL_SYMBOLS'))
      }
    },
    services: {
      brsService: !!brsService,
      brsServiceMethods: serviceMethods,
      marketHistoryService: !!marketHistoryService,
      marketHistoryServiceMethods: marketHistoryService
        ? Object.keys(marketHistoryService).filter(function (key) {
            return typeof marketHistoryService[key] === 'function';
          })
        : []
    },
    cache: cacheStats,
    env: {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      BRS_API_KEY: process.env.BRS_API_KEY ? 'SET' : 'NOT SET'
    },
    timestamp: new Date().toISOString()
  });
}

// POST /api/market/cache/clear
function clearCacheEndpoint(req, res) {
  if (!ensurePrivilegedAccess(req, res)) return;

  let cleared = 0;

  if (brsService && typeof brsService.clearCache === 'function') {
    cleared = brsService.clearCache();
  }

  return res.json({
    success: true,
    message: 'کش پاک شد (' + cleared + ' آیتم)',
    cleared: cleared,
    timestamp: new Date().toISOString()
  });
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
  debug: debugMarketData
};
