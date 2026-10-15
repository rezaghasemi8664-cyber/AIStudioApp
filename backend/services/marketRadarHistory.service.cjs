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
  const intradayModel = prisma?.MarketIndexIntradaySnapshot || prisma?.marketIndexIntradaySnapshot;

  if (!summaryModel && !technicalModel && !currentModel && !intradayModel) {
    throw new Error('[MarketRadarHistory] No market history model is available.');
  }

  // MarketTechnicalDaily is the durable daily index history. MarketSummary/MarketCurrent
  // may contain only a short retention window, so they must not be the primary source
  // for 3m/6m/1y charts.
  // Select the newest date across every available model. A stale but non-empty
  // MarketTechnicalDaily table must not hide newer MarketSummary/MarketCurrent rows.
  const [latestTechnical, latestSummary, latestCurrent, latestIntraday] = await Promise.all([
    technicalModel
      ? technicalModel.findFirst({ orderBy: { marketDate: 'desc' }, select: { marketDate: true } })
      : null,
    summaryModel
      ? summaryModel.findFirst({ orderBy: { summaryDate: 'desc' }, select: { summaryDate: true } })
      : null,
    currentModel
      ? currentModel.findFirst({ orderBy: { marketDate: 'desc' }, select: { marketDate: true } })
      : null,
    intradayModel
      ? intradayModel.findFirst({ orderBy: { capturedAt: 'desc' }, select: { marketDate: true } })
      : null
  ]);

  const latestDates = [
    latestTechnical?.marketDate,
    latestSummary?.summaryDate,
    latestCurrent?.marketDate,
    latestIntraday?.marketDate
  ].filter(Boolean).map((value) => new Date(value)).filter((value) => !Number.isNaN(value.getTime()));

  if (!latestDates.length) return { range, available: false, points: [], generatedAt: null };

  const latestDate = latestDates.reduce((latest, value) => value > latest ? value : latest);
  const startDate = startDateFor(range, latestDate);

  const [technicalRows, summaryRows, currentRows, intradayRows] = await Promise.all([
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
      : [],
    range === '1d' && intradayModel
      ? intradayModel.findMany({
          where: { marketDate: latestDate },
          orderBy: { capturedAt: 'asc' },
          select: { capturedAt: true, overallIndex: true, equalIndex: true, totalValue: true, totalVolume: true, totalTrades: true }
        })
      : []
  ]);

  if (range === '1d' && intradayRows.length) {
    return {
      range,
      available: true,
      points: intradayRows.map(row => ({
        timestamp: new Date(row.capturedAt).toISOString(),
        index: toNumber(row.overallIndex),
        equalWeightedIndex: toNumber(row.equalIndex),
        totalValue: toNumber(row.totalValue),
        totalVolume: toNumber(row.totalVolume),
        totalTrades: toNumber(row.totalTrades)
      })),
      generatedAt: new Date().toISOString()
    };
  }

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