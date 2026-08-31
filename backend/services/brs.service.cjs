'use strict';

var endpoints = require('../config/defaultEndpoints.cjs');

var cache = {};
var lastKnownGoodMarketIndex = null;

var CACHE_TTL = {
  index: 2 * 60 * 1000,
  symbol: 60 * 1000,
  history: 5 * 60 * 1000,
  candlestick: 5 * 60 * 1000,
  allSymbols: 10 * 60 * 1000,
  marketSummary: 5 * 60 * 1000
};

var HTTP_TIMEOUT_MS = parseInt(process.env.BRS_TIMEOUT_MS, 10) || 15000;
var HTTP_RETRY_COUNT = parseInt(process.env.BRS_RETRY_COUNT, 10) || 2;
var HTTP_RETRY_DELAY_MS = parseInt(process.env.BRS_RETRY_DELAY_MS, 10) || 1200;

var TEHRAN_TIME_ZONE = 'Asia/Tehran';
var MARKET_OPEN_MINUTE = 9 * 60;
var MARKET_CLOSE_MINUTE = 12 * 60 + 30;

var CLOSED_STATES = [
  'بسته',
  'close',
  'closed',
  'pre-open',
  'pre open',
  'preopen',
  'پیش‌گشایش',
  'پیش گشایش'
];

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback === undefined ? null : fallback;
  }
  var parsed = parseFloat(value);
  if (Number.isFinite(parsed)) return parsed;
  return fallback === undefined ? null : fallback;
}

function toInt(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback === undefined ? null : fallback;
  }
  var parsed = parseInt(value, 10);
  if (Number.isFinite(parsed)) return parsed;
  return fallback === undefined ? null : fallback;
}

function nz(value, fallback) {
  return value === null || value === undefined ? fallback : value;
}

function isoNow() {
  return new Date().toISOString();
}

function maskUrl(url) {
  try {
    var parsed = new URL(url);
    if (parsed.searchParams.has('key')) {
      parsed.searchParams.set('key', '***');
    }
    return parsed.toString();
  } catch (error) {
    return url;
  }
}

function getApiKey() {
  return (process.env.BRS_API_KEY || '').trim();
}

function ensureApiKey() {
  var key = getApiKey();
  if (!key) throw new Error('BRS_API_KEY is missing in environment');
  return key;
}

function normalizeSymbolInput(symbol) {
  if (symbol == null) {
    throw new Error('Symbol name is required');
  }

  var symbolClean = String(symbol).trim();
  if (!symbolClean) {
    throw new Error('Symbol name is required');
  }

  return symbolClean;
}

function resolveEndpointRawUrl(endpointDef, symbolClean) {
  var rawUrl = '';

  if (typeof endpointDef === 'function') {
    rawUrl = endpointDef(symbolClean);
  } else if (endpointDef && typeof endpointDef.url === 'function') {
    rawUrl = endpointDef.url(symbolClean);
  } else if (typeof endpointDef === 'string') {
    rawUrl = endpointDef;
  } else if (endpointDef && typeof endpointDef.url === 'string') {
    rawUrl = endpointDef.url;
  }

  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('BRS endpoint url is invalid');
  }

  return rawUrl;
}

function ensureQueryParam(parsed, key, value) {
  if (value === undefined || value === null || value === '') return;
  parsed.searchParams.set(key, String(value));
}

function removeQueryParams(parsed, keys) {
  if (!parsed || !parsed.searchParams || !Array.isArray(keys)) return;

  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    if (key) parsed.searchParams.delete(key);
  }
}

function replaceKnownPlaceholders(rawUrl, values) {
  var result = String(rawUrl || '');

  var keys = Object.keys(values || {});
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    var value = values[key];
    var encoded = value == null ? '' : encodeURIComponent(String(value));

    result = result
      .replace(new RegExp('\\{' + key + '\\}', 'gi'), encoded)
      .replace(new RegExp('\\{\\{' + key + '\\}\\}', 'gi'), encoded)
      .replace(new RegExp(':' + key + '\\b', 'gi'), encoded);
  }

  return result;
}

function validateNoUnresolvedPlaceholders(finalUrl) {
  if (
    finalUrl.indexOf('{symbol}') !== -1 ||
    finalUrl.indexOf('{apiKey}') !== -1 ||
    finalUrl.indexOf('{count}') !== -1 ||
    finalUrl.indexOf('{type}') !== -1 ||
    finalUrl.indexOf('{date}') !== -1 ||
    /:symbol\b/i.test(finalUrl) ||
    /:apiKey\b/i.test(finalUrl) ||
    /:count\b/i.test(finalUrl) ||
    /:type\b/i.test(finalUrl) ||
    /:date\b/i.test(finalUrl) ||
    /%7Bsymbol%7D/i.test(finalUrl) ||
    /%7Bdate%7D/i.test(finalUrl)
  ) {
    throw new Error('Unresolved placeholder in endpoint URL');
  }
}

function buildEndpointUrl(endpointDef, options) {
  if (!endpointDef) {
    throw new Error('BRS endpoint is not configured');
  }

  var opts = options || {};
  var apiKey = ensureApiKey();
  var symbol = opts.symbol != null ? String(opts.symbol).trim() : '';
  var count = opts.count != null ? opts.count : null;
  var type = opts.type != null ? opts.type : null;
  var date = opts.date != null ? String(opts.date).trim() : '';

  var rawUrl = resolveEndpointRawUrl(endpointDef, symbol);

  var replaced = replaceKnownPlaceholders(rawUrl, {
    apiKey: apiKey,
    symbol: symbol,
    count: count != null ? String(count) : '',
    type: type != null ? String(type) : '',
    date: date
  });

  var parsed;
  try {
    parsed = new URL(replaced);
  } catch (error) {
    throw new Error('Invalid BRS endpoint url: ' + replaced);
  }

  if (Array.isArray(opts.removeParams) && opts.removeParams.length > 0) {
    removeQueryParams(parsed, opts.removeParams);
  }

  ensureQueryParam(parsed, 'key', apiKey);

  if (opts.includeSymbolParam === true && symbol) {
    ensureQueryParam(parsed, 'l18', symbol);
  }

  if (count != null && opts.includeCountParam !== false) {
    ensureQueryParam(parsed, 'count', count);
  }

  if (type != null && opts.includeTypeParam !== false) {
    ensureQueryParam(parsed, 'type', type);
  }

  if (date) {
    ensureQueryParam(parsed, 'date', date);
  }

  if (opts.extraQuery && typeof opts.extraQuery === 'object') {
    var queryKeys = Object.keys(opts.extraQuery);
    for (var i = 0; i < queryKeys.length; i += 1) {
      var qKey = queryKeys[i];
      ensureQueryParam(parsed, qKey, opts.extraQuery[qKey]);
    }
  }

  var finalUrl = parsed.toString();
  validateNoUnresolvedPlaceholders(finalUrl);

  return finalUrl;
}

function buildSymbolEndpointUrl(endpointDef, symbolClean, opts) {
  return buildEndpointUrl(endpointDef, {
    symbol: symbolClean || '',
    count: opts && opts.count != null ? opts.count : null,
    type: opts && opts.type != null ? opts.type : null,
    date: opts && opts.date != null ? opts.date : null,
    includeSymbolParam: true,
    includeCountParam: true,
    includeTypeParam: true,
    removeParams: opts && Array.isArray(opts.removeParams) ? opts.removeParams : [],
    extraQuery: opts && opts.extraQuery ? opts.extraQuery : null
  });
}

function buildPublicEndpointUrl(endpointDef, opts) {
  return buildEndpointUrl(endpointDef, {
    symbol: '',
    count: opts && opts.count != null ? opts.count : null,
    type: opts && opts.type != null ? opts.type : null,
    date: opts && opts.date != null ? opts.date : null,
    includeSymbolParam: false,
    includeCountParam: opts && opts.includeCountParam !== false,
    includeTypeParam: opts && opts.includeTypeParam !== false,
    removeParams: (opts && Array.isArray(opts.removeParams) ? opts.removeParams : []).concat(['l18', 'symbol']),
    extraQuery: opts && opts.extraQuery ? opts.extraQuery : null
  });
}

