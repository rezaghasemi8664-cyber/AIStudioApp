'use strict';

const prisma = require('../config/prisma.cjs');

function decimalToNumber(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isMarketAnalyticsEligible(row) {
  if (!row || !row.symbol) return false;
  const last = decimalToNumber(row.lastPrice);
  const close = decimalToNumber(row.closePrice);
  const volume = row.volume == null ? 0 : Number(row.volume);
  const value = decimalToNumber(row.value);
  const realBuy = row.realBuyVolume == null ? 0 : Number(row.realBuyVolume);
  const realSell = row.realSellVolume == null ? 0 : Number(row.realSellVolume);
  // Volume is the traded-row gate for breadth. Do not require trade value:
  // some valid symbols can have a missing/zero value while still having a
  // valid price change and traded volume.
  if (!(last > 0) || !(close > 0) || !(volume > 0)) return false;

  let raw = null;
  if (row.dataJson) {
    try { raw = JSON.parse(row.dataJson); } catch (_) { raw = null; }
  }
  const yesterday = decimalToNumber(raw?.yesterday ?? raw?.previousPrice ?? raw?.yesterdayPrice);
  const pct = yesterday > 0 ? ((last - yesterday) / yesterday) * 100 : decimalToNumber(row.changePercent);

  const legalBuy = row.legalBuyVolume == null ? null : Number(row.legalBuyVolume);
  const legalSell = row.legalSellVolume == null ? null : Number(row.legalSellVolume);
  const placeholderPrice =
    last === 1 && close === 1 && pct !== null && pct <= -99.99 &&
    value === volume && realBuy === 0 && realSell === 0 &&
    legalBuy !== null && legalSell !== null &&
    legalBuy === volume && legalSell === volume;

  return !placeholderPrice;
}

function isTradingCalendarDay(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    weekday: 'short'
  }).format(date);
  return ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'].includes(weekday);
}

function normalizeMarketCurrent(row) {
  if (!row) return null;
  const calendarOpen = isTradingCalendarDay();
  return {
    id: row.id,
    marketDate: row.marketDate,
    marketStatus: calendarOpen ? row.marketStatus : 'CLOSED',
    overallIndex: decimalToNumber(row.overallIndex),
    overallChange: decimalToNumber(row.overallChange),
    equalIndex: decimalToNumber(row.equalIndex),
    equalChange: decimalToNumber(row.equalChange),
    totalTrades: row.totalTrades == null ? null : Number(row.totalTrades),
    totalVolume: row.totalVolume == null ? null : Number(row.totalVolume),
    totalValue: decimalToNumber(row.totalValue),
    positiveStocks: row.positiveStocks,
    negativeStocks: row.negativeStocks,
    neutralStocks: row.neutralStocks,
    updatedAt: row.updatedAt,
    source: row.source,
    isStale: row.isStale || !calendarOpen,
    dataJson: row.dataJson || null,
  };
}

function normalizeSymbol(row) {
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    insCode: row.insCode,
    lastPrice: decimalToNumber(row.lastPrice),
    closePrice: decimalToNumber(row.closePrice),
    change: decimalToNumber(row.change),
    changePercent: decimalToNumber(row.changePercent),
    volume: row.volume == null ? null : Number(row.volume),
    value: decimalToNumber(row.value),
    tradeCount: row.tradeCount == null ? null : Number(row.tradeCount),
    sector: row.sector,
    realBuyVolume: row.realBuyVolume == null ? null : Number(row.realBuyVolume),
    realSellVolume: row.realSellVolume == null ? null : Number(row.realSellVolume),
    legalBuyVolume: row.legalBuyVolume == null ? null : Number(row.legalBuyVolume),
    legalSellVolume: row.legalSellVolume == null ? null : Number(row.legalSellVolume),
    updatedAt: row.updatedAt,
    source: row.source,
    isStale: row.isStale,
    dataJson: row.dataJson || null,
  };
}

function normalizeMover(row) {
  return {
    id: row.id,
    category: row.category,
    symbol: row.symbol,
    price: decimalToNumber(row.price),
    changePercent: decimalToNumber(row.changePercent),
    volume: row.volume == null ? null : Number(row.volume),
    value: decimalToNumber(row.value),
    rank: row.rank,
    updatedAt: row.updatedAt,
  };
}

