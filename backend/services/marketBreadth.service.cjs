'use strict';

const { fetchAllSymbols } = require('./marketHistory.service.cjs');
const env = require('../config/env.cjs');

const CDN = 'https://cdn.tsetmc.com/api';
const timeoutMs = Number(env.BRS_TIMEOUT_MS) || 15000;
const TTL = 2 * 60 * 1000;
let cache = { value: null, timestamp: 0 };

const NAME_KEYS = ['lVal18AFC','lVal18','symbol','l18','l30','namad','name','ticker'];
const CODE_KEYS = ['insCode','inscode','InsCode','instrumentCode','instrumentId','ins_code'];
const SECTOR_KEYS = ['sectorName','industryName','groupName','sector','industry','group','lSecVal'];
const ARRAY_KEYS = ['symbols','data','items','result','results','rows','list','records','clientTypeAllDto','sectorSummeries','sectorsSummary','marketwatch'];
const VOLUME_KEYS = ['qTotTran5J','tvol','totalVolume','volume','tradeVolume'];
const VALUE_KEYS = ['qTotCap','tval','totalValue','tradeValue'];
const TRADE_KEYS = ['zTotTran','tno','tradeCount','totalTrades'];

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/٪/g, '').trim());
  return Number.isFinite(n) ? n : null;
}
function first(obj, keys) {
  for (const key of keys) {
    const n = num(obj?.[key]);
    if (n !== null) return n;
  }
  return null;
}
function nameOf(row) {
  for (const key of NAME_KEYS) {
    if (row?.[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  }
  return null;
}
function codeOf(row) {
  for (const key of CODE_KEYS) {
    if (row?.[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  }
  return null;
}
function sectorOf(row) {
  for (const key of SECTOR_KEYS) {
    const value = row?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}
function flatten(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ARRAY_KEYS) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === 'object') {
      const nested = flatten(payload[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}
async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'AIStudioApp/5.0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TSETMC ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function percentChange(row) {
  const directKeys = ['plp','pLp','percentLast','lastPercent','priceChangePercent','price_change_percent','pcp','pCp','percentClose','closePercent','changePercent','change_percent','percentage','percent'];
  for (const key of directKeys) {
    const n = num(row?.[key]);
    if (n !== null) return n;
  }
  const last = first(row, ['pl','pDrCotVal','lastPrice','last','priceLast']);
  const close = first(row, ['pc','pClosing','closingPrice','closePrice','close']);
  const previous = first(row, ['py','priceYesterday','previousClose','prevClose','yesterdayClose','yesterdayPrice']);
  const base = close ?? last;
  if (base !== null && previous !== null && previous !== 0) return ((base - previous) / previous) * 100;
  if (last !== null && previous !== null && previous !== 0) return ((last - previous) / previous) * 100;
  return null;
}
function isIndex(row) {
  const name = nameOf(row) || '';
  return /شاخص|index/i.test(name) || String(row?.paperType ?? row?.type ?? '').toLowerCase() === 'index';
}
function isTradable(row) {
  if (!nameOf(row) || isIndex(row)) return false;
  const tradeCount = first(row, TRADE_KEYS);
  const volume = first(row, VOLUME_KEYS);
  const value = first(row, VALUE_KEYS);
  return (tradeCount !== null && tradeCount > 0) || (volume !== null && volume > 0) || (value !== null && value > 0);
}
function normalizeRows(payload) {
  return flatten(payload)
    .map(row => ({
      item: row,
      symbol: nameOf(row),
      code: codeOf(row),
      pct: percentChange(row),
      traded: isTradable(row),
      volume: first(row, VOLUME_KEYS) || 0,
      value: first(row, VALUE_KEYS) || 0,
    }))
    .filter(row => row.symbol);
}

// TSETMC ClientTypeAll order is:
// insCode,n_buy_count,l_buy_count,n_buy_volume,l_buy_volume,
// n_sell_count,l_sell_count,n_sell_volume,l_sell_volume.
function parseLegacyClientTypes(text) {
  return String(text || '')
    .split(';')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(','))
    .filter(parts => parts.length >= 9 && parts[0])
    .map(parts => ({
      insCode: String(parts[0]).trim(),
      buy_CountI: num(parts[1]) || 0,
      buy_CountN: num(parts[2]) || 0,
      buy_I_Volume: num(parts[3]) || 0,
      buy_N_Volume: num(parts[4]) || 0,
      sell_CountI: num(parts[5]) || 0,
      sell_CountN: num(parts[6]) || 0,
      sell_I_Volume: num(parts[7]) || 0,
      sell_N_Volume: num(parts[8]) || 0,
    }));
}
async function fetchClientTypes() {
  try {
    const payload = await getJson(`${CDN}/ClientType/GetClientTypeAll`);
    const rows = flatten(payload).filter(row => codeOf(row));
    if (rows.length) return rows;
  } catch (error) {
    console.warn('[MARKET][ClientType JSON]', error.message);
  }
  try {
    const response = await fetch('http://old.tsetmc.com/tsev2/data/ClientTypeAll.aspx', {
      headers: { Accept: 'text/plain,*/*', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error(`TSETMC ${response.status}`);
    return parseLegacyClientTypes(await response.text());
  } catch (error) {
    console.warn('[MARKET][ClientType legacy]', error.message);
    return [];
  }
}

function moneyFlowFromClientTypes(clientRows, priceByCode) {
  let buyVolume = 0, sellVolume = 0, buyValue = 0, sellValue = 0;
  let buyCount = 0, sellCount = 0, matchedSymbols = 0;
  for (const client of clientRows) {
    const code = codeOf(client);
    if (!code || !priceByCode.has(code)) continue;
    const market = priceByCode.get(code);
    const price = first(market, ['pl','pDrCotVal','lastPrice','pc','pClosing','close']) || 0;
    const buyV = first(client, ['buy_I_Volume','buyIVolume','buyIvolume']) || 0;
    const sellV = first(client, ['sell_I_Volume','sellIVolume','sellIvolume']) || 0;
    const buyVal = first(client, ['buy_I_Value','buyIValue','buy_I_value']);
    const sellVal = first(client, ['sell_I_Value','sellIValue','sell_I_value']);
    buyVolume += buyV;
    sellVolume += sellV;
    buyValue += buyVal ?? buyV * price;
    sellValue += sellVal ?? sellV * price;
    buyCount += first(client, ['buy_CountI','buyI_Count','buy_I_Count']) || 0;
    sellCount += first(client, ['sell_CountI','sellI_Count','sell_I_Count']) || 0;
    matchedSymbols += 1;
  }
  if (!matchedSymbols) return null;
  return {
    available: true,
    buyVolume,
    sellVolume,
    netVolume: buyVolume - sellVolume,
    buyValue,
    sellValue,
    netValue: buyValue - sellValue,
    buyCount,
    sellCount,
    matchedSymbols,
  };
}

async function fetchSectorsApi() {
  try {
    const payload = await getJson(`${CDN}/MarketData/GetSectorsSummary`);
    return flatten(payload)
      .map(row => ({
        name: row.lSecVal ?? row.lVal30 ?? row.name ?? row.sectorName ?? row.title ?? row.sector,
        changePercent: first(row, ['changePercent','change_percentage','percent','pChange','change','changeValue','priceChangePercent']),
        symbols: first(row, ['symbols','symbolCount','count','numberOfSymbols','insCount']),
        value: first(row, ['tradeValue','tval','value','qTotCap']),
      }))
      .filter(row => row.name && row.changePercent !== null);
  } catch (error) {
    console.warn('[MARKET][Sectors]', error.message);
    return [];
  }
}
function deriveSectors(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.traded || row.pct === null) continue;
    const sector = sectorOf(row.item);
    if (!sector) continue;
    const current = groups.get(sector) || { name: sector, symbols: 0, sumPct: 0, value: 0 };
    current.symbols += 1;
    current.sumPct += row.pct;
    current.value += row.value;
    groups.set(sector, current);
  }
  return [...groups.values()].map(group => ({
    name: group.name,
    symbols: group.symbols,
    changePercent: group.sumPct / group.symbols,
    value: group.value,
  }));
}

function build(payload, clientRows = [], sectorApiRows = []) {
  const all = normalizeRows(payload);
  const rows = all.filter(row => row.traded && row.pct !== null);
  const positive = rows.filter(row => row.pct > 0).length;
  const negative = rows.filter(row => row.pct < 0).length;
  const neutral = rows.filter(row => row.pct === 0).length;
  const total = positive + negative + neutral;

  const priceByCode = new Map(all.filter(row => row.code).map(row => [row.code, row.item]));
  const moneyFlow = moneyFlowFromClientTypes(clientRows, priceByCode);

  // Prefer the official TSETMC sector summary; derive from symbols only as fallback.
  const derivedSectors = deriveSectors(all);
  const sectors = sectorApiRows.length ? sectorApiRows : derivedSectors;
  const leaders = [...sectors].sort((a,b) => (b.changePercent || 0) - (a.changePercent || 0)).slice(0, 5);
  const laggards = [...sectors].sort((a,b) => (a.changePercent || 0) - (b.changePercent || 0)).slice(0, 5);

  const topGainers = [...rows].filter(r => r.pct > 0).sort((a,b) => b.pct - a.pct).slice(0, 10).map(r => ({ symbol:r.symbol, changePercent:+r.pct.toFixed(4), volume:r.volume, value:r.value }));
  const topLosers = [...rows].filter(r => r.pct < 0).sort((a,b) => a.pct - b.pct).slice(0, 10).map(r => ({ symbol:r.symbol, changePercent:+r.pct.toFixed(4), volume:r.volume, value:r.value }));
  const topVolumes = [...rows].sort((a,b) => b.volume - a.volume).slice(0, 10).map(r => ({ symbol:r.symbol, volume:r.volume, value:r.value, changePercent:+r.pct.toFixed(4) }));

  return {
    available: true,
    positive,
    negative,
    neutral,
    unknown: 0,
    total,
    classifiedTotal: total,
    coveragePercent: total ? 100 : 0,
    positivePercent: total ? positive / total * 100 : 0,
    negativePercent: total ? negative / total * 100 : 0,
    neutralPercent: total ? neutral / total * 100 : 0,
    advanceDeclineRatio: negative ? positive / negative : null,
    score: total ? Math.max(0, Math.min(100, Math.round(50 + ((positive - negative) / total) * 50))) : null,
    topGainers,
    topLosers,
    topVolumes,
    moneyFlow: moneyFlow || { available:false, reason:'REAL_MONEY_FLOW_UNAVAILABLE', matchedSymbols:0 },
    sectors: sectors.length
      ? { available:true, leaders, laggards, rows:sectors, source:sectorApiRows.length ? 'tsetmc-sector-summary' : 'symbol-aggregation' }
      : { available:false, leaders:[], laggards:[], rows:[], reason:'SECTOR_DATA_UNAVAILABLE' },
    interpretation: positive > negative * 1.2 ? 'عرض بازار مثبت و گسترده است' : negative > positive * 1.2 ? 'عرض بازار منفی و ضعیف است' : 'عرض بازار متعادل است',
    diagnostics: {
      clientTypeRows: clientRows.length,
      matchedClientTypeRows: moneyFlow?.matchedSymbols || 0,
      sectorRows: sectors.length,
      sectorSource: sectorApiRows.length ? 'tsetmc-sector-summary' : derivedSectors.length ? 'symbol-aggregation' : 'none',
      breadthRule: 'فقط نمادهای معامله‌شده با درصد تغییر معتبر؛ شاخص‌ها و رکوردهای بدون قیمت تغییر معتبر حذف شدند',
      sourceRows: all.length,
      classifiedRows: total,
    },
  };
}

async function getMarketBreadth() {
  if (cache.value && Date.now() - cache.timestamp < TTL) return cache.value;
  try {
    const payload = await fetchAllSymbols();
    const [clientResult, sectorResult] = await Promise.allSettled([fetchClientTypes(), fetchSectorsApi()]);
    const clientRows = clientResult.status === 'fulfilled' ? clientResult.value : [];
    const sectorRows = sectorResult.status === 'fulfilled' ? sectorResult.value : [];
    const result = build(payload, clientRows, sectorRows);
    result.diagnostics.clientTypeError = clientResult.status === 'rejected' ? clientResult.reason?.message : null;
    result.diagnostics.sectorError = sectorResult.status === 'rejected' ? sectorResult.reason?.message : null;
    cache = { value: result, timestamp: Date.now() };
    return result;
  } catch (error) {
    return { available:false, reason:'BREADTH_FETCH_FAILED', error:error.message };
  }
}

module.exports = {
  calculateBreadth: (payload, extras = {}) => build(payload, extras.clientTypes || [], extras.sectors || []),
  getMarketBreadth,
};
