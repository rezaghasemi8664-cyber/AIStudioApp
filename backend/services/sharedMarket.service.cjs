'use strict';

const prisma = require('../config/prisma.cjs');

function decimalToNumber(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeMarketCurrent(row) {
  if (!row) return null;
  return {
    id: row.id,
    marketDate: row.marketDate,
    marketStatus: row.marketStatus,
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
    isStale: row.isStale,
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

async function getBreadth() {
  const [market, gainers, losers, highVolume] = await Promise.all([
    getMarketCurrent(),
    getMovers('GAINERS', 10),
    getMovers('LOSERS', 10),
    getMovers('VOLUME', 10),
  ]);

  if (!market) return null;

  const positive = Number(market.positiveStocks || 0);
  const negative = Number(market.negativeStocks || 0);
  const neutral = Number(market.neutralStocks || 0);
  const total = positive + negative + neutral;

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
    topGainers: gainers,
    topLosers: losers,
    topVolumes: highVolume,
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
  return rows.map(normalizeIndustry);
}

async function getScalpingOpportunities({ status = 'ACTIVE', limit = 50 } = {}) {
  const take = Math.max(1, Math.min(Number(limit) || 50, 200));
  const rows = await prisma.marketScalpingOpportunity.findMany({
    where: status ? { status } : undefined,
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
  getIndustries,
  getScalpingOpportunities,
  normalizeMarketCurrent,
  normalizeSymbol,
  normalizeMover,
  normalizeIndustry,
  normalizeScalping,
};
