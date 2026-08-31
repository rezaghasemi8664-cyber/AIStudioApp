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
  'بسته', 'close', 'closed', 'pre-open', 'pre open', 'preopen',
  'پیش‌گشایش', 'پیش گشایش'
];

function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function toNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback === undefined ? null : fallback;
  var parsed = parseFloat(value); return Number.isFinite(parsed) ? parsed : (fallback === undefined ? null : fallback);
}
function toInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback === undefined ? null : fallback;
  var parsed = parseInt(value, 10); return Number.isFinite(parsed) ? parsed : (fallback === undefined ? null : fallback);
}
function nz(value, fallback) { return value === null || value === undefined ? fallback : value; }
function isoNow() { return new Date().toISOString(); }
function maskUrl(url) { try { var parsed = new URL(url); if (parsed.searchParams.has('key')) parsed.searchParams.set('key', '***'); return parsed.toString(); } catch (error) { return url; } }
function getApiKey() { return (process.env.BRS_API_KEY || '').trim(); }
function ensureApiKey() { var key = getApiKey(); if (!key) throw new Error('BRS_API_KEY is missing in environment'); return key; }
function normalizeSymbolInput(symbol) { if (symbol == null || !String(symbol).trim()) throw new Error('Symbol name is required'); return String(symbol).trim(); }
function resolveEndpointRawUrl(endpointDef, symbolClean) {
  var rawUrl = '';
  if (typeof endpointDef === 'function') rawUrl = endpointDef(symbolClean);
  else if (endpointDef && typeof endpointDef.url === 'function') rawUrl = endpointDef.url(symbolClean);
  else if (typeof endpointDef === 'string') rawUrl = endpointDef;
  else if (endpointDef && typeof endpointDef.url === 'string') rawUrl = endpointDef.url;
  if (!rawUrl || typeof rawUrl !== 'string') throw new Error('BRS endpoint url is invalid');
  return rawUrl;
}
function ensureQueryParam(parsed, key, value) { if (value !== undefined && value !== null && value !== '') parsed.searchParams.set(key, String(value)); }
function removeQueryParams(parsed, keys) { (keys || []).forEach(function (key) { if (key) parsed.searchParams.delete(key); }); }
function replaceKnownPlaceholders(rawUrl, values) {
  var result = String(rawUrl || ''); Object.keys(values || {}).forEach(function (key) { var value = values[key]; var encoded = value == null ? '' : encodeURIComponent(String(value)); result = result.replace(new RegExp('\\{' + key + '\\}', 'gi'), encoded).replace(new RegExp('\\{\\{' + key + '\\}\\}', 'gi'), encoded).replace(new RegExp(':' + key + '\\b', 'gi'), encoded); }); return result;
}
function validateNoUnresolvedPlaceholders(finalUrl) { if (/[{]symbol[}]|[{]apiKey[}]|[{]count[}]|[{]type[}]|[{]date[}]|:symbol\b|:apiKey\b|:count\b|:type\b|:date\b/i.test(finalUrl)) throw new Error('Unresolved placeholder in endpoint URL'); }
function buildEndpointUrl(endpointDef, options) {
  if (!endpointDef) throw new Error('BRS endpoint is not configured');
  var opts = options || {}; var apiKey = ensureApiKey(); var symbol = opts.symbol != null ? String(opts.symbol).trim() : '';
  var replaced = replaceKnownPlaceholders(resolveEndpointRawUrl(endpointDef, symbol), { apiKey: apiKey, symbol: symbol, count: opts.count != null ? String(opts.count) : '', type: opts.type != null ? String(opts.type) : '', date: opts.date ? String(opts.date).trim() : '' });
  validateNoUnresolvedPlaceholders(replaced);
  var parsed; try { parsed = new URL(replaced); } catch (error) { throw new Error('Invalid BRS endpoint url: ' + replaced); }
  if (Array.isArray(opts.removeParams)) removeQueryParams(parsed, opts.removeParams);
  ensureQueryParam(parsed, 'key', apiKey);
  if (opts.includeSymbolParam === true && symbol) ensureQueryParam(parsed, 'l18', symbol);
  if (opts.count != null && opts.includeCountParam !== false) ensureQueryParam(parsed, 'count', opts.count);
  if (opts.type != null && opts.includeTypeParam !== false) ensureQueryParam(parsed, 'type', opts.type);
  if (opts.date != null && opts.includeDateParam === true) ensureQueryParam(parsed, 'date', opts.date);
  return parsed.toString();
}
function buildPublicEndpointUrl(endpointDef, options) { return buildEndpointUrl(endpointDef, options); }
function buildSymbolEndpointUrl(endpointDef, symbol, options) { return buildEndpointUrl(endpointDef, Object.assign({}, options || {}, { symbol: symbol, includeSymbolParam: true })); }
function ensureEndpointConfig(name, endpointDef, options) { ensureApiKey(); if (!endpointDef || !endpointDef.url) throw new Error(name + ' endpoint is not configured'); buildEndpointUrl(endpointDef, options || {}); }
function getCacheEntry(key) { var entry = cache[key]; if (!entry) return null; var ageMs = Date.now() - new Date(entry.fetchedAt).getTime(); if (ageMs > entry.ttl) { delete cache[key]; return null; } return Object.assign({}, entry, { ageMs: ageMs, expiresAt: new Date(new Date(entry.fetchedAt).getTime() + entry.ttl).toISOString() }); }
function setCache(key, data, ttl, meta) { cache[key] = { data: clone(data), ttl: ttl, fetchedAt: meta && meta.fetchedAt ? meta.fetchedAt : isoNow() }; }
function clearCache() { cache = {}; lastKnownGoodMarketIndex = null; return { success: true }; }
function getCacheStats() { return Object.keys(cache).map(function (key) { var e = getCacheEntry(key); return { key: key, ageMs: e ? e.ageMs : null, ttlMs: e ? e.ttl : null, fetchedAt: e ? e.fetchedAt : null }; }); }
function buildMeta(type, values) { return Object.assign({ type: type, fetchedAt: isoNow() }, values || {}); }
function buildEnvelope(data, meta, extra) { return Object.assign({ success: true, data: data, _meta: meta || { fetchedAt: isoNow() } }, extra || {}); }
function getPayloadBody(payload) { if (payload && payload.data !== undefined) return payload.data; if (payload && payload.result !== undefined) return payload.result; return payload; }
function extractArrayPayload(payload) { var body = getPayloadBody(payload); if (Array.isArray(body)) return body; if (body && Array.isArray(body.data)) return body.data; if (body && Array.isArray(body.result)) return body.result; return []; }
function getLocalMarketWindowStatus(now) {
  var date = now instanceof Date ? now : new Date(now || Date.now());
  var parts = new Intl.DateTimeFormat('en-US', { timeZone: TEHRAN_TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  var map = {}; parts.forEach(function (p) { map[p.type] = p.value; });
  var weekday = map.weekday; var isWorkday = weekday !== 'Fri'; var minute = parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10);
  return { timeZone: TEHRAN_TIME_ZONE, weekday: weekday, isWorkday: isWorkday, isWithinHours: isWorkday && minute >= MARKET_OPEN_MINUTE && minute < MARKET_CLOSE_MINUTE, openMinute: MARKET_OPEN_MINUTE, closeMinute: MARKET_CLOSE_MINUTE, localTime: map.hour + ':' + map.minute };
}
function isClosedState(state) { var s = String(state || '').trim().toLowerCase(); return CLOSED_STATES.some(function (x) { return s === x.toLowerCase(); }); }
function mapAllSymbolsItem(item) {
  item = item || {};
  var tradeVolume = toInt(item.tvol != null ? item.tvol : item.volume); var tradeValue = toNumber(item.tval != null ? item.tval : item.value);
  var avgPrice = tradeValue != null && tradeVolume != null && tradeVolume > 0 ? tradeValue / tradeVolume : null;
  var result = {
    symbol: item.l18 || item.symbol || '', name: item.l30 || item.name || '', isin: item.isin || '', id: item.id || '', sector: item.cs || '', sectorId: item.cs_id,
    lastPrice: toNumber(item.pl != null ? item.pl : item.last), lastChange: toNumber(item.plc != null ? item.plc : item.lastChange), lastChangePercent: toNumber(item.plp != null ? item.plp : item.lastChangePercent),
    closingPrice: toNumber(item.pc != null ? item.pc : item.close), closingChange: toNumber(item.pcc != null ? item.pcc : item.closeChange), closingChangePercent: toNumber(item.pcp != null ? item.pcp : item.closeChangePercent), yesterday: toNumber(item.py != null ? item.py : item.yesterday),
    open: toNumber(item.pf != null ? item.pf : item.open), high: toNumber(item.pmax != null ? item.pmax : item.high), low: toNumber(item.pmin != null ? item.pmin : item.low), allowedMin: toNumber(item.tmin), allowedMax: toNumber(item.tmax),
    tradeCount: toInt(item.tno != null ? item.tno : item.count), tradeVolume: tradeVolume, tradeValue: tradeValue, averagePrice: avgPrice, shares: toNumber(item.z), baseVolume: toInt(item.bvol), marketCap: toNumber(item.mv), eps: toNumber(item.eps), pe: toNumber(item.pe),
    realBuyVolume: nz(toInt(item.Buy_I_Volume != null ? item.Buy_I_Volume : item.realBuyVolume), 0), realSellVolume: nz(toInt(item.Sell_I_Volume != null ? item.Sell_I_Volume : item.realSellVolume), 0), instBuyVolume: nz(toInt(item.Buy_N_Volume != null ? item.Buy_N_Volume : item.instBuyVolume), 0), instSellVolume: nz(toInt(item.Sell_N_Volume != null ? item.Sell_N_Volume : item.instSellVolume), 0),
    realBuyCount: nz(toInt(item.Buy_I_Count != null ? item.Buy_I_Count : (item.realBuyCount != null ? item.realBuyCount : item.Buy_I_Persons)), 0), realSellCount: nz(toInt(item.Sell_I_Count != null ? item.Sell_I_Count : (item.realSellCount != null ? item.realSellCount : item.Sell_I_Persons)), 0), instBuyCount: nz(toInt(item.Buy_N_Count != null ? item.Buy_N_Count : (item.instBuyCount != null ? item.instBuyCount : item.Buy_N_Persons)), 0), instSellCount: nz(toInt(item.Sell_N_Count != null ? item.Sell_N_Count : (item.instSellCount != null ? item.instSellCount : item.Sell_N_Persons)), 0)
  };
  result.lastClosePrice = result.closingPrice; result.tradedVolume = result.tradeVolume; result.tradedValue = result.tradeValue; result.realMoneyFlow = result.realBuyVolume - result.realSellVolume; result.legalMoneyFlow = result.instBuyVolume - result.instSellVolume; result.instMoneyFlow = result.instBuyVolume - result.instSellVolume;
  return result;
}
function hasMeaningfulIndexPayload(raw) { return !!raw && (raw.index != null || raw.value != null || raw.last != null || raw.isMarketOpen != null); }
function mapMarketIndexResponse(raw, localWindow) { raw = raw || {}; var result = Object.assign({}, raw); result.index = toNumber(raw.index != null ? raw.index : raw.value, 0); result.isMarketOpen = raw.isMarketOpen != null ? !!raw.isMarketOpen : !!localWindow.isWithinHours; result.state = raw.state || raw.status || ''; result._marketWindow = localWindow; return result; }
async function fetchBRS(url, label, options) {
  var opts = options || {}; var controller = new AbortController(); var timeout = setTimeout(function () { controller.abort(); }, HTTP_TIMEOUT_MS);
  try {
    var init = { method: opts.method || 'GET', signal: controller.signal, headers: Object.assign({ Accept: 'application/json', 'User-Agent': 'RoniaAnalyzer/1.0' }, opts.headers || {}) };
    if (init.method !== 'GET' && opts.body != null) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    var lastError = null;
    for (var attempt = 0; attempt <= HTTP_RETRY_COUNT; attempt += 1) {
      try { var response = await fetch(url, init); var text = await response.text(); var payload; try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = text; } if (!response.ok) throw new Error(label + ' HTTP ' + response.status); return { payload: payload, transportMeta: { endpoint: maskUrl(url), method: init.method, fetchedAt: isoNow(), elapsedMs: 0 } }; } catch (error) { lastError = error; if (attempt < HTTP_RETRY_COUNT) await sleep(HTTP_RETRY_DELAY_MS * (attempt + 1)); }
    }
    throw lastError || new Error(label + ' request failed');
  } finally { clearTimeout(timeout); }
}
async function getMarketIndex() {
  var cacheKey = 'market_index'; var cacheEntry = getCacheEntry(cacheKey); if (cacheEntry) return buildEnvelope(cacheEntry.data, buildMeta('market-index', { source: 'cache', cacheHit: true, cacheKey: cacheKey, ageMs: cacheEntry.ageMs, ttlMs: cacheEntry.ttl, expiresAt: cacheEntry.expiresAt, fetchedAt: cacheEntry.fetchedAt, marketWindow: cacheEntry.data && cacheEntry.data._marketWindow ? cacheEntry.data._marketWindow : getLocalMarketWindowStatus(new Date()) }));
  ensureBRSConfig(); var indexUrl = buildPublicEndpointUrl(endpoints.BRS_INDEX, { includeCountParam: false, includeTypeParam: true, removeParams: ['l18', 'symbol', 'count'] });
  try { var response = await fetchBRS(indexUrl, 'Market Index'); var raw = getPayloadBody(response.payload); var localWindow = getLocalMarketWindowStatus(new Date()); if (!hasMeaningfulIndexPayload(raw)) throw new Error('BRS Market Index returned empty payload'); var result = mapMarketIndexResponse(raw, localWindow); setCache(cacheKey, result, CACHE_TTL.index, { fetchedAt: response.transportMeta.fetchedAt }); lastKnownGoodMarketIndex = { data: clone(result), fetchedAt: response.transportMeta.fetchedAt, source: 'brs-live' }; return buildEnvelope(result, buildMeta('market-index', { source: 'live', cacheHit: false, cacheKey: cacheKey, ageMs: 0, ttlMs: CACHE_TTL.index, fetchedAt: response.transportMeta.fetchedAt, endpoint: response.transportMeta.endpoint, elapsedMs: response.transportMeta.elapsedMs, marketWindow: localWindow }), { raw: raw }); } catch (error) { if (lastKnownGoodMarketIndex && lastKnownGoodMarketIndex.data) return buildEnvelope(lastKnownGoodMarketIndex.data, buildMeta('market-index', { source: 'fallback-last-known-good', fetchedAt: lastKnownGoodMarketIndex.fetchedAt, fallbackUsed: true, fallbackReason: error.message, marketWindow: lastKnownGoodMarketIndex.data._marketWindow || getLocalMarketWindowStatus(new Date()) })); throw error; }
}
async function getMarketSummary(options) { var opts = options || {}; var requestedDate = opts.date ? String(opts.date).trim() : ''; var cacheKey = 'market_summary_' + (requestedDate || 'today'); var cacheEntry = getCacheEntry(cacheKey); if (cacheEntry) return { success: true, data: clone(cacheEntry.data), source: 'cache', cached: true, fetchedAt: cacheEntry.fetchedAt }; var endpointDef = endpoints.BRS_MARKET_SUMMARY || endpoints.MARKET_SUMMARY || endpoints.BRS_MARKET_STATUS; if (!endpointDef) throw new Error('BRS market summary endpoint is not configured'); var method = (endpointDef.method || 'POST').toUpperCase(); var url = buildPublicEndpointUrl(endpointDef, { date: requestedDate || null, includeCountParam: false, includeTypeParam: true, removeParams: ['l18', 'symbol', 'count'] }); var response = await fetchBRS(url, 'Market Summary', { method: method, body: method === 'GET' ? null : (requestedDate ? { date: requestedDate } : {}) }); var summaryData = getPayloadBody(response.payload); setCache(cacheKey, summaryData, CACHE_TTL.marketSummary, { fetchedAt: response.transportMeta.fetchedAt }); return { success: true, data: summaryData, source: 'brs', cached: false, fetchedAt: response.transportMeta.fetchedAt }; }
async function getSymbolData(symbol) { var symbolClean = normalizeSymbolInput(symbol); ensureEndpointConfig('BRS_SYMBOL', endpoints.BRS_SYMBOL, { symbol: symbolClean, includeSymbolParam: true, includeCountParam: false, includeTypeParam: false }); var cacheKey = 'symbol_' + symbolClean; var cacheEntry = getCacheEntry(cacheKey); if (cacheEntry) return buildEnvelope(cacheEntry.data, buildMeta('symbol', { source: 'cache', fetchedAt: cacheEntry.fetchedAt, ageMs: cacheEntry.ageMs, ttlMs: cacheEntry.ttl })); var url = buildSymbolEndpointUrl(endpoints.BRS_SYMBOL, symbolClean, { removeParams: [] }); var response = await fetchBRS(url, 'Symbol: ' + symbolClean); var raw = getPayloadBody(response.payload); var result = raw && raw.data ? raw.data : raw; setCache(cacheKey, result, CACHE_TTL.symbol, { fetchedAt: response.transportMeta.fetchedAt }); return buildEnvelope(result, buildMeta('symbol', { source: 'live', fetchedAt: response.transportMeta.fetchedAt, endpoint: response.transportMeta.endpoint })); }
async function getMoneyFlow(symbol) { var result = await getSymbolData(symbol); var data = result && result.data ? result.data : {}; return { symbol: normalizeSymbolInput(symbol), moneyFlow: data.moneyFlow || {}, realMoneyFlow: data.realMoneyFlow || 0, legalMoneyFlow: data.legalMoneyFlow || 0, instMoneyFlow: data.instMoneyFlow || 0, fetchedAt: result._meta ? result._meta.fetchedAt : isoNow(), _meta: result._meta || null }; }
async function getSymbolHistory(symbol, limit) { var symbolClean = normalizeSymbolInput(symbol); var endpoint = endpoints.BRS_HISTORY; ensureEndpointConfig('BRS_HISTORY', endpoint, { symbol: symbolClean, count: parseInt(limit, 10) || 0, includeSymbolParam: true, includeCountParam: true, includeTypeParam: false }); var url = buildSymbolEndpointUrl(endpoint, symbolClean, { count: parseInt(limit, 10) || 0, includeCountParam: true }); var response = await fetchBRS(url, 'History: ' + symbolClean); return buildEnvelope(extractArrayPayload(response.payload), buildMeta('history', { source: 'brs', fetchedAt: response.transportMeta.fetchedAt })); }
async function getAdjustedDailyCandlestick(symbol, limit) { return getSymbolHistory(symbol, limit); }
async function getAllSymbols() {
  var cacheKey = 'all_symbols'; var cacheEntry = getCacheEntry(cacheKey); if (cacheEntry) return buildEnvelope(cacheEntry.data, buildMeta('all-symbols', { source: 'cache', fetchedAt: cacheEntry.fetchedAt, ageMs: cacheEntry.ageMs, ttlMs: cacheEntry.ttl }), { total: cacheEntry.data.length });
  ensureEndpointConfig('BRS_ALL_SYMBOLS', endpoints.BRS_ALL_SYMBOLS, { includeCountParam: false, includeTypeParam: true, removeParams: ['l18', 'symbol', 'count'] }); var url = buildPublicEndpointUrl(endpoints.BRS_ALL_SYMBOLS, { includeCountParam: false, includeTypeParam: true, removeParams: ['l18', 'symbol', 'count'] }); var response = await fetchBRS(url, 'All Symbols'); var rawArray = extractArrayPayload(response.payload); if (!Array.isArray(rawArray)) throw new Error('BRS AllSymbols did not return an array'); var mapped = rawArray.map(mapAllSymbolsItem).filter(function (item) { return !!item.symbol; }); setCache(cacheKey, mapped, CACHE_TTL.allSymbols, { fetchedAt: response.transportMeta.fetchedAt }); return buildEnvelope(mapped, buildMeta('all-symbols', { source: 'live', fetchedAt: response.transportMeta.fetchedAt, total: mapped.length }), { total: mapped.length });
}
function searchSymbols(query) { return getAllSymbols().then(function (result) { var q = String(query || '').trim().toLowerCase(); var filtered = result.data.filter(function (item) { return String(item.symbol || '').toLowerCase().indexOf(q) !== -1 || String(item.name || '').toLowerCase().indexOf(q) !== -1 || String(item.isin || '').toLowerCase().indexOf(q) !== -1; }); return buildEnvelope(filtered, buildMeta('symbol-search', { source: result._meta ? result._meta.source : 'derived', fetchedAt: result._meta ? result._meta.fetchedAt : isoNow() }), { total: filtered.length, query: query }); }); }
async function getMarketStatus(now) {
  var localWindow = getLocalMarketWindowStatus(now || new Date()); if (!localWindow.isWorkday) return { isOpen: false, reason: 'NON_TRADING_DAY', source: 'schedule', schedule: localWindow, _meta: { source: 'schedule', servedAt: isoNow(), marketWindow: localWindow } }; if (!localWindow.isWithinHours) return { isOpen: false, reason: 'OUTSIDE_TRADING_HOURS', source: 'schedule', schedule: localWindow, _meta: { source: 'schedule', servedAt: isoNow(), marketWindow: localWindow } };
  try { var indexResult = await getMarketIndex(); var payload = indexResult && indexResult.data ? indexResult.data : null; var state = payload ? payload.state || '' : ''; var freshnessMeta = indexResult && indexResult._meta ? indexResult._meta : null; if (!payload) return { isOpen: false, reason: 'MARKET_INDEX_UNAVAILABLE', source: 'api', schedule: localWindow }; if (state && isClosedState(state)) return { isOpen: false, reason: 'API_STATE_CLOSED', source: 'api', state: state, schedule: localWindow, dataFreshness: freshnessMeta }; if (payload.isMarketOpen) return { isOpen: true, reason: state ? 'OPEN' : 'OPEN_BY_SCHEDULE_AND_PAYLOAD', source: 'api', state: state, schedule: localWindow, dataFreshness: freshnessMeta }; return { isOpen: false, reason: state ? 'API_STATE_NOT_OPEN' : 'MARKET_STATE_UNAVAILABLE', source: 'api', state: state, schedule: localWindow, dataFreshness: freshnessMeta };
  } catch (error) { return { isOpen: false, reason: 'API_VALIDATION_FAILED', source: 'api', error: error.message, schedule: localWindow }; }
}
async function isMarketOpen() { var status = await getMarketStatus(); return status.isOpen; }
function ensureBRSConfig() { ensureEndpointConfig('BRS_INDEX', endpoints.BRS_INDEX, { includeCountParam: false, includeTypeParam: true, removeParams: ['l18', 'symbol', 'count'] }); }

module.exports = { getMarketIndex, getMarketSummary, getSymbolData, getMoneyFlow, getSymbolHistory, getAdjustedDailyCandlestick, getAllSymbols, searchSymbols, clearCache, getCacheStats, isMarketOpen, getMarketStatus, _getLocalMarketWindowStatus: getLocalMarketWindowStatus, _isClosedState: isClosedState };
