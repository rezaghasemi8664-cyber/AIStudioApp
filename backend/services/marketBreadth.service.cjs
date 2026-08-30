'use strict';

const { fetchAllSymbols } = require('./marketHistory.service.cjs');

const POSITIVE_KEYS = ['percent','percentage','changePercent','change_percent','pcp','pCp','percentClose','closePercent','plp','pLp','percentLast','lastPercent'];
const SYMBOL_KEYS = ['symbol','l18','l30','namad','name','insCode'];

function firstNumber(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value === null || value === undefined || value === '') continue;
    const n = Number(String(value).replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function hasSymbol(item) {
  return SYMBOL_KEYS.some((key) => item?.[key] !== null && item?.[key] !== undefined && String(item[key]).trim());
}

function classify(change) {
  if (change === null) return 'unknown';
  if (change > 0) return 'positive';
  if (change < 0) return 'negative';
  return 'neutral';
}

function calculateBreadth(symbols) {
  if (!Array.isArray(symbols)) return null;
  const usable = symbols.filter(hasSymbol);
  const classified = usable.map((item) => classify(firstNumber(item, POSITIVE_KEYS)));
  const positive = classified.filter((x) => x === 'positive').length;
  const negative = classified.filter((x) => x === 'negative').length;
  const neutral = classified.filter((x) => x === 'neutral').length;
  const unknown = classified.filter((x) => x === 'unknown').length;
  const classifiedTotal = positive + negative + neutral;
  const total = usable.length;

  if (classifiedTotal === 0) return { available: false, reason: 'NO_SYMBOL_CHANGE_DATA', total, positive: null, negative: null, neutral: null, unknown };

  const positivePercent = classifiedTotal ? (positive / classifiedTotal) * 100 : 0;
  const negativePercent = classifiedTotal ? (negative / classifiedTotal) * 100 : 0;
  const neutralPercent = classifiedTotal ? (neutral / classifiedTotal) * 100 : 0;
  const advanceDeclineRatio = negative > 0 ? positive / negative : positive > 0 ? null : 0;
  const score = Math.round(50 + ((positive - negative) / Math.max(classifiedTotal, 1)) * 50);

  return {
    available: true,
    positive,
    negative,
    neutral,
    unknown,
    total,
    classifiedTotal,
    positivePercent,
    negativePercent,
    neutralPercent,
    advanceDeclineRatio,
    score: Math.max(0, Math.min(100, score)),
    interpretation: positive > negative * 1.2 ? 'عرض بازار مثبت و گسترده است' : negative > positive * 1.2 ? 'عرض بازار منفی و ضعیف است' : 'عرض بازار متعادل است'
  };
}

let cache = { value: null, timestamp: 0 };
const TTL = 2 * 60 * 1000;

async function getMarketBreadth() {
  if (cache.value && Date.now() - cache.timestamp < TTL) return cache.value;
  try {
    const symbols = await fetchAllSymbols();
    const result = calculateBreadth(symbols);
    cache = { value: result, timestamp: Date.now() };
    return result;
  } catch (error) {
    return { available: false, reason: 'BREADTH_FETCH_FAILED', error: error.message, positive: null, negative: null, neutral: null, total: null };
  }
}

module.exports = { calculateBreadth, getMarketBreadth };
