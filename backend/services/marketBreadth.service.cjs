'use strict';

const { fetchAllSymbols } = require('./marketHistory.service.cjs');

const CHANGE_KEYS = [
  'plp','pLp','percentLast','lastPercent','priceChangePercent','price_change_percent',
  'pcp','pCp','percentClose','closePercent','changePercent','change_percent',
  'percentage','percent'
];
const LAST_PRICE_KEYS = ['pl','pDrCotVal','lastPrice','last','priceLast','closeLast'];
const PREV_CLOSE_KEYS = ['py','priceYesterday','previousClose','prevClose','yesterdayClose'];
const CLOSE_PRICE_KEYS = ['pc','pClosing','closingPrice','closePrice','close'];
const VOLUME_KEYS = ['qTotTran5J','tvol','totalVolume','volume'];
const VALUE_KEYS = ['qTotCap','tval','totalValue','tradeValue'];
const BUY_I_VOL_KEYS = ['buy_I_Volume','buyIVolume','realBuyVolume','individualBuyVolume'];
const SELL_I_VOL_KEYS = ['sell_I_Volume','sellIVolume','realSellVolume','individualSellVolume'];
const SECTOR_KEYS = ['sector','industry','group','sectorName','industryName','groupName'];
const SECTOR_KEYS = ['sector','industry','group','sectorName','industryName','groupName'];
const SYMBOL_KEYS = ['symbol','l18','l30','namad','name','insCode','inscode','ticker'];
const ARRAY_KEYS = ['symbols','data','items','result','results','rows','list','records'];

function firstNumber(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value === null || value === undefined || value === '') continue;
    const n = Number(String(value).replace(/,/g, '').replace(/٪/g, '').trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function derivedPercent(item) {
  const direct = firstNumber(item, CHANGE_KEYS);
  if (direct !== null) return direct;
  const last = firstNumber(item, LAST_PRICE_KEYS);
  const prev = firstNumber(item, PREV_CLOSE_KEYS);
  if (last !== null && prev !== null && prev !== 0) return ((last - prev) / prev) * 100;
  const close = firstNumber(item, CLOSE_PRICE_KEYS);
  if (close !== null && prev !== null && prev !== 0) return ((close - prev) / prev) * 100;
  return null;
}

function normalizeSymbolName(item) {
  for (const key of SYMBOL_KEYS) {
    const value = item?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return null;
}
function normalizeSectorName(item) {
  for (const key of SECTOR_KEYS) {
    const value = item?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return null;
}

function hasSymbol(item) {
  return SYMBOL_KEYS.some((key) => item?.[key] !== null && item?.[key] !== undefined && String(item[key]).trim());
}

function flattenSymbolPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  for (const key of ARRAY_KEYS) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === 'object') {
      const nested = flattenSymbolPayload(payload[key]);
      if (nested.length) return nested;
    }
  }

  // Some feeds return an object keyed by instrument code.
  const values = Object.values(payload).filter((value) => value && typeof value === 'object' && !Array.isArray(value));
  if (values.length) return values;
  return [];
}

function classify(change) {
  if (change === null) return 'unknown';
  if (change > 0) return 'positive';
  if (change < 0) return 'negative';
  return 'neutral';
}

