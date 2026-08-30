'use strict';

const { fetchAllSymbols } = require('./marketHistory.service.cjs');

const CHANGE_KEYS = [
  'percent','percentage','changePercent','change_percent','pcp','pCp',
  'percentClose','closePercent','plp','pLp','percentLast','lastPercent',
  'priceChangePercent','price_change_percent','changePercentage','change'
];
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
  const classified = usable.map((item) => classify(firstNumber(item, CHANGE_KEYS)));
  const positive = classified.filter((x) => x === 'positive').length;
  const negative = classified.filter((x) => x === 'negative').length;
  const neutral = classified.filter((x) => x === 'neutral').length;
  const unknown = classified.filter((x) => x === 'unknown').length;
  const classifiedTotal = positive + negative + neutral;
  const total = usable.length;

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
    positivePercent,
    negativePercent,
    neutralPercent,
    advanceDeclineRatio,
    score: Math.max(0, Math.min(100, score)),
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