function getPayloadBody(payload) {
  if (payload && typeof payload === 'object') {
    if (payload.data !== undefined) return payload.data;
    if (payload.result !== undefined) return payload.result;
  }
  return payload;
}

function extractArrayPayload(payload) {
  var body = getPayloadBody(payload);

  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    if (Array.isArray(body.items)) return body.items;
    if (Array.isArray(body.list)) return body.list;
    if (Array.isArray(body.rows)) return body.rows;
    if (Array.isArray(body.records)) return body.records;
    if (Array.isArray(body.candles)) return body.candles;
    if (Array.isArray(body.history)) return body.history;
    if (Array.isArray(body.daily)) return body.daily;
  }
  return null;
}

function isRetryableError(error) {
  if (!error || !error.message) return false;
  var message = String(error.message).toUpperCase();

  return (
    message.indexOf('ETIMEDOUT') !== -1 ||
    message.indexOf('ECONNRESET') !== -1 ||
    message.indexOf('ECONNREFUSED') !== -1 ||
    message.indexOf('EAI_AGAIN') !== -1 ||
    message.indexOf('ENOTFOUND') !== -1 ||
    message.indexOf('SOCKET HANG UP') !== -1 ||
    message.indexOf('BRS TIMEOUT') !== -1 ||
    message.indexOf('HTTP 429') !== -1 ||
    message.indexOf('HTTP 500') !== -1 ||
    message.indexOf('HTTP 502') !== -1 ||
    message.indexOf('HTTP 503') !== -1 ||
    message.indexOf('HTTP 504') !== -1
  );
}

function getCacheEntry(key) {
  var entry = cache[key];
  if (!entry) return null;

  var ageMs = Date.now() - entry.timestamp;
  if (ageMs > entry.ttl) {
    delete cache[key];
    return null;
  }

  return {
    key: key,
    data: entry.data,
    timestamp: entry.timestamp,
    ttl: entry.ttl,
    ageMs: ageMs,
    expiresAt: new Date(entry.timestamp + entry.ttl).toISOString(),
    fetchedAt: entry.fetchedAt || new Date(entry.timestamp).toISOString()
  };
}

function setCache(key, data, ttl, meta) {
  var now = Date.now();
  cache[key] = {
    data: data,
    timestamp: now,
    ttl: ttl,
    fetchedAt: meta && meta.fetchedAt ? meta.fetchedAt : new Date(now).toISOString()
  };
}

function clearCache() {
  var keys = Object.keys(cache);
  var count = keys.length;
  cache = {};
  console.log('[BRS SERVICE] Cache cleared (' + count + ' entries)');
  return count;
}

function getCacheStats() {
  var stats = {};
  var keys = Object.keys(cache);

  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    var entry = cache[key];
    var ageMs = Date.now() - entry.timestamp;
    var remainingMs = Math.max(0, entry.ttl - ageMs);

    stats[key] = {
      ageMs: ageMs,
      age: Math.round(ageMs / 1000) + 's',
      ttlMs: entry.ttl,
      ttl: Math.round(entry.ttl / 1000) + 's',
      remainingMs: remainingMs,
      remaining: Math.round(remainingMs / 1000) + 's',
      expired: remainingMs === 0,
      fetchedAt: entry.fetchedAt || new Date(entry.timestamp).toISOString(),
      cachedAt: new Date(entry.timestamp).toISOString()
    };
  }

  return stats;
}

function fetchBRSOnce(url, label, requestOptions) {
  var startTime = Date.now();
  var safeUrl = maskUrl(url);
  var opts = requestOptions || {};
  var method = (opts.method || 'GET').toUpperCase();
  var headers = Object.assign({}, opts.headers || {});
  var body = opts.body != null ? opts.body : null;
  var serializedBody = '';

  if (body != null) {
    if (typeof body === 'string') {
      serializedBody = body;
    } else {
      serializedBody = JSON.stringify(body);
    }
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(serializedBody);
  }

  console.log('[BRS SERVICE] ' + (label || 'Request') + ': ' + method + ' ' + safeUrl);

  return new Promise(function (resolve, reject) {
    var isHttps = url.indexOf('https') === 0;
    var lib = isHttps ? require('https') : require('http');
    var parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch (error) {
      return reject(new Error('Invalid URL: ' + url));
    }

    var options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: Object.assign(
        {
          Accept: 'application/json',
          'User-Agent': 'AIStudioApp/5.0',
          Connection: 'close'
        },
        headers
      ),
      timeout: HTTP_TIMEOUT_MS
    };

    var req = lib.request(options, function (res) {
      var bodyText = '';

      res.on('data', function (chunk) {
        bodyText += chunk;
      });

      res.on('end', function () {
        var elapsed = Date.now() - startTime;

        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.error('[BRS SERVICE] ' + label + ': HTTP ' + res.statusCode + ' (' + elapsed + 'ms)');
          return reject(new Error('BRS HTTP ' + res.statusCode + ': ' + bodyText.substring(0, 500)));
        }

        try {
          var json = JSON.parse(bodyText);
          console.log('[BRS SERVICE] ' + label + ': OK (' + elapsed + 'ms)');
          resolve({
            payload: json,
            transportMeta: {
              elapsedMs: elapsed,
              fetchedAt: new Date().toISOString(),
              endpoint: safeUrl,
              method: method
            }
          });
        } catch (error) {
          reject(new Error('BRS JSON parse error: ' + error.message));
        }
      });
    });

    req.on('error', function (err) {
      reject(new Error('BRS network error [' + (err.code || 'UNKNOWN') + ']: ' + err.message));
    });

    req.on('timeout', function () {
      req.destroy(new Error('BRS timeout after ' + HTTP_TIMEOUT_MS + 'ms'));
    });

    if (serializedBody) {
      req.write(serializedBody);
    }

    req.end();
  });
}