function calculateBreadth(payload) {
  const symbols = flattenSymbolPayload(payload);
  if (!symbols.length) {
    return {
      available: false,
      reason: 'NO_SYMBOL_DATA',
      positive: null,
      negative: null,
      neutral: null,
      unknown: 0,
      total: 0,
      classifiedTotal: 0,
    };
  }

  const usable = symbols.filter(hasSymbol);
  const rows = usable
    .map((item) => ({ item, symbol: normalizeSymbolName(item), pct: derivedPercent(item) }))
    .filter((row) => row.symbol && row.pct !== null && Number.isFinite(row.pct));

  const positive = rows.filter((x) => x.pct > 0).length;
  const negative = rows.filter((x) => x.pct < 0).length;
  const neutral = rows.filter((x) => x.pct === 0).length;
  const classifiedTotal = rows.length;
  const total = usable.length;
  const unknown = total - classifiedTotal;

  if (classifiedTotal === 0) {
    return { available: false, reason: 'NO_VALID_SYMBOL_CHANGE_DATA', total, positive: null, negative: null, neutral: null, unknown, classifiedTotal: 0 };
  }

  const topGainers = rows.filter(x=>x.pct > 0).sort((a,b)=>b.pct-a.pct).slice(0,10)
    .map(x=>({symbol:x.symbol, changePercent:Number(x.pct.toFixed(4)), volume:firstNumber(x.item,VOLUME_KEYS), value:firstNumber(x.item,VALUE_KEYS)}));
  const topLosers = rows.filter(x=>x.pct < 0).sort((a,b)=>a.pct-b.pct).slice(0,10)
    .map(x=>({symbol:x.symbol, changePercent:Number(x.pct.toFixed(4)), volume:firstNumber(x.item,VOLUME_KEYS), value:firstNumber(x.item,VALUE_KEYS)}));
  const topVolumes = [...rows].sort((a,b)=>(firstNumber(b.item,VOLUME_KEYS)||0)-(firstNumber(a.item,VOLUME_KEYS)||0))
    .slice(0,10).map(x=>({symbol:x.symbol, volume:firstNumber(x.item,VOLUME_KEYS), value:firstNumber(x.item,VALUE_KEYS), changePercent:Number(x.pct.toFixed(4))}));

  const sectorMap = new Map();
  for (const row of rows) {
    const sector = normalizeSectorName(row.item);
    if (!sector) continue;
    const entry = sectorMap.get(sector) || { name: sector, sum: 0, count: 0 };
    entry.sum += row.pct;
    entry.count += 1;
    sectorMap.set(sector, entry);
  }
  const sectorList = [...sectorMap.values()]
    .filter(x=>x.count > 0)
    .map(x=>({name:x.name, changePercent:Number((x.sum/x.count).toFixed(4)), symbols:x.count}))
    .sort((a,b)=>b.changePercent-a.changePercent);
  const sectors = sectorList.length
    ? {available:true, leaders:sectorList.slice(0,5), laggards:sectorList.slice(-5).reverse()}
    : {available:false, leaders:[], laggards:[], reason:'SECTOR_DATA_UNAVAILABLE'};

  let buyIVolume = 0, sellIVolume = 0, moneyPriceValue = 0;
  for (const row of rows) {
    const buy = firstNumber(row.item, BUY_I_VOL_KEYS) || 0;
    const sell = firstNumber(row.item, SELL_I_VOL_KEYS) || 0;
    const price = firstNumber(row.item, LAST_PRICE_KEYS) || firstNumber(row.item, CLOSE_PRICE_KEYS) || 0;
    buyIVolume += buy;
    sellIVolume += sell;
    if (price > 0) moneyPriceValue += (buy - sell) * price;
  }
  const moneyFlow = (buyIVolume || sellIVolume)
    ? {available:true, buyVolume:buyIVolume, sellVolume:sellIVolume, netVolume:buyIVolume-sellIVolume, netValue:moneyPriceValue}
    : {available:false, reason:'REAL_MONEY_FLOW_UNAVAILABLE' };

  if (classifiedTotal === 0) {
    return { available: false, reason: 'NO_SYMBOL_CHANGE_DATA', total, positive: null, negative: null, neutral: null, unknown, classifiedTotal: 0 };
  }

  const positivePercent = (positive / classifiedTotal) * 100;
  const negativePercent = (negative / classifiedTotal) * 100;
  const neutralPercent = (neutral / classifiedTotal) * 100;
  const advanceDeclineRatio = negative > 0 ? positive / negative : positive > 0 ? null : 0;
  const score = Math.round(50 + ((positive - negative) / classifiedTotal) * 50);

  return {
    available: true,
    positive,
    negative,
    neutral,
    unknown,
    total,
    classifiedTotal,
    coveragePercent: total ? (classifiedTotal / total) * 100 : 0,
    positivePercent: (positive / classifiedTotal) * 100,
    negativePercent: (negative / classifiedTotal) * 100,
    neutralPercent: (neutral / classifiedTotal) * 100,
    advanceDeclineRatio: negative > 0 ? positive / negative : positive > 0 ? null : 0,
    score: Math.max(0, Math.min(100, Math.round(50 + ((positive - negative) / classifiedTotal) * 50))),
    topGainers,
    topLosers,
    topVolumes,
    sectors,
    moneyFlow,
    interpretation: positive > negative * 1.2
      ? 'عرض بازار مثبت و گسترده است'
      : negative > positive * 1.2
        ? 'عرض بازار منفی و ضعیف است'
        : 'عرض بازار متعادل است',
  };
}

let cache = { value: null, timestamp: 0 };
const TTL = 2 * 60 * 1000;

async function getMarketBreadth() {
  if (cache.value && Date.now() - cache.timestamp < TTL) return cache.value;

  try {
    const payload = await fetchAllSymbols();
    const result = calculateBreadth(payload);
    cache = { value: result, timestamp: Date.now() };
    return result;
  } catch (error) {
    return {
      available: false,
      reason: 'BREADTH_FETCH_FAILED',
      error: error.message,
      positive: null,
      negative: null,
      neutral: null,
      unknown: null,
      total: null,
      classifiedTotal: null,
    };
  }
}

module.exports = { calculateBreadth, getMarketBreadth };