function normalizeIndustry(row) {
  return {
    id: row.id,
    industryCode: row.industryCode,
    industryName: row.industryName,
    symbolCount: row.symbolCount,
    changePercent: decimalToNumber(row.changePercent),
    value: decimalToNumber(row.value),
    rank: row.rank,
    updatedAt: row.updatedAt,
    source: row.source,
    isStale: row.isStale,
  };
}

function normalizeScalping(row) {
  return {
    id: row.id,
    symbol: row.symbol,
    score: decimalToNumber(row.score),
    signal: row.signal,
    entryPrice: decimalToNumber(row.entryPrice),
    stopLoss: decimalToNumber(row.stopLoss),
    takeProfit: decimalToNumber(row.takeProfit),
    currentPrice: decimalToNumber(row.currentPrice),
    confidence: decimalToNumber(row.confidence),
    strategyName: row.strategyName,
    recommendationText: row.recommendationText,
    marketDate: row.marketDate,
    status: row.status,
    meta: row.meta,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    source: row.source,
  };
}

async function getMarketCurrent() {
  const row = await prisma.marketCurrent.findFirst({
    orderBy: [{ marketDate: 'desc' }, { updatedAt: 'desc' }],
  });
  return normalizeMarketCurrent(row);
}

async function getSymbols({ symbol, limit = 5000 } = {}) {
  const take = Math.max(1, Math.min(Number(limit) || 5000, 10000));
  const rows = await prisma.marketSymbolCurrent.findMany({
    where: symbol ? { symbol } : undefined,
    orderBy: { symbol: 'asc' },
    take,
  });
  return rows.map(normalizeSymbol);
}

async function searchSymbols(query, limit = 50) {
  const q = String(query || '').trim();
  if (!q) return [];
  const take = Math.max(1, Math.min(Number(limit) || 50, 200));
  const rows = await prisma.marketSymbolCurrent.findMany({
    where: {
      OR: [
        { symbol: { contains: q } },
        { name: { contains: q } },
        { insCode: { contains: q } },
      ],
    },
    orderBy: [{ symbol: 'asc' }],
    take,
  });
  return rows.map(normalizeSymbol);
}

async function getSymbolHistory(symbol, limit = 60) {
  const name = String(symbol || '').trim();
  if (!name) return [];

  const take = Math.max(1, Math.min(Number(limit) || 60, 365));
  const rows = await prisma.marketDaily.findMany({
    where: { symbol: name },
    orderBy: { date: 'desc' },
    take,
  });

  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    date: row.date,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: row.volume == null ? 0 : Number(row.volume),
    value: row.value == null ? 0 : Number(row.value),
    trades: row.trades == null ? null : Number(row.trades),
    source: 'shared-db',
  }));
}