async function fetchBRS(url, label, requestOptions) {
  var lastError = null;

  for (var attempt = 0; attempt <= HTTP_RETRY_COUNT; attempt += 1) {
    try {
      return await fetchBRSOnce(url, label, requestOptions);
    } catch (error) {
      lastError = error;
      var retryable = isRetryableError(error);

      console.error(
        '[BRS SERVICE] ' + label + ': failed attempt ' +
          (attempt + 1) + '/' + (HTTP_RETRY_COUNT + 1) + ' - ' + error.message
      );

      if (!retryable || attempt === HTTP_RETRY_COUNT) break;
      await sleep(HTTP_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw lastError;
}

function normalizeState(state) {
  if (typeof state !== 'string') return '';
  return state
    .trim()
    .toLowerCase()
    .replace(/[\u200c\u200f]/g, ' ')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function isClosedState(state) {
  var normalized = normalizeState(state);
  return CLOSED_STATES.indexOf(normalized) !== -1;
}

function hasMeaningfulIndexPayload(raw) {
  if (!raw || typeof raw !== 'object') return false;
  var candidates = [raw.index, raw.index_change, raw.index_equalWeight, raw.index_equalWeight_change, raw.mv, raw.tno, raw.tval, raw.tvol, raw.date, raw.time];
  for (var i = 0; i < candidates.length; i += 1) {
    var value = candidates[i];
    if (value !== undefined && value !== null && value !== '') return true;
  }
  return false;
}

function hasMeaningfulSymbolPayload(raw) {
  if (!raw || typeof raw !== 'object') return false;
  return !!(raw.l18 || raw.symbol || raw.pl || raw.pc || raw.tvol || raw.tval || raw.tno);
}

function isMeaningfulOHLC(item) {
  if (!item || typeof item !== 'object') return false;
  var values = [item.open, item.high, item.low, item.close, item.last, item.volume, item.value];
  for (var i = 0; i < values.length; i += 1) {
    if (typeof values[i] === 'number' && Number.isFinite(values[i]) && values[i] > 0) return true;
  }
  return false;
}

function getTehranDateParts(date) {
  var targetDate = date || new Date();

  try {
    var formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: TEHRAN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hour12: false
    });

    var parts = formatter.formatToParts(targetDate);
    var map = {};

    for (var i = 0; i < parts.length; i += 1) {
      if (parts[i].type !== 'literal') map[parts[i].type] = parts[i].value;
    }

    var weekdayMap = { Sat: 6, Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };
    var dayOfWeek = weekdayMap[map.weekday];
    var hour = parseInt(map.hour, 10) || 0;
    var minute = parseInt(map.minute, 10) || 0;

    return {
      year: parseInt(map.year, 10) || 0,
      month: parseInt(map.month, 10) || 0,
      day: parseInt(map.day, 10) || 0,
      hour: hour,
      minute: minute,
      second: parseInt(map.second, 10) || 0,
      weekday: map.weekday || '',
      dayOfWeek: typeof dayOfWeek === 'number' ? dayOfWeek : -1,
      minutesOfDay: hour * 60 + minute
    };
  } catch (error) {
    var utc = targetDate.getTime() + targetDate.getTimezoneOffset() * 60000;
    var tehranDate = new Date(utc + 3.5 * 60 * 60 * 1000);
    var d = tehranDate.getDay(); // 0=Sun ... 6=Sat
    var mappedDay = d === 6 ? 6 : d; // Sat=6, Sun=0, Mon=1 ...

    return {
      year: tehranDate.getFullYear(),
      month: tehranDate.getMonth() + 1,
      day: tehranDate.getDate(),
      hour: tehranDate.getHours(),
      minute: tehranDate.getMinutes(),
      second: tehranDate.getSeconds(),
      weekday: '',
      dayOfWeek: mappedDay,
      minutesOfDay: tehranDate.getHours() * 60 + tehranDate.getMinutes()
    };
  }
}

function isTradingWorkday(dayOfWeek) {
  return dayOfWeek === 6 || dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 2 || dayOfWeek === 3;
}

function isWithinTradingWindow(minutesOfDay) {
  return minutesOfDay >= MARKET_OPEN_MINUTE && minutesOfDay <= MARKET_CLOSE_MINUTE;
}

function getLocalMarketWindowStatus(now) {
  var tehran = getTehranDateParts(now || new Date());
  var workday = isTradingWorkday(tehran.dayOfWeek);
  var inWindow = isWithinTradingWindow(tehran.minutesOfDay);

  return {
    isWorkday: workday,
    isWithinHours: inWindow,
    isOpenBySchedule: workday && inWindow,
    tehran: tehran,
    window: { openMinute: MARKET_OPEN_MINUTE, closeMinute: MARKET_CLOSE_MINUTE }
  };
}

function buildMarketOpenFlag(raw, scheduleOpen) {
  var state = raw && raw.state ? raw.state : '';
  if (!scheduleOpen) return false;
  if (state && isClosedState(state)) return false;
  if (state && !isClosedState(state)) return true;
  return hasMeaningfulIndexPayload(raw);
}

function attachDataMeta(data, meta) {
  if (Array.isArray(data)) {
    var arr = data.slice();
    Object.defineProperty(arr, '_meta', { value: meta, enumerable: false, configurable: true, writable: true });
    return arr;
  }

  if (data && typeof data === 'object') {
    var copy = Object.assign({}, data);
    copy._meta = meta;
    return copy;
  }

  return data;
}

function buildEnvelope(data, meta, extras) {
  var payload = attachDataMeta(data, meta);
  var envelope = Object.assign(
    {
      data: payload,
      raw: extras && extras.raw ? extras.raw : null,
      _meta: meta,
      _cached: !!meta.cache.hit,
      _fallback: !!meta.fallback.used
    },
    extras || {}
  );

  if (meta.fallback.reason) envelope._fallbackReason = meta.fallback.reason;
  return envelope;
}

function buildMeta(kind, options) {
  var servedAt = isoNow();
  var fetchedAt = options && options.fetchedAt ? options.fetchedAt : servedAt;
  var ageMs = options && Number.isFinite(options.ageMs) ? options.ageMs : 0;
  var ttlMs = options && Number.isFinite(options.ttlMs) ? options.ttlMs : 0;
  var fallbackUsed = !!(options && options.fallbackUsed);
  var staleThresholdMs = options && Number.isFinite(options.staleThresholdMs) ? options.staleThresholdMs : ttlMs;
  var isStale = staleThresholdMs > 0 ? ageMs > staleThresholdMs : false;
  if (fallbackUsed && ttlMs > 0 && ageMs > ttlMs) isStale = true;

  return {
    kind: kind,
    source: options && options.source ? options.source : 'brs',
    servedAt: servedAt,
    fetchedAt: fetchedAt,
    ageMs: ageMs,
    ttlMs: ttlMs,
    staleThresholdMs: staleThresholdMs,
    isStale: isStale,
    cache: {
      hit: !!(options && options.cacheHit),
      key: options && options.cacheKey ? options.cacheKey : '',
      expiresAt: options && options.expiresAt ? options.expiresAt : null
    },
    fallback: {
      used: fallbackUsed,
      reason: options && options.fallbackReason ? options.fallbackReason : null,
      baseSource: options && options.baseSource ? options.baseSource : null
    },
    request: {
      endpoint: options && options.endpoint ? options.endpoint : null,
      elapsedMs: options && Number.isFinite(options.elapsedMs) ? options.elapsedMs : null
    },
    marketWindow: options && options.marketWindow ? options.marketWindow : null
  };
}

function mapMarketIndexResponse(raw, localWindow) {
  raw = raw || {};

  var index = nz(toNumber(raw.index), 0);
  var indexChange = nz(toNumber(raw.index_change), 0);
  var indexEqualWeight = nz(toNumber(raw.index_equalWeight), 0);
  var indexEqualWeightChange = nz(toNumber(raw.index_equalWeight_change), 0);
  var isMarketOpen = buildMarketOpenFlag(raw, localWindow.isOpenBySchedule);

  var result = {
    date: raw.date || '',
    time: raw.time || '',
    state: raw.state || '',
    index: index,
    indexChange: indexChange,
    indexEqualWeight: indexEqualWeight,
    indexEqualWeightChange: indexEqualWeightChange,
    marketValue: nz(toNumber(raw.mv), 0),
    tradeCount: nz(toInt(raw.tno), 0),
    tradeValue: nz(toNumber(raw.tval), 0),
    tradeVolume: nz(toNumber(raw.tvol), 0),
    value: index,
    changeValue: indexChange,
    changePercent: 0,
    equalWeightedValue: indexEqualWeight,
    equalWeightedChangeValue: indexEqualWeightChange,
    equalWeightedChangePercent: 0,
    isMarketOpen: isMarketOpen,
    volume: nz(toNumber(raw.tvol), 0),
    _raw: raw,
    _timestamp: isoNow(),
    _marketWindow: localWindow
  };

  if (result.indexChange !== 0 && result.index !== 0) {
    var prev = result.index - result.indexChange;
    if (prev !== 0) result.changePercent = parseFloat(((result.indexChange / prev) * 100).toFixed(2));
  }

  if (result.indexEqualWeightChange !== 0 && result.indexEqualWeight !== 0) {
    var prevEW = result.indexEqualWeight - result.indexEqualWeightChange;
    if (prevEW !== 0) {
      result.equalWeightedChangePercent = parseFloat(((result.indexEqualWeightChange / prevEW) * 100).toFixed(2));
    }
  }

  result.index_change = result.indexChange;
  result.index_equalWeight = result.indexEqualWeight;
  result.index_equalWeight_change = result.indexEqualWeightChange;
  result.lastUpdate = ((result.date || '') + ' ' + (result.time || '')).trim();
  result.source = 'brs-v7';

  return result;
}

function mapSymbolData(raw) {
  raw = raw || {};

  var realBuyVolume = nz(toInt(raw.Buy_I_Volume), 0);
  var realSellVolume = nz(toInt(raw.Sell_I_Volume), 0);
  var instBuyVolume = nz(toInt(raw.Buy_N_Volume), 0);
  var instSellVolume = nz(toInt(raw.Sell_N_Volume), 0);
  var realBuyCount = nz(toInt(raw.Buy_CountI), 0);
  var realSellCount = nz(toInt(raw.Sell_CountI), 0);
  var instBuyCount = nz(toInt(raw.Buy_CountN), 0);
  var instSellCount = nz(toInt(raw.Sell_CountN), 0);

  var priceLast = toNumber(raw.pl != null ? raw.pl : raw.last);
  var priceClose = toNumber(raw.pc != null ? raw.pc : raw.close);
  var priceOpen = toNumber(raw.pf != null ? raw.pf : raw.open);
  var priceHigh = toNumber(raw.pmax != null ? raw.pmax : raw.high);
  var priceLow = toNumber(raw.pmin != null ? raw.pmin : raw.low);
  var tradeVolume = toInt(raw.tvol != null ? raw.tvol : raw.volume);
  var tradeValue = toNumber(raw.tval != null ? raw.tval : raw.value);
  var avgPrice = tradeValue != null && tradeVolume != null && tradeVolume > 0 ? tradeValue / tradeVolume : null;

  var result = {
    symbol: raw.l18 || raw.symbol || '',
    name: raw.l30 || raw.name || '',
    nameEn: raw.l30_en || '',
    isin: raw.isin || '',
    id: raw.id || '',
    codes: {
      code4: raw.code_4 || raw.code4 || '',
      code5: raw.code_5 || raw.code5 || '',
      code12: raw.code_12 || raw.code12 || ''
    },
    market: raw.m || '',
    board: raw.m_board || '',
    boardId: raw.m_board_id,
    boardCode: raw.m_board_code || '',
    sector: raw.cs || '',
    sectorId: raw.cs_id,
    subSector: raw.cs_sub || '',
    subSectorId: raw.cs_sub_id,
    price: {
      last: priceLast,
      lastChange: toNumber(raw.plc != null ? raw.plc : raw.lastChange),
      lastChangePercent: toNumber(raw.plp != null ? raw.plp : raw.lastChangePercent),
      closing: priceClose,
      closingChange: toNumber(raw.pcc != null ? raw.pcc : raw.closeChange),
      closingChangePercent: toNumber(raw.pcp != null ? raw.pcp : raw.closeChangePercent),
      yesterday: toNumber(raw.py != null ? raw.py : raw.yesterday),
      open: priceOpen,
      high: priceHigh,
      low: priceLow,
      weekHigh: toNumber(raw.pmax_1w),
      weekLow: toNumber(raw.pmin_1w),
      yearHigh: toNumber(raw.pmax_1y),
      yearLow: toNumber(raw.pmin_1y),
      allowedMin: toNumber(raw.tmin),
      allowedMax: toNumber(raw.tmax),
      average: avgPrice
    },
    trading: {
      count: toInt(raw.tno != null ? raw.tno : raw.tradeCount),
      volume: tradeVolume,
      volumeAvg1m: toInt(raw.tvol_avg_1m),
      value: tradeValue
    },
    fundamental: {
      shares: toNumber(raw.z),
      sharesIssued: raw.z_issued,
      baseVolume: toInt(raw.bvol),
      marketCap: toNumber(raw.mv),
      floatPercent: toNumber(raw.ff),
      eps: toNumber(raw.eps),
      pe: toNumber(raw.pe),
      groupPe: toNumber(raw.g_pe),
      ps: toNumber(raw.ps)
    },
    orderBook: {
      buy: [
        { price: toNumber(raw.pd1), volume: toInt(raw.qd1), count: toInt(raw.zd1) },
        { price: toNumber(raw.pd2), volume: toInt(raw.qd2), count: toInt(raw.zd2) },
        { price: toNumber(raw.pd3), volume: toInt(raw.qd3), count: toInt(raw.zd3) },
        { price: toNumber(raw.pd4), volume: toInt(raw.qd4), count: toInt(raw.zd4) },
        { price: toNumber(raw.pd5), volume: toInt(raw.qd5), count: toInt(raw.zd5) }
      ],
      sell: [
        { price: toNumber(raw.po1), volume: toInt(raw.qo1), count: toInt(raw.zo1) },
        { price: toNumber(raw.po2), volume: toInt(raw.qo2), count: toInt(raw.zo2) },
        { price: toNumber(raw.po3), volume: toInt(raw.qo3), count: toInt(raw.zo3) },
        { price: toNumber(raw.po4), volume: toInt(raw.qo4), count: toInt(raw.zo4) },
        { price: toNumber(raw.po5), volume: toInt(raw.qo5), count: toInt(raw.zo5) }
      ]
    },
    moneyFlow: {
      real: {
        buyVolume: realBuyVolume,
        sellVolume: realSellVolume,
        buyCount: realBuyCount,
        sellCount: realSellCount,
        netVolume: realBuyVolume - realSellVolume,
        netCount: realBuyCount - realSellCount,
        net: realBuyVolume - realSellVolume
      },
      institutional: {
        buyVolume: instBuyVolume,
        sellVolume: instSellVolume,
        buyCount: instBuyCount,
        sellCount: instSellCount,
        netVolume: instBuyVolume - instSellVolume,
        netCount: instBuyCount - instSellCount,
        net: instBuyVolume - instSellVolume
      },
      legal: {
        buyVolume: instBuyVolume,
        sellVolume: instSellVolume,
        buyCount: instBuyCount,
        sellCount: instSellCount,
        netVolume: instBuyVolume - instSellVolume,
        netCount: instBuyCount - instSellCount,
        net: instBuyVolume - instSellVolume
      }
    },
    assembly: Array.isArray(raw.assembly) ? raw.assembly : [],
    state: raw.state || '',
    date: raw.date || '',
    time: raw.time || '',
    dateUpdate: raw.date_update || '',
    _timestamp: isoNow()
  };

  result.lastPrice = result.price.last;
  result.closePrice = result.price.closing;
  result.lastClosePrice = result.price.closing;
  result.closingPrice = result.price.closing;
  result.close = result.price.closing;
  result.last = result.price.last;
  result.open = result.price.open;
  result.high = result.price.high;
  result.low = result.price.low;
  result.yesterday = result.price.yesterday;
  result.tradedVolume = result.trading.volume;
  result.tradeVolume = result.trading.volume;
  result.volume = result.trading.volume;
  result.tradedValue = result.trading.value;
  result.tradeValue = result.trading.value;
  result.value = result.trading.value;
  result.averagePrice = result.price.average;
  result.tradeCount = result.trading.count;
  result.baseVolume = result.fundamental.baseVolume;
  result.marketCap = result.fundamental.marketCap;
  result.eps = result.fundamental.eps;
  result.pe = result.fundamental.pe;
  result.realBuyVolume = realBuyVolume;
  result.realSellVolume = realSellVolume;
  result.instBuyVolume = instBuyVolume;
  result.instSellVolume = instSellVolume;
  result.realMoneyFlow = realBuyVolume - realSellVolume;
  result.legalMoneyFlow = instBuyVolume - instSellVolume;
  result.instMoneyFlow = instBuyVolume - instSellVolume;
  result.lastUpdate = ((result.date || '') + ' ' + (result.time || '')).trim();

  return result;
}

function mapHistoryItem(item) {
  item = item || {};

  var candle = {
    date: item.date || item.d || '',
    time: item.time || item.t || '',
    open: toNumber(item.pf != null ? item.pf : item.open),
    high: toNumber(item.pmax != null ? item.pmax : item.high),
    low: toNumber(item.pmin != null ? item.pmin : item.low),
    close: toNumber(item.pc != null ? item.pc : item.close),
    last: toNumber(item.pl != null ? item.pl : item.last),
    lastChange: toNumber(item.plc != null ? item.plc : item.lastChange),
    lastChangePercent: toNumber(item.plp != null ? item.plp : item.lastChangePercent),
    closeChange: toNumber(item.pcc != null ? item.pcc : item.closeChange),
    closeChangePercent: toNumber(item.pcp != null ? item.pcp : item.closeChangePercent),
    yesterday: toNumber(item.py != null ? item.py : item.yesterday),
    volume: toInt(item.tvol != null ? item.tvol : item.volume),
    value: toNumber(item.tval != null ? item.tval : item.value),
    count: toInt(item.tno != null ? item.tno : item.count)
  };

  candle.lastClosePrice = candle.close;
  candle.tradedVolume = candle.volume;
  candle.tradeVolume = candle.volume;
  candle.tradeValue = candle.value;
  candle.tradeCount = candle.count;
  candle.timestampLabel = ((candle.date || '') + ' ' + (candle.time || '')).trim();

  return candle;
}

function mapAdjustedDailyCandlestickItem(item) {
  item = item || {};

  var close = toNumber(item.close != null ? item.close : item.pc);
  var last = toNumber(item.last != null ? item.last : (item.pl != null ? item.pl : close));
  var value = toNumber(item.value != null ? item.value : item.tval);
  var count = toInt(item.count != null ? item.count : item.tno);
  var volume = toInt(item.volume != null ? item.volume : item.tvol);

  return {
    count: count,
    date: item.date || item.d || '',
    time: item.time || item.t || '',
    open: toNumber(item.open != null ? item.open : item.pf),
    high: toNumber(item.high != null ? item.high : item.pmax),
    low: toNumber(item.low != null ? item.low : item.pmin),
    close: close,
    last: last,
    yesterday: toNumber(item.yesterday != null ? item.yesterday : item.py),
    volume: volume,
    value: value,
    tradedVolume: volume,
    tradeVolume: volume,
    tradedValue: value,
    tradeValue: value,
    tradeCount: count,
    lastClosePrice: close
  };
}

function mapAllSymbolsItem(item) {
  item = item || {};

  var tradeVolume = toInt(item.tvol != null ? item.tvol : item.volume);
  var tradeValue = toNumber(item.tval != null ? item.tval : item.value);
  var avgPrice = tradeValue != null && tradeVolume != null && tradeVolume > 0 ? tradeValue / tradeVolume : null;

  var result = {
    symbol: item.l18 || item.symbol || '',
    name: item.l30 || item.name || '',
    isin: item.isin || '',
    id: item.id || '',
    sector: item.cs || '',
    sectorId: item.cs_id,
    lastPrice: toNumber(item.pl != null ? item.pl : item.last),
    lastChange: toNumber(item.plc != null ? item.plc : item.lastChange),
    lastChangePercent: toNumber(item.plp != null ? item.plp : item.lastChangePercent),
    closingPrice: toNumber(item.pc != null ? item.pc : item.close),
    closingChange: toNumber(item.pcc != null ? item.pcc : item.closeChange),
    closingChangePercent: toNumber(item.pcp != null ? item.pcp : item.closeChangePercent),
    yesterday: toNumber(item.py != null ? item.py : item.yesterday),
    open: toNumber(item.pf != null ? item.pf : item.open),
    high: toNumber(item.pmax != null ? item.pmax : item.high),
    low: toNumber(item.pmin != null ? item.pmin : item.low),
    allowedMin: toNumber(item.tmin),
    allowedMax: toNumber(item.tmax),
    tradeCount: toInt(item.tno != null ? item.tno : item.count),
    tradeVolume: tradeVolume,
    tradeValue: tradeValue,
    averagePrice: avgPrice,
    shares: toNumber(item.z),
    baseVolume: toInt(item.bvol),
    marketCap: toNumber(item.mv),
    eps: toNumber(item.eps),
    pe: toNumber(item.pe),
    realBuyVolume: nz(toInt(item.Buy_I_Volume), 0),
    realSellVolume: nz(toInt(item.Sell_I_Volume), 0),
    instBuyVolume: nz(toInt(item.Buy_N_Volume), 0),
    instSellVolume: nz(toInt(item.Sell_N_Volume), 0)
  };

  result.lastClosePrice = result.closingPrice;
  result.tradedVolume = result.tradeVolume;
  result.tradedValue = result.tradeValue;
  result.realMoneyFlow = result.realBuyVolume - result.realSellVolume;
  result.legalMoneyFlow = result.instBuyVolume - result.instSellVolume;
  result.instMoneyFlow = result.instBuyVolume - result.instSellVolume;

  return result;
}

function ensureEndpointConfig(name, endpointDef, options) {
  ensureApiKey();

  if (!endpointDef || !endpointDef.url) {
    throw new Error(name + ' endpoint is not configured');
  }

  try {
    buildEndpointUrl(endpointDef, options || {});
  } catch (error) {
    throw new Error('Invalid ' + name + ' endpoint configuration: ' + error.message);
  }
}

function ensureBRSConfig() {
  ensureEndpointConfig('BRS_INDEX', endpoints && endpoints.BRS_INDEX, {
    includeSymbolParam: false,
    includeCountParam: false,
    includeTypeParam: true,
    removeParams: ['l18', 'symbol', 'count']
  });
}

function getMarketSummaryEndpoint() {
  var candidates = [
    { key: 'BRS_MARKET_SUMMARY', endpoint: endpoints && endpoints.BRS_MARKET_SUMMARY },
    { key: 'MARKET_SUMMARY', endpoint: endpoints && endpoints.MARKET_SUMMARY },
    { key: 'BRS_MARKET_STATUS', endpoint: endpoints && endpoints.BRS_MARKET_STATUS }
  ];

  for (var i = 0; i < candidates.length; i += 1) {
    if (candidates[i].endpoint && candidates[i].endpoint.url) {
      return candidates[i];
    }
  }

  throw new Error(
    'BRS market summary endpoint is not configured. Expected one of: BRS_MARKET_SUMMARY, MARKET_SUMMARY, BRS_MARKET_STATUS'
  );
}

function ensureMarketSummaryEndpointConfig(options) {
  var resolved = getMarketSummaryEndpoint();
  ensureEndpointConfig(resolved.key, resolved.endpoint, {
    date: options && options.date ? options.date : null,
    includeSymbolParam: false,
    includeCountParam: false,
    includeTypeParam: true,
    removeParams: ['l18', 'symbol', 'count']
  });
  return resolved;
}

function normalizeMarketSummaryArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      var parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
}

function normalizeMarketSummaryPayload(raw) {
  raw = raw || {};

  var overallIndex = toNumber(
    raw.overallIndex != null ? raw.overallIndex :
    raw.index != null ? raw.index :
    raw.marketIndex != null ? raw.marketIndex :
    raw.totalIndex
  );

  var overallChange = toNumber(
    raw.overallChange != null ? raw.overallChange :
    raw.indexChange != null ? raw.indexChange :
    raw.index_change != null ? raw.index_change :
    raw.marketIndexChange
  );

  var equalIndex = toNumber(
    raw.equalIndex != null ? raw.equalIndex :
    raw.equalWeightedIndex != null ? raw.equalWeightedIndex :
    raw.indexEqualWeight != null ? raw.indexEqualWeight :
    raw.index_equalWeight
  );

  var equalChange = toNumber(
    raw.equalChange != null ? raw.equalChange :
    raw.equalWeightedChange != null ? raw.equalWeightedChange :
    raw.indexEqualWeightChange != null ? raw.indexEqualWeightChange :
    raw.index_equalWeight_change
  );

  var totalTrades = toInt(
    raw.totalTrades != null ? raw.totalTrades :
    raw.tradeCount != null ? raw.tradeCount :
    raw.tno
  );

  var totalVolume = toInt(
    raw.totalVolume != null ? raw.totalVolume :
    raw.tradeVolume != null ? raw.tradeVolume :
    raw.tvol
  );

  var totalValue = toInt(
    raw.totalValue != null ? raw.totalValue :
    raw.tradeValue != null ? raw.tradeValue :
    raw.tval
  );

  var topGainers = normalizeMarketSummaryArray(
    raw.topGainers != null ? raw.topGainers :
    raw.gainers != null ? raw.gainers :
    raw.bestPositive
  );

  var topLosers = normalizeMarketSummaryArray(
    raw.topLosers != null ? raw.topLosers :
    raw.losers != null ? raw.losers :
    raw.bestNegative
  );

  var topVolumes = normalizeMarketSummaryArray(
    raw.topVolumes != null ? raw.topVolumes :
    raw.mostTraded != null ? raw.mostTraded :
    raw.topVolumeSymbols
  );

  var summaryText =
    raw.summaryText != null ? String(raw.summaryText) :
    raw.summary != null ? String(raw.summary) :
    raw.content != null ? String(raw.content) :
    raw.text != null ? String(raw.text) :
    '';

  return {
    overallIndex: overallIndex,
    overallChange: overallChange,
    equalIndex: equalIndex,
    equalChange: equalChange,
    totalTrades: totalTrades,
    totalVolume: totalVolume,
    totalValue: totalValue,
    topGainers: topGainers,
    topLosers: topLosers,
    topVolumes: topVolumes,
    summaryText: summaryText,
    date: raw.date || '',
    time: raw.time || '',
    state: raw.state || '',
    _raw: raw
  };
}

function validateMarketSummaryPayload(summaryData) {
  if (!summaryData || typeof summaryData !== 'object') {
    throw new Error('BRS Service error: market summary payload is empty.');
  }

  if (!Number.isFinite(summaryData.overallIndex)) {
    throw new Error('BRS Service error: overallIndex is missing or invalid.');
  }

  return true;
}

async function getMarketIndex() {
  var cacheKey = 'market_index';
  var cacheEntry = getCacheEntry(cacheKey);

  if (cacheEntry) {
    var cacheMeta = buildMeta('market-index', {
      source: 'cache',
      cacheHit: true,
      cacheKey: cacheKey,
      ageMs: cacheEntry.ageMs,
      ttlMs: cacheEntry.ttl,
      expiresAt: cacheEntry.expiresAt,
      fetchedAt: cacheEntry.fetchedAt,
      baseSource: 'brs-live',
      marketWindow: cacheEntry.data && cacheEntry.data._marketWindow ? cacheEntry.data._marketWindow : getLocalMarketWindowStatus(new Date())
    });

    return buildEnvelope(cacheEntry.data, cacheMeta);
  }

  ensureBRSConfig();

  var indexUrl = buildPublicEndpointUrl(endpoints.BRS_INDEX, {
    includeCountParam: false,
    includeTypeParam: true,
    removeParams: ['l18', 'symbol', 'count']
  });

  try {
    var response = await fetchBRS(indexUrl, 'Market Index');
    var raw = getPayloadBody(response.payload);
    var localWindow = getLocalMarketWindowStatus(new Date());

    if (!hasMeaningfulIndexPayload(raw)) {
      throw new Error('BRS Market Index returned empty payload');
    }

    var result = mapMarketIndexResponse(raw, localWindow);
    setCache(cacheKey, result, CACHE_TTL.index, { fetchedAt: response.transportMeta.fetchedAt });

    lastKnownGoodMarketIndex = {
      data: clone(result),
      fetchedAt: response.transportMeta.fetchedAt,
      source: 'brs-live'
    };

    var liveMeta = buildMeta('market-index', {
      source: 'live',
      cacheHit: false,
      cacheKey: cacheKey,
      ageMs: 0,
      ttlMs: CACHE_TTL.index,
      fetchedAt: response.transportMeta.fetchedAt,
      endpoint: response.transportMeta.endpoint,
      elapsedMs: response.transportMeta.elapsedMs,
      marketWindow: localWindow
    });

    return buildEnvelope(result, liveMeta, { raw: raw });
  } catch (error) {
    if (lastKnownGoodMarketIndex && lastKnownGoodMarketIndex.data) {
      var fallbackAgeMs = Date.now() - new Date(lastKnownGoodMarketIndex.fetchedAt).getTime();
      var fallbackMeta = buildMeta('market-index', {
        source: 'fallback-last-known-good',
        cacheHit: false,
        cacheKey: cacheKey,
        ageMs: fallbackAgeMs,
        ttlMs: CACHE_TTL.index,
        fetchedAt: lastKnownGoodMarketIndex.fetchedAt,
        fallbackUsed: true,
        fallbackReason: error.message,
        baseSource: lastKnownGoodMarketIndex.source || 'brs-live',
        marketWindow: lastKnownGoodMarketIndex.data && lastKnownGoodMarketIndex.data._marketWindow ? lastKnownGoodMarketIndex.data._marketWindow : getLocalMarketWindowStatus(new Date())
      });

      return buildEnvelope(lastKnownGoodMarketIndex.data, fallbackMeta);
    }

    throw error;
  }
}

async function getMarketSummary(options) {
  var opts = options || {};
  var requestedDate = opts.date ? String(opts.date).trim() : '';
  var cacheKey = 'market_summary_' + (requestedDate || 'today');
  var cacheEntry = getCacheEntry(cacheKey);

  if (cacheEntry) {
    return {
      success: true,
      data: clone(cacheEntry.data),
      source: 'cache',
      cached: true,
      fetchedAt: cacheEntry.fetchedAt
    };
  }

  var resolved = ensureMarketSummaryEndpointConfig(opts);
  var endpointDef = resolved.endpoint;
  var method = (endpointDef && endpointDef.method ? String(endpointDef.method) : 'POST').toUpperCase();

  var url = buildPublicEndpointUrl(endpointDef, {
    date: requestedDate || null,
    includeCountParam: false,
    includeTypeParam: true,
    removeParams: ['l18', 'symbol', 'count']
  });

  var body = {};
  if (requestedDate) body.date = requestedDate;

  try {
    var response = await fetchBRS(url, 'Market Summary', {
      method: method,
      body: method === 'GET' ? null : body
    });

    var raw = getPayloadBody(response.payload);
    var summaryData = normalizeMarketSummaryPayload(raw);

    validateMarketSummaryPayload(summaryData);

    setCache(cacheKey, clone(summaryData), CACHE_TTL.marketSummary, {
      fetchedAt: response.transportMeta.fetchedAt
    });

    return {
      success: true,
      data: summaryData,
      source: 'brs',
      cached: false,
      fetchedAt: response.transportMeta.fetchedAt,
      meta: {
        endpoint: response.transportMeta.endpoint,
        method: response.transportMeta.method,
        elapsedMs: response.transportMeta.elapsedMs
      }
    };
  } catch (error) {
    throw new Error('BRS Service error: ' + error.message);
  }
}

function getSymbolData(symbol) {
  var symbolClean;
  try {
    ensureEndpointConfig('BRS_SYMBOL', endpoints && endpoints.BRS_SYMBOL, {
      symbol: normalizeSymbolInput(symbol),
      includeSymbolParam: true,
      includeCountParam: false,
      includeTypeParam: false
    });
    symbolClean = normalizeSymbolInput(symbol);
  } catch (error) {
    return Promise.reject(error);
  }

  var cacheKey = 'symbol_' + symbolClean;
  var cacheEntry = getCacheEntry(cacheKey);

  if (cacheEntry) {
    var cacheMeta = buildMeta('symbol', {
      source: 'cache',
      cacheHit: true,
      cacheKey: cacheKey,
      ageMs: cacheEntry.ageMs,
      ttlMs: cacheEntry.ttl,
      expiresAt: cacheEntry.expiresAt,
      fetchedAt: cacheEntry.fetchedAt,
      baseSource: 'brs-live'
    });

    return Promise.resolve(buildEnvelope(cacheEntry.data, cacheMeta));
  }

  var url;
  try {
    url = buildSymbolEndpointUrl(endpoints.BRS_SYMBOL, symbolClean, {
      removeParams: []
    });
  } catch (error) {
    return Promise.reject(error);
  }

  return fetchBRS(url, 'Symbol: ' + symbolClean).then(function (response) {
    var raw = getPayloadBody(response.payload);

    if (!hasMeaningfulSymbolPayload(raw)) {
      throw new Error('BRS Symbol returned empty payload for ' + symbolClean);
    }

    var result = mapSymbolData(raw);

    setCache(cacheKey, result, CACHE_TTL.symbol, { fetchedAt: response.transportMeta.fetchedAt });

    var liveMeta = buildMeta('symbol', {
      source: 'live',
      cacheHit: false,
      cacheKey: cacheKey,
      ageMs: 0,
      ttlMs: CACHE_TTL.symbol,
      fetchedAt: response.transportMeta.fetchedAt,
      endpoint: response.transportMeta.endpoint,
      elapsedMs: response.transportMeta.elapsedMs
    });

    return buildEnvelope(result, liveMeta, { raw: raw });
  });
}

async function getMoneyFlow(symbol) {
  var symbolClean = normalizeSymbolInput(symbol);
  var result = await getSymbolData(symbolClean);
  var data = result && result.data ? result.data : {};
  var flow = data.moneyFlow || {
    real: { buyVolume: 0, sellVolume: 0, buyCount: 0, sellCount: 0, netVolume: 0, netCount: 0, net: 0 },
    institutional: { buyVolume: 0, sellVolume: 0, buyCount: 0, sellCount: 0, netVolume: 0, netCount: 0, net: 0 },
    legal: { buyVolume: 0, sellVolume: 0, buyCount: 0, sellCount: 0, netVolume: 0, netCount: 0, net: 0 }
  };

  return {
    symbol: symbolClean,
    moneyFlow: flow,
    realMoneyFlow: data.realMoneyFlow != null ? data.realMoneyFlow : (flow.real ? flow.real.net : 0),
    legalMoneyFlow: data.legalMoneyFlow != null ? data.legalMoneyFlow : (flow.legal ? flow.legal.net : 0),
    instMoneyFlow: data.instMoneyFlow != null ? data.instMoneyFlow : (flow.institutional ? flow.institutional.net : 0),
    fetchedAt: result && result._meta ? result._meta.fetchedAt : isoNow(),
    _meta: result && result._meta ? result._meta : null
  };
}

function getSymbolHistory(symbol, limit) {
  var symbolClean;
  try {
    symbolClean = normalizeSymbolInput(symbol);
    ensureEndpointConfig('BRS_HISTORY', endpoints && endpoints.BRS_HISTORY, {
      symbol: symbolClean,
      includeSymbolParam: true,
      includeCountParam: true,
      includeTypeParam: false
    });
  } catch (error) {
    return Promise.reject(error);
  }

  var requestedLimit = parseInt(limit, 10) || 0;
  var cacheKey = 'history_' + symbolClean;
  var cacheEntry = getCacheEntry(cacheKey);

  if (cacheEntry) {
    var cachedData = requestedLimit > 0 ? cacheEntry.data.slice(0, requestedLimit) : cacheEntry.data;
    var cacheMeta = buildMeta('history', {
      source: 'cache',
      cacheHit: true,
      cacheKey: cacheKey,
      ageMs: cacheEntry.ageMs,
      ttlMs: cacheEntry.ttl,
      expiresAt: cacheEntry.expiresAt,
      fetchedAt: cacheEntry.fetchedAt,
      baseSource: 'brs-live'
    });

    return Promise.resolve(buildEnvelope(cachedData, cacheMeta, {
      total: cacheEntry.data.length,
      limited: requestedLimit > 0,
      requestedLimit: requestedLimit
    }));
  }

  var url;
  try {
    url = buildSymbolEndpointUrl(endpoints.BRS_HISTORY, symbolClean, {
      count: requestedLimit > 0 ? requestedLimit : undefined,
      removeParams: []
    });
  } catch (error) {
    return Promise.reject(error);
  }

  return fetchBRS(url, 'History: ' + symbolClean).then(function (response) {
    var rawArray = extractArrayPayload(response.payload);
    if (!Array.isArray(rawArray)) {
      throw new Error('BRS History did not return an array');
    }

    var mapped = rawArray.map(mapHistoryItem).filter(isMeaningfulOHLC);
    setCache(cacheKey, mapped, CACHE_TTL.history, { fetchedAt: response.transportMeta.fetchedAt });

    var result = requestedLimit > 0 ? mapped.slice(0, requestedLimit) : mapped;
    var liveMeta = buildMeta('history', {
      source: 'live',
      cacheHit: false,
      cacheKey: cacheKey,
      ageMs: 0,
      ttlMs: CACHE_TTL.history,
      fetchedAt: response.transportMeta.fetchedAt,
      endpoint: response.transportMeta.endpoint,
      elapsedMs: response.transportMeta.elapsedMs
    });

    return buildEnvelope(result, liveMeta, {
      total: mapped.length,
      limited: requestedLimit > 0,
      requestedLimit: requestedLimit,
      raw: rawArray
    });
  });
}

async function getAdjustedDailyCandlestick(symbol, limit) {
  var symbolClean;
  try {
    symbolClean = normalizeSymbolInput(symbol);
    ensureApiKey();
  } catch (error) {
    return Promise.reject(error);
  }

  var requestedLimit = parseInt(limit, 10) || 0;
  var cacheKey = 'candlestick_adj_daily_' + symbolClean;
  var cacheEntry = getCacheEntry(cacheKey);

  if (cacheEntry) {
    var cachedData = requestedLimit > 0 ? cacheEntry.data.slice(0, requestedLimit) : cacheEntry.data;
    var cacheMeta = buildMeta('candlestick-adjusted-daily', {
      source: 'cache',
      cacheHit: true,
      cacheKey: cacheKey,
      ageMs: cacheEntry.ageMs,
      ttlMs: cacheEntry.ttl,
      expiresAt: cacheEntry.expiresAt,
      fetchedAt: cacheEntry.fetchedAt,
      baseSource: 'brs-live'
    });

    return buildEnvelope(cachedData, cacheMeta, {
      total: cacheEntry.data.length,
      limited: requestedLimit > 0,
      requestedLimit: requestedLimit
    });
  }

  var canUseCandlestick = !!(endpoints && endpoints.BRS_CANDLESTICK && endpoints.BRS_CANDLESTICK.url);

  if (canUseCandlestick) {
    try {
      ensureEndpointConfig('BRS_CANDLESTICK', endpoints.BRS_CANDLESTICK, {
        symbol: symbolClean,
        count: requestedLimit > 0 ? requestedLimit : undefined,
        type: 3,
        includeSymbolParam: true,
        includeCountParam: true,
        includeTypeParam: true
      });

      var candlestickUrl = buildSymbolEndpointUrl(endpoints.BRS_CANDLESTICK, symbolClean, {
        count: requestedLimit > 0 ? requestedLimit : undefined,
        type: 3,
        removeParams: []
      });

      var response = await fetchBRS(candlestickUrl, 'Candlestick AdjDaily: ' + symbolClean);
      var rawArray = extractArrayPayload(response.payload);
      if (!Array.isArray(rawArray)) throw new Error('BRS Candlestick did not return an array');

      var mapped = rawArray.map(mapAdjustedDailyCandlestickItem).filter(isMeaningfulOHLC);
      setCache(cacheKey, mapped, CACHE_TTL.candlestick, { fetchedAt: response.transportMeta.fetchedAt });

      var result = requestedLimit > 0 ? mapped.slice(0, requestedLimit) : mapped;
      var liveMeta = buildMeta('candlestick-adjusted-daily', {
        source: 'live',
        cacheHit: false,
        cacheKey: cacheKey,
        ageMs: 0,
        ttlMs: CACHE_TTL.candlestick,
        fetchedAt: response.transportMeta.fetchedAt,
        endpoint: response.transportMeta.endpoint,
        elapsedMs: response.transportMeta.elapsedMs
      });

      return buildEnvelope(result, liveMeta, {
        total: mapped.length,
        limited: requestedLimit > 0,
        requestedLimit: requestedLimit,
        raw: rawArray
      });
    } catch (candlestickError) {
      console.warn('[BRS SERVICE] Candlestick AdjDaily failed for ' + symbolClean + ', fallback to history: ' + candlestickError.message);
    }
  }

  var historyResult = await getSymbolHistory(symbolClean, requestedLimit > 0 ? requestedLimit : undefined);
  var historyData = Array.isArray(historyResult && historyResult.data) ? historyResult.data : [];
  var mappedFromHistory = historyData.map(mapAdjustedDailyCandlestickItem).filter(isMeaningfulOHLC);

  setCache(cacheKey, mappedFromHistory, CACHE_TTL.candlestick, {
    fetchedAt: historyResult && historyResult._meta && historyResult._meta.fetchedAt ? historyResult._meta.fetchedAt : isoNow()
  });

  var fallbackMeta = buildMeta('candlestick-adjusted-daily', {
    source: 'fallback-history',
    cacheHit: !!(historyResult && historyResult._cached),
    cacheKey: cacheKey,
    ageMs: historyResult && historyResult._meta && Number.isFinite(historyResult._meta.ageMs) ? historyResult._meta.ageMs : 0,
    ttlMs: CACHE_TTL.candlestick,
    fetchedAt: historyResult && historyResult._meta && historyResult._meta.fetchedAt ? historyResult._meta.fetchedAt : isoNow(),
    fallbackUsed: true,
    fallbackReason: canUseCandlestick ? 'candlestick-fetch-failed' : 'candlestick-endpoint-missing',
    baseSource: historyResult && historyResult._meta ? historyResult._meta.source : 'history'
  });

  return buildEnvelope(mappedFromHistory, fallbackMeta, {
    total: mappedFromHistory.length,
    limited: requestedLimit > 0,
    requestedLimit: requestedLimit
  });
}

function getAllSymbols() {
  var cacheKey = 'all_symbols';
  var cacheEntry = getCacheEntry(cacheKey);

  if (cacheEntry) {
    var cacheMeta = buildMeta('all-symbols', {
      source: 'cache',
      cacheHit: true,
      cacheKey: cacheKey,
      ageMs: cacheEntry.ageMs,
      ttlMs: cacheEntry.ttl,
      expiresAt: cacheEntry.expiresAt,
      fetchedAt: cacheEntry.fetchedAt,
      baseSource: 'brs-live'
    });

    return Promise.resolve(buildEnvelope(cacheEntry.data, cacheMeta, { total: cacheEntry.data.length }));
  }

  if (!endpoints || !endpoints.BRS_ALL_SYMBOLS || !endpoints.BRS_ALL_SYMBOLS.url) {
    return Promise.reject(new Error('BRS_ALL_SYMBOLS endpoint is not configured'));
  }

  try {
    ensureEndpointConfig('BRS_ALL_SYMBOLS', endpoints && endpoints.BRS_ALL_SYMBOLS, {
      includeSymbolParam: false,
      includeCountParam: false,
      includeTypeParam: true,
      removeParams: ['l18', 'symbol', 'count']
    });
  } catch (error) {
    return Promise.reject(error);
  }

  var allSymbolsUrl;
  try {
    allSymbolsUrl = buildPublicEndpointUrl(endpoints.BRS_ALL_SYMBOLS, {
      includeCountParam: false,
      includeTypeParam: true,
      removeParams: ['l18', 'symbol', 'count']
    });
  } catch (error) {
    return Promise.reject(error);
  }

  return fetchBRS(allSymbolsUrl, 'All Symbols').then(function (response) {
    var rawArray = extractArrayPayload(response.payload);
    if (!Array.isArray(rawArray)) {
      throw new Error('BRS AllSymbols did not return an array');
    }

    var mapped = rawArray.map(mapAllSymbolsItem).filter(function (item) {
      return !!item.symbol;
    });

    setCache(cacheKey, mapped, CACHE_TTL.allSymbols, { fetchedAt: response.transportMeta.fetchedAt });

    var liveMeta = buildMeta('all-symbols', {
      source: 'live',
      cacheHit: false,
      cacheKey: cacheKey,
      ageMs: 0,
      ttlMs: CACHE_TTL.allSymbols,
      fetchedAt: response.transportMeta.fetchedAt,
      endpoint: response.transportMeta.endpoint,
      elapsedMs: response.transportMeta.elapsedMs
    });

    return buildEnvelope(mapped, liveMeta, { total: mapped.length, raw: rawArray });
  });
}

function searchSymbols(query) {
  if (!query || String(query).trim().length < 1) {
    return Promise.reject(new Error('Search query is required'));
  }

  return getAllSymbols().then(function (result) {
    var q = String(query).trim().toLowerCase();

    var filtered = result.data.filter(function (item) {
      var symbol = item.symbol ? String(item.symbol).toLowerCase() : '';
      var name = item.name ? String(item.name).toLowerCase() : '';
      var isin = item.isin ? String(item.isin).toLowerCase() : '';
      return symbol.indexOf(q) !== -1 || name.indexOf(q) !== -1 || isin.indexOf(q) !== -1;
    });

    var meta = buildMeta('symbol-search', {
      source: result._meta && result._meta.source ? result._meta.source : 'derived',
      cacheHit: !!result._cached,
      ageMs: result._meta && Number.isFinite(result._meta.ageMs) ? result._meta.ageMs : 0,
      ttlMs: result._meta && Number.isFinite(result._meta.ttlMs) ? result._meta.ttlMs : 0,
      fetchedAt: result._meta && result._meta.fetchedAt ? result._meta.fetchedAt : isoNow(),
      fallbackUsed: !!result._fallback,
      fallbackReason: result._fallbackReason || null,
      baseSource: result._meta ? result._meta.source : null
    });

    return buildEnvelope(filtered, meta, { total: filtered.length, query: query });
  });
}

async function getMarketStatus(now) {
  var localWindow = getLocalMarketWindowStatus(now || new Date());

  if (!localWindow.isWorkday) {
    return {
      isOpen: false,
      reason: 'NON_TRADING_DAY',
      source: 'schedule',
      schedule: localWindow,
      _meta: { source: 'schedule', servedAt: isoNow(), marketWindow: localWindow }
    };
  }

  if (!localWindow.isWithinHours) {
    return {
      isOpen: false,
      reason: 'OUTSIDE_TRADING_HOURS',
      source: 'schedule',
      schedule: localWindow,
      _meta: { source: 'schedule', servedAt: isoNow(), marketWindow: localWindow }
    };
  }

  try {
    var indexResult = await getMarketIndex();
    var payload = indexResult && indexResult.data ? indexResult.data : null;
    var state = payload ? payload.state || '' : '';
    var freshnessMeta = indexResult && indexResult._meta ? indexResult._meta : null;

    if (!payload) {
      return {
        isOpen: false,
        reason: 'MARKET_INDEX_UNAVAILABLE',
        source: 'api',
        schedule: localWindow,
        _meta: { source: 'api', servedAt: isoNow(), marketWindow: localWindow }
      };
    }

    if (state && isClosedState(state)) {
      return {
        isOpen: false,
        reason: 'API_STATE_CLOSED',
        source: 'api',
        state: state,
        schedule: localWindow,
        dataFreshness: freshnessMeta,
        _meta: { source: 'api', servedAt: isoNow(), marketWindow: localWindow, dataFreshness: freshnessMeta }
      };
    }

    if (freshnessMeta && freshnessMeta.fallback && freshnessMeta.fallback.used && freshnessMeta.isStale) {
      return {
        isOpen: false,
        reason: 'STALE_FALLBACK_INDEX',
        source: 'api',
        state: state,
        schedule: localWindow,
        dataFreshness: freshnessMeta,
        _meta: { source: 'api', servedAt: isoNow(), marketWindow: localWindow, dataFreshness: freshnessMeta }
      };
    }

    if (payload.isMarketOpen) {
      return {
        isOpen: true,
        reason: state ? 'OPEN' : 'OPEN_BY_SCHEDULE_AND_PAYLOAD',
        source: 'api',
        state: state,
        schedule: localWindow,
        dataFreshness: freshnessMeta,
        _meta: { source: 'api', servedAt: isoNow(), marketWindow: localWindow, dataFreshness: freshnessMeta }
      };
    }

    return {
      isOpen: false,
      reason: state ? 'API_STATE_NOT_OPEN' : 'MARKET_STATE_UNAVAILABLE',
      source: 'api',
      state: state,
      schedule: localWindow,
      dataFreshness: freshnessMeta,
      _meta: { source: 'api', servedAt: isoNow(), marketWindow: localWindow, dataFreshness: freshnessMeta }
    };
  } catch (error) {
    return {
      isOpen: false,
      reason: 'API_VALIDATION_FAILED',
      source: 'api',
      error: error.message,
      schedule: localWindow,
      _meta: { source: 'api', servedAt: isoNow(), marketWindow: localWindow, error: error.message }
    };
  }
}

async function isMarketOpen() {
  var status = await getMarketStatus();
  return status.isOpen;
}

module.exports = {
  getMarketIndex: getMarketIndex,
  getMarketSummary: getMarketSummary,
  getSymbolData: getSymbolData,
  getMoneyFlow: getMoneyFlow,
  getSymbolHistory: getSymbolHistory,
  getAdjustedDailyCandlestick: getAdjustedDailyCandlestick,
  getAllSymbols: getAllSymbols,
  searchSymbols: searchSymbols,
  clearCache: clearCache,
  getCacheStats: getCacheStats,
  isMarketOpen: isMarketOpen,
  getMarketStatus: getMarketStatus,
  _getLocalMarketWindowStatus: getLocalMarketWindowStatus,
  _isClosedState: isClosedState
};
