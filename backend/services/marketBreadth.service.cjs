'use strict';

const { fetchAllSymbols } = require('./marketHistory.service.cjs');
const env = require('../config/env.cjs');

const CDN = 'https://cdn.tsetmc.com/api';
const timeoutMs = Number(env.BRS_TIMEOUT_MS) || 15000;

const CHANGE_KEYS = ['plp','pLp','percentLast','lastPercent','priceChangePercent','price_change_percent','pcp','pCp','percentClose','closePercent','changePercent','change_percent','percentage','percent'];
const LAST_PRICE_KEYS = ['pl','pDrCotVal','lastPrice','last','priceLast','closeLast'];
const PREV_CLOSE_KEYS = ['py','priceYesterday','previousClose','prevClose','yesterdayClose','yesterdayPrice','pPriceYesterday'];
const CLOSE_PRICE_KEYS = ['pc','pClosing','closingPrice','closePrice','close'];
const VOLUME_KEYS = ['qTotTran5J','tvol','totalVolume','volume'];
const VALUE_KEYS = ['qTotCap','tval','totalValue','tradeValue'];
const SYMBOL_KEYS = ['lVal18AFC','lVal18','symbol','l18','l30','namad','name','ticker'];
const ARRAY_KEYS = ['symbols','data','items','result','results','rows','list','records','clientTypeAllDto','sectorSummeries','sectorsSummary'];