async function getBreadth() {
  const [market, industries] = await Promise.all([getMarketCurrent(), getIndustries(100)]);

  if (!market) return null;

  // Use the current symbol snapshot both as a breadth fallback and as the
  // source for real buy/sell volume. Raw rows remain stored, but invalid
  // placeholder-price records are excluded from derived analytics.
  const symbols = await getSymbols({ limit: 10000 });
  const valid = symbols.filter((row) =>
    isMarketAnalyticsEligible(row) &&
    !/شاخص|index/i.test(`${row.symbol} ${row.name || ""}`)
  );

  const positive = valid.filter((row) => Number(row.changePercent) > 0).length;
  const negative = valid.filter((row) => Number(row.changePercent) < 0).length;
  const neutral = valid.filter((row) => Number(row.changePercent) === 0).length;
  const total = positive + negative + neutral;

  const gainers = valid.filter((row) => Number(row.changePercent) > 0)
    .sort((a, b) => Number(b.changePercent) - Number(a.changePercent))
    .slice(0, 10).map(normalizeSymbol);
  const losers = valid.filter((row) => Number(row.changePercent) < 0)
    .sort((a, b) => Number(a.changePercent) - Number(b.changePercent))
    .slice(0, 10).map(normalizeSymbol);
  const highVolume = [...valid]
    .sort((a, b) => (Number(b.volume || 0) - Number(a.volume || 0)) || (Number(b.value || 0) - Number(a.value || 0)))
    .slice(0, 10).map(normalizeSymbol);

  const realFlowRows = valid.filter((row) =>
    Number(row.realBuyVolume || 0) > 0 || Number(row.realSellVolume || 0) > 0
  );
  const totalRealBuyVolume = realFlowRows.reduce((sum, row) => sum + Math.max(0, Number(row.realBuyVolume || 0)), 0);
  const totalRealSellVolume = realFlowRows.reduce((sum, row) => sum + Math.max(0, Number(row.realSellVolume || 0)), 0);
  const netRealBuyVolume = totalRealBuyVolume - totalRealSellVolume;

  // Industry snapshots can contain stale placeholder rows (especially ETF
  // records with impossible daily moves). Exclude only clear anomalies so
  // legitimate industry movements remain visible.
  const sectors = industries
    .filter((row) => {
      const change = Number(row.changePercent);
      if (!Number.isFinite(change)) return false;
      if (Math.abs(change) >= 20) return false;
      const name = String(row.industryName || '').trim();
      // ETF industry names may arrive with corrupted Unicode characters.
      // Large negative moves are invalid for this industry snapshot and
      // should not contaminate the market-rotation summary.
      if (/صندوق/.test(name) && Math.abs(change) > 10) return false;
      if (/سرمایه/.test(name) && Math.abs(change) > 10) return false;
      return true;
    })
    .map((row) => ({
      name: row.industryName,
      symbols: Number(row.symbolCount || 0),
      changePercent: row.changePercent,
      value: row.value,
      rank: row.rank,
    }));

  const leaders = [...sectors]
    .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))
    .slice(0, 6);

  const laggards = [...sectors]
    .sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0))
    .slice(0, 6);

  return {
    available: true,
    stale: !!market.isStale,
    source: market.source || 'shared-db',
    updatedAt: market.updatedAt,
    positive,
    negative,
    neutral,
    total,
    positivePercent: total ? (positive / total) * 100 : 0,
    negativePercent: total ? (negative / total) * 100 : 0,
    neutralPercent: total ? (neutral / total) * 100 : 0,
    advanceDeclineRatio: negative ? positive / negative : null,
    coveragePercent: symbols.length ? (total / symbols.length) * 100 : 0,
    topGainers: gainers,
    topLosers: losers,
    topVolumes: highVolume,
    realFlow: {
      available: realFlowRows.length > 0,
      rowsWithRealFlow: realFlowRows.length,
      totalRealBuyVolume,
      totalRealSellVolume,
      netRealBuyVolume,
      unit: 'volume'
    },
    sectors: {
      available: sectors.length > 0,
      leaders,
      laggards,
      rows: sectors,
    },
  };
}

async function getMovers(category, limit = 10) {
  const take = Math.max(1, Math.min(Number(limit) || 10, 100));
  const rows = await prisma.marketMoverCurrent.findMany({
    where: category ? { category } : undefined,
    orderBy: [{ rank: 'asc' }, { updatedAt: 'desc' }],
    take,
  });
  return rows.map(normalizeMover);
}

async function getIndustries(limit = 100) {
  const take = Math.max(1, Math.min(Number(limit) || 100, 500));
  const rows = await prisma.marketIndustryCurrent.findMany({
    orderBy: [{ rank: 'asc' }, { industryName: 'asc' }],
    take,
  });
  return rows
    .filter((row) => {
      const change = Number(row.changePercent);
      if (!Number.isFinite(change)) return false;
      if (Math.abs(change) >= 20) return false;
      const name = String(row.industryName || '').trim();
      // Some ETF industry names are stored with corrupted Unicode. Use
      // semantic name fragments plus an extreme-move guard rather than
      // relying on an exact string match.
      if ((/صندوق/.test(name) || /سرمایه/.test(name)) && Math.abs(change) > 10) return false;
      return true;
    })
    .map(normalizeIndustry);
}

async function getScalpingOpportunities({ status = 'ACTIVE', marketDate = null, limit = 50 } = {}) {
  const take = Math.max(1, Math.min(Number(limit) || 50, 200));
  const where = {};
  if (status) where.status = status;
  if (marketDate) where.marketDate = marketDate;
  const rows = await prisma.marketScalpingOpportunity.findMany({
    where,
    orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
    take,
  });
  return rows.map(normalizeScalping);
}

module.exports = {
  getMarketCurrent,
  getSymbols,
  searchSymbols,
  getMovers,
  getBreadth,
  getSymbolHistory,
  getIndustries,
  getScalpingOpportunities,
  isMarketAnalyticsEligible,
  normalizeMarketCurrent,
  normalizeSymbol,
  normalizeMover,
  normalizeIndustry,
  normalizeScalping,
};
