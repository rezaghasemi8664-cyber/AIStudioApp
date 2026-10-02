'use strict';

const prismaModule = require('../config/prisma.cjs');

function resolvePrismaClient(mod) {
  const candidates = [mod?.prisma, mod?.db, mod?.client, mod?.default, mod];
  return candidates.find((candidate) => candidate && typeof candidate === 'object') || null;
}

const prisma = resolvePrismaClient(prismaModule);

const RANGES = new Set(['1d', '1w', '1m', '3m', '6m', '1y']);
const RANGE_DAYS = { '1d': 1, '1w': 7, '1m': 31, '3m': 93, '6m': 186, '1y': 366 };

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRange(value) {
  const range = String(value || '1d').toLowerCase();
  return RANGES.has(range) ? range : null;
}

function startDateFor(range, latestDate) {
  const start = new Date(latestDate);
  const days = range === '1d' ? 2 : RANGE_DAYS[range];
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

function dateKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function getHistory(inputRange) {
  const range = normalizeRange(inputRange);
  if (!range) {
    const error = new Error('INVALID_RANGE');
    error.statusCode = 400;
    throw error;
  }

  const summaryModel = prisma?.MarketSummary || prisma?.marketSummary;
  const technicalModel = prisma?.MarketTechnicalDaily || prisma?.marketTechnicalDaily;
  const currentModel = prisma?.MarketCurrent || prisma?.marketCurrent;

  if (!summaryModel && !technicalModel && !currentModel) {
    throw new Error('[MarketRadarHistory] No market history model is available.');
  }

  // MarketTechnicalDaily is the durable daily index history. MarketSummary/MarketCurrent
  // may contain only a short retention window, so they must not be the primary source
  // for 3m/6m/1y charts.
  let latestRow = null;
  if (technicalModel) {
    latestRow = await technicalModel.findFirst({ orderBy: { marketDate: 'desc' }, select: { marketDate: true } });
  }
  if (!latestRow && summaryModel) {
    latestRow = await summaryModel.findFirst({ orderBy: { summaryDate: 'desc' }, select: { summaryDate: true } });
  }
  if (!latestRow && currentModel) {
    latestRow = await currentModel.findFirst({ orderBy: { marketDate: 'desc' }, select: { marketDate: true } });
  }

  if (!latestRow) return { range, available: false, points: [], generatedAt: null };

  const latestDate = new Date(latestRow.marketDate || latestRow.summaryDate);
  const startDate = startDateFor(range, latestDate);

  const [technicalRows, summaryRows, currentRows] = await Promise.all([
    technicalModel
      ? technicalModel.findMany({
          where: { marketDate: { gte: startDate, lte: latestDate } },
          orderBy: { marketDate: 'asc' },
          select: { marketDate: true, overallIndex: true, equalIndex: true }
        })
      : [],
    summaryModel
      ? summaryModel.findMany({
          where: { summaryDate: { gte: startDate, lte: latestDate } },
          orderBy: { summaryDate: 'asc' },
          select: { summaryDate: true, overallIndex: true, equalIndex: true, totalValue: true, totalVolume: true, totalTrades: true }
        })
      : [],
    currentModel
      ? currentModel.findMany({
          where: { marketDate: { gte: startDate, lte: latestDate } },
          orderBy: { marketDate: 'asc' },
          select: { marketDate: true, overallIndex: true, equalIndex: true, totalValue: true, totalVolume: true, totalTrades: true }
        })
      : []
  ]);

  const byDate = new Map();

  const ensure = (dateValue) => {
    const key = dateKey(dateValue);
    if (!key) return null;
    if (!byDate.has(key)) byDate.set(key, {
      timestamp: new Date(dateValue).toISOString(),
      index: null,
      equalWeightedIndex: null,
      totalValue: null,
      totalVolume: null,
      totalTrades: null
    });
    return byDate.get(key);
  };

  for (const row of technicalRows) {
    const point = ensure(row.marketDate);
    if (!point) continue;
    point.index = toNumber(row.overallIndex) ?? point.index;
    point.equalWeightedIndex = toNumber(row.equalIndex) ?? point.equalWeightedIndex;
  }

  for (const row of summaryRows) {
    const point = ensure(row.summaryDate);
    if (!point) continue;
    point.index = toNumber(row.overallIndex) ?? point.index;
    point.equalWeightedIndex = toNumber(row.equalIndex) ?? point.equalWeightedIndex;
    point.totalValue = toNumber(row.totalValue) ?? point.totalValue;
    point.totalVolume = toNumber(row.totalVolume) ?? point.totalVolume;
    point.totalTrades = toNumber(row.totalTrades) ?? point.totalTrades;
  }

  for (const row of currentRows) {
    const point = ensure(row.marketDate);
    if (!point) continue;
    point.index = toNumber(row.overallIndex) ?? point.index;
    point.equalWeightedIndex = toNumber(row.equalIndex) ?? point.equalWeightedIndex;
    point.totalValue = toNumber(row.totalValue) ?? point.totalValue;
    point.totalVolume = toNumber(row.totalVolume) ?? point.totalVolume;
    point.totalTrades = toNumber(row.totalTrades) ?? point.totalTrades;
  }

  const points = [...byDate.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return {
    range,
    available: points.length > 0,
    points,
    generatedAt: new Date().toISOString()
  };
}

module.exports = { getHistory, normalizeRange };