function firstNumber(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value === null || value === undefined || value === '') continue;
    const number = Number(String(value).replace(/,/g, '').replace(/٪/g, '').trim());
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeSymbolName(item) {
  for (const key of SYMBOL_KEYS) {
    const value = item?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return null;
}

function getInsCode(item) {
  return String(item?.insCode ?? item?.inscode ?? item?.InsCode ?? '').trim() || null;
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
  return Object.values(payload).filter(value => value && typeof value === 'object' && !Array.isArray(value));
}

async function jsonGet(url) {
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

async function textGet(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/plain,text/csv,*/*', 'User-Agent': 'AIStudioApp/5.0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TSETMC ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveAllSymbols() {
  const base = env.BRS_ALL_SYMBOLS_URL || 'https://Api.BrsApi.ir/Tsetmc/AllSymbols.php';
  const url = new URL(base);
  if (env.BRS_API_KEY) url.searchParams.set('key', env.BRS_API_KEY);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'AIStudioApp/5.0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`BRS AllSymbols ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchClientTypeAll() {
  try {
    const payload = await jsonGet(`${CDN}/ClientType/GetClientTypeAll`);
    const rows = flatten(payload).filter(row => getInsCode(row));
    if (rows.length) return rows;
    throw new Error('ClientType/GetClientTypeAll returned no rows');
  } catch (primaryError) {
    const text = await textGet('https://old.tsetmc.com/tsev2/data/ClientTypeAll.aspx');
    const rows = [];
    for (const record of text.split(';')) {
      const parts = record.trim().split(',');
      if (parts.length < 9 || !parts[0]) continue;
      rows.push({
        insCode: parts[0],
        buy_CountI: Number(parts[1]) || 0,
        buy_CountN: Number(parts[2]) || 0,
        buy_I_Volume: Number(parts[3]) || 0,
        buy_N_Volume: Number(parts[4]) || 0,
        sell_CountI: Number(parts[5]) || 0,
        sell_CountN: Number(parts[6]) || 0,
        sell_I_Volume: Number(parts[7]) || 0,
        sell_N_Volume: Number(parts[8]) || 0,
      });
    }
    if (!rows.length) throw new Error(`ClientTypeAll unavailable: ${primaryError.message}`);
    return rows;
  }
}

function moneyFlowFromClientTypes(rows, priceByCode) {
  let buyVolume = 0;
  let sellVolume = 0;
  let buyValue = 0;
  let sellValue = 0;
  let buyCount = 0;
  let sellCount = 0;
  let matchedSymbols = 0;

  for (const row of rows) {
    const buy = firstNumber(row, ['buy_I_Volume','buyIVolume','buyIvolume','buy_I_volume','buyVolumeI']) || 0;
    const sell = firstNumber(row, ['sell_I_Volume','sellIVolume','sellIvolume','sell_I_volume','sellVolumeI']) || 0;
    const buyCountRow = firstNumber(row, ['buy_CountI','buyI_Count','buy_I_Count']) || 0;
    const sellCountRow = firstNumber(row, ['sell_CountI','sellI_Count','sell_I_Count']) || 0;
    const explicitBuyValue = firstNumber(row, ['buy_I_Value','buyIValue','buy_I_value']);
    const explicitSellValue = firstNumber(row, ['sell_I_Value','sellIValue','sell_I_value']);
    const price = priceByCode.get(getInsCode(row)) || 0;

    buyVolume += buy;
    sellVolume += sell;
    buyValue += explicitBuyValue ?? buy * price;
    sellValue += explicitSellValue ?? sell * price;
    buyCount += buyCountRow;
    sellCount += sellCountRow;
    if (buy > 0 || sell > 0) matchedSymbols += 1;
  }

  if (!matchedSymbols) return { available: false, reason: 'REAL_MONEY_FLOW_UNAVAILABLE' };
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

async function fetchSectorsSummary() {
  const payload = await jsonGet(`${CDN}/MarketData/GetSectorsSummary`);
  const rows = flatten(payload);
  return rows.map(row => ({
    name: row.lSecVal ?? row.lVal30 ?? row.name ?? row.sectorName ?? row.title ?? row.sector,
    changePercent: firstNumber(row, ['changePercent','change_percentage','percent','pChange','change','changeValue','priceChangePercent']),
    symbols: firstNumber(row, ['symbols','symbolCount','count','numberOfSymbols','insCount']),
    value: firstNumber(row, ['tradeValue','tval','value','qTotCap']),
  })).filter(row => row.name && row.changePercent !== null);
}

function derivedPercent(item) {
  const direct = CHANGE_KEYS.map(key => firstNumber(item, [key])).filter(value => value !== null);
  const nonZero = direct.find(value => Math.abs(value) > 1e-12);
  if (nonZero !== undefined) return nonZero;
  const last = firstNumber(item, LAST_PRICE_KEYS);
  const previous = firstNumber(item, PREV_CLOSE_KEYS);
  if (last !== null && previous !== null && previous !== 0) return ((last - previous) / previous) * 100;
  const close = firstNumber(item, CLOSE_PRICE_KEYS);
  if (close !== null && previous !== null && previous !== 0) return ((close - previous) / previous) * 100;
  return null;
}

function calculateBreadth(payload, extras = {}) {
  const symbols = flatten(payload);
  if (!symbols.length) return { available: false, reason: 'NO_SYMBOL_DATA' };

  const usable = symbols.filter(item => normalizeSymbolName(item));
  const rows = usable.map(item => ({
    item,
    symbol: normalizeSymbolName(item),
    code: getInsCode(item),
    pct: derivedPercent(item),
  })).filter(row => row.pct !== null && Number.isFinite(row.pct));

  const priceByCode = new Map(rows.filter(row => row.code).map(row => [
    row.code,
    firstNumber(row.item, LAST_PRICE_KEYS) ?? firstNumber(row.item, CLOSE_PRICE_KEYS) ?? 0,
  ]));

  const moneyFlow = extras.clientTypes?.length
    ? moneyFlowFromClientTypes(extras.clientTypes, priceByCode)
    : { available: false, reason: 'REAL_MONEY_FLOW_UNAVAILABLE' };

  const sectors = extras.sectors?.length
    ? {
        available: true,
        leaders: [...extras.sectors].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5),
        laggards: [...extras.sectors].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5),
      }
    : { available: false, leaders: [], laggards: [], reason: 'SECTOR_DATA_UNAVAILABLE' };

  if (!rows.length) {
    return {
      available: true,
      positive: null,
      negative: null,
      neutral: null,
      unknown: usable.length,
      total: usable.length,
      classifiedTotal: 0,
      coveragePercent: 0,
      topGainers: [],
      topLosers: [],
      topVolumes: [],
      moneyFlow,
      sectors,
      interpretation: 'داده تغییرات قیمت نمادها برای محاسبه breadth معتبر نیست؛ جریان پول و صنایع مستقل بررسی شده‌اند.',
    };
  }

  const positive = rows.filter(row => row.pct > 0).length;
  const negative = rows.filter(row => row.pct < 0).length;
  const neutral = rows.filter(row => row.pct === 0).length;
  const total = usable.length;
  const classifiedTotal = rows.length;

  const topGainers = rows.filter(row => row.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 10).map(row => ({
    symbol: row.symbol,
    changePercent: +row.pct.toFixed(4),
    volume: firstNumber(row.item, VOLUME_KEYS),
    value: firstNumber(row.item, VALUE_KEYS),
  }));

  const topLosers = rows.filter(row => row.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 10).map(row => ({
    symbol: row.symbol,
    changePercent: +row.pct.toFixed(4),
    volume: firstNumber(row.item, VOLUME_KEYS),
    value: firstNumber(row.item, VALUE_KEYS),
  }));

  const topVolumes = [...rows].sort((a, b) => (firstNumber(b.item, VOLUME_KEYS) || 0) - (firstNumber(a.item, VOLUME_KEYS) || 0)).slice(0, 10).map(row => ({
    symbol: row.symbol,
    volume: firstNumber(row.item, VOLUME_KEYS),
    value: firstNumber(row.item, VALUE_KEYS),
    changePercent: +row.pct.toFixed(4),
  }));

  return {
    available: true,
    positive,
    negative,
    neutral,
    unknown: total - classifiedTotal,
    total,
    classifiedTotal,
    coveragePercent: classifiedTotal / total * 100,
    positivePercent: positive / classifiedTotal * 100,
    negativePercent: negative / classifiedTotal * 100,
    neutralPercent: neutral / classifiedTotal * 100,
    advanceDeclineRatio: negative ? positive / negative : null,
    score: Math.max(0, Math.min(100, Math.round(50 + ((positive - negative) / classifiedTotal) * 50))),
    topGainers,
    topLosers,
    topVolumes,
    moneyFlow,
    sectors,
    interpretation: positive > negative * 1.2 ? 'عرض بازار مثبت و گسترده است' : negative > positive * 1.2 ? 'عرض بازار منفی و ضعیف است' : 'عرض بازار متعادل است',
  };
}

let cache = { value: null, timestamp: 0 };
const TTL = 2 * 60 * 1000;

async function getMarketBreadth() {
  if (cache.value && Date.now() - cache.timestamp < TTL) return cache.value;
  try {
    let payload;
    try {
      payload = await fetchLiveAllSymbols();
    } catch {
      payload = await fetchAllSymbols();
    }

    const [clientTypesResult, sectorsResult] = await Promise.allSettled([
      fetchClientTypeAll(),
      fetchSectorsSummary(),
    ]);

    const extras = {
      clientTypes: clientTypesResult.status === 'fulfilled' ? clientTypesResult.value : [],
      sectors: sectorsResult.status === 'fulfilled' ? sectorsResult.value : [],
    };

    const result = calculateBreadth(payload, extras);
    result.diagnostics = {
      moneyFlowSource: 'TSETMC ClientType/GetClientTypeAll (fallback: old ClientTypeAll.aspx)',
      sectorSource: 'TSETMC MarketData/GetSectorsSummary',
      clientTypeRows: extras.clientTypes.length,
      sectorRows: extras.sectors.length,
      clientTypeError: clientTypesResult.status === 'rejected' ? clientTypesResult.reason?.message : null,
      sectorError: sectorsResult.status === 'rejected' ? sectorsResult.reason?.message : null,
    };

    cache = { value: result, timestamp: Date.now() };
    return result;
  } catch (error) {
    return { available: false, reason: 'BREADTH_FETCH_FAILED', error: error.message };
  }
}

module.exports = { calculateBreadth, getMarketBreadth };
