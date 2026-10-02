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

function getTehranMarketWindow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = values.weekday;
  const hour = Number(values.hour || 0);
  const minute = Number(values.minute || 0);
  const minutesOfDay = hour * 60 + minute;
  const isTradingDay = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'].includes(weekday);
  const isWithinSession =
    minutesOfDay >= 9 * 60 && minutesOfDay < 12 * 60 + 30;

  return {
    isTradingDay,
    isWithinSession,
    isOpen: isTradingDay && isWithinSession
  };
}

function isTradingCalendarDay(date = new Date()) {
  return getTehranMarketWindow(date).isTradingDay;
}

function normalizeMarketCurrent(row) {
  if (!row) return null;
  const marketWindow = getTehranMarketWindow();
  return {
    id: row.id,
    marketDate: row.marketDate,
    marketStatus: marketWindow.isOpen && row.marketStatus === 'OPEN' ? 'OPEN' : 'CLOSED',
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

  // Both percentages are first-class fields in the shared DB snapshot.
  // The watchlist must never need to parse raw BRS payloads at read time.
  const lastChangePercent = decimalToNumber(row.changePercent);
  const closeChangePercent = decimalToNumber(row.closeChangePercent);

  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    insCode: row.insCode,
    lastPrice: decimalToNumber(row.lastPrice),
    closePrice: decimalToNumber(row.closePrice),
    change: decimalToNumber(row.change),
    changePercent: lastChangePercent,
    lastChangePercent,
    closeChangePercent,
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

function getBreadthChangePercent(row) {
  const raw = row?.dataJson ? (() => { try { return JSON.parse(row.dataJson); } catch { return null; } })() : null;
  const last = Number(row?.lastPrice);
  const yesterday = Number(raw?.yesterday ?? raw?.previousPrice ?? raw?.yesterdayPrice);
  if (Number.isFinite(last) && last > 0 && Number.isFinite(yesterday) && yesterday > 0) {
    return ((last - yesterday) / yesterday) * 100;
  }
  const stored = Number(row?.changePercent);
  return Number.isFinite(stored) ? stored : null;
}

async function getBreadth() {
  const [market, symbols, industriesResult] = await Promise.all([
    getMarketCurrent(),
    getSymbols({ limit: 10000 }),
    getIndustries(100).catch(() => []),
  ]);
  // Breadth is derived from MarketSymbolCurrent and must remain available even
  // if the optional persisted industry snapshot is temporarily unavailable.
  if (!market && symbols.length === 0) return null;
  const industries = industriesResult;
  const valid = symbols
    .filter((row) => isMarketAnalyticsEligible(row) && !/شاخص|index/i.test(`${row.symbol} ${row.name || ""}`))
    .map((row) => ({ ...row, radarChangePercent: getBreadthChangePercent(row) }))
    .filter((row) => row.radarChangePercent !== null);

  const positive = valid.filter((row) => row.radarChangePercent > 0).length;
  const negative = valid.filter((row) => row.radarChangePercent < 0).length;
  const neutral = valid.filter((row) => row.radarChangePercent === 0).length;
  const total = positive + negative + neutral;

  const gainers = valid.filter((row) => row.radarChangePercent > 0)
    .sort((a, b) => b.radarChangePercent - a.radarChangePercent)
    .slice(0, 10).map((row) => ({ ...normalizeSymbol(row), changePercent: row.radarChangePercent, lastChangePercent: row.radarChangePercent }));
  const losers = valid.filter((row) => row.radarChangePercent < 0)
    .sort((a, b) => a.radarChangePercent - b.radarChangePercent)
    .slice(0, 10).map((row) => ({ ...normalizeSymbol(row), changePercent: row.radarChangePercent, lastChangePercent: row.radarChangePercent }));
  const highVolume = [...valid]
    .sort((a, b) => (Number(b.volume || 0) - Number(a.volume || 0)) || (Number(b.value || 0) - Number(a.value || 0)))
    .slice(0, 10).map(normalizeSymbol);

  const realFlowRows = valid.filter((row) => Number(row.realBuyVolume || 0) > 0 || Number(row.realSellVolume || 0) > 0);
  const totalRealBuyVolume = realFlowRows.reduce((sum, row) => sum + Math.max(0, Number(row.realBuyVolume || 0)), 0);
  const totalRealSellVolume = realFlowRows.reduce((sum, row) => sum + Math.max(0, Number(row.realSellVolume || 0)), 0);

  const sectorStats = new Map();
  for (const row of valid) {
    const name = String(row.sector || '').trim() || 'سایر / صنعت نامشخص';
    const current = sectorStats.get(name) || { symbols: 0, positive: 0, negative: 0, neutral: 0, sumPct: 0, value: 0 };
    current.symbols += 1;
    if (row.radarChangePercent > 0) current.positive += 1;
    else if (row.radarChangePercent < 0) current.negative += 1;
    else current.neutral += 1;
    current.sumPct += row.radarChangePercent;
    current.value += Number(row.value || 0);
    sectorStats.set(name, current);
  }

  const persistedByName = new Map(
    industries
      .filter((row) => Number.isFinite(Number(row.changePercent)) && Math.abs(Number(row.changePercent)) < 20)
      .map((row) => [String(row.industryName || '').trim(), row])
  );

  const sectors = [...sectorStats.entries()]
    .map(([name, stats]) => {
      const persisted = persistedByName.get(name);
      return {
        name,
        symbols: stats.symbols,
        positive: stats.positive,
        negative: stats.negative,
        neutral: stats.neutral,
        changePercent: stats.symbols ? stats.sumPct / stats.symbols : Number(persisted?.changePercent),
        value: stats.value,
        rank: Number(persisted?.rank || 0),
      };
    })
    .filter((row) => Number.isFinite(row.changePercent));

  const leaders = [...sectors].sort((a, b) => b.changePercent - a.changePercent).slice(0, 6);
  const laggards = [...sectors].sort((a, b) => a.changePercent - b.changePercent).slice(0, 6);

  return {
    available: true,
    stale: !!market.isStale,
    source: market.source || 'shared-db',
    updatedAt: market.updatedAt,
    positive, negative, neutral, total,
    positivePercent: total ? (positive / total) * 100 : 0,
    negativePercent: total ? (negative / total) * 100 : 0,
    neutralPercent: total ? (neutral / total) * 100 : 0,
    advanceDeclineRatio: negative ? positive / negative : null,
    coveragePercent: symbols.length ? (total / symbols.length) * 100 : 0,
    topGainers: gainers, topLosers: losers, topVolumes: highVolume,
    realFlow: {
      available: realFlowRows.length > 0,
      rowsWithRealFlow: realFlowRows.length,
      totalRealBuyVolume, totalRealSellVolume,
      netRealBuyVolume: totalRealBuyVolume - totalRealSellVolume,
      unit: 'volume'
    },
    sectors: { available: sectors.length > 0, leaders, laggards, rows: sectors },
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
