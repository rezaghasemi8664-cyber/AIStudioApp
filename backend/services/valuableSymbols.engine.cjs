'use strict';

// Independent analysis engine. It intentionally does not import the scalping engine.
const market = require('./sharedMarket.service.cjs');
const codal = require('./codalIntelligence.service.cjs');

const MAX_RESULTS = 20;
const MIN_HISTORY = 20;
let cachedResults = [];
let cachedEvaluatedAt = null;

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function analyzeTechnical(history, currentPrice) {
  const rows = (Array.isArray(history) ? history : [])
    .filter(row => [row.open, row.high, row.low, row.close].every(v => toNumber(v) > 0))
    .reverse();
  if (rows.length < MIN_HISTORY || !(toNumber(currentPrice) > 0)) return null;
  const closes = rows.map(row => toNumber(row.close));
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  let gains = 0, losses = 0;
  for (let i = closes.length - 14; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
  }
  const rsi14 = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  const recent = rows.slice(-10);
  const support = Math.min(...recent.map(row => toNumber(row.low)));
  const resistance = Math.max(...recent.map(row => toNumber(row.high)));
  const price = toNumber(currentPrice);
  if (!(sma20 > 0 && support > 0 && resistance > support) ||
      price < sma20 || price <= support || rsi14 < 45 || rsi14 > 68) return null;
  const risk = price - support;
  if (!(risk > 0)) return null;
  return {
    score: Math.round(100 - Math.abs(56 - rsi14)),
    currentPrice: price,
    entryPrice: price,
    targetPrice: price + risk * 2,
    stopLoss: support,
    sma20,
    rsi14,
    support,
    resistance
  };
}

function analyzeFundamental(items) {
  for (const item of Array.isArray(items) ? items : []) {
    const metrics = item && item.financialMetrics;
    if (!metrics) continue;
    const eps = toNumber(metrics.eps);
    const netProfit = toNumber(metrics.netProfit);
    if (!((eps !== null && eps > 0) || (netProfit !== null && netProfit > 0))) continue;
    let score = 50;
    if (eps > 0) score += 20;
    if (netProfit > 0) score += 20;
    if (toNumber(metrics.revenueGrowthPercent) > 0) score += 5;
    if (toNumber(metrics.netProfitGrowthPercent) > 0) score += 5;
    return { score, eps, netProfit, revenue: toNumber(metrics.revenue), reportTitle: item.title || null, reportDate: item.publishDate || null, source: 'codal' };
  }
  return null;
}

async function evaluateValuableSymbols({ limit = MAX_RESULTS } = {}) {
  const symbols = await market.getSymbols({ limit: 1200 });
  const candidates = symbols
    .filter(row => row && row.symbol && !row.isStale && toNumber(row.lastPrice) > 0 && toNumber(row.closePrice) > 0)
    .sort((a, b) => (toNumber(b.value) || 0) - (toNumber(a.value) || 0))
    .slice(0, 60);
  const results = [];
  for (const row of candidates) {
    let history, reports;
    try {
      history = await market.getSymbolHistory(row.symbol, 40);
      const technical = analyzeTechnical(history, row.lastPrice);
      if (!technical) continue;
      reports = await codal.getReports({ symbol: row.symbol, limit: 30 });
      const fundamental = analyzeFundamental(reports.items);
      if (!fundamental) continue;
      results.push({
        symbol: row.symbol, name: row.name || row.symbol, sector: row.sector || null,
        score: Math.round(technical.score * 0.6 + fundamental.score * 0.4),
        ...technical, fundamental, source: 'shared-market-db+codal',
        marketUpdatedAt: row.updatedAt || null, evaluatedAt: new Date().toISOString()
      });
    } catch (error) {
      // Missing/stale inputs disqualify the candidate; no synthetic fallback data.
      continue;
    }
  }
  cachedResults = results.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(Number(limit) || MAX_RESULTS, MAX_RESULTS)));
  cachedEvaluatedAt = new Date().toISOString();
  return cachedResults;
}

function getCachedValuableSymbols() {
  return { results: cachedResults, evaluatedAt: cachedEvaluatedAt };
}

module.exports = { evaluateValuableSymbols, getCachedValuableSymbols, analyzeTechnical, analyzeFundamental };
