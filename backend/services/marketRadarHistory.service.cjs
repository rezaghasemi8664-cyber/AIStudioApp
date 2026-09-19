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

function getModel() {
  const model = prisma?.MarketSummary || prisma?.marketSummary;
  if (!model) throw new Error('[MarketRadarHistory] MarketSummary model is unavailable.');
  return model;
}

function normalizeRange(value) {
  const range = String(value || '1d').toLowerCase();
  return RANGES.has(range) ? range : null;
}

function startDateFor(range, latestDate) {
  const start = new Date(latestDate);
  start.setUTCDate(start.getUTCDate() - (RANGE_DAYS[range] - 1));
  return start;
}

async function getHistory(inputRange) {
  const range = normalizeRange(inputRange);
  if (!range) {
    const error = new Error('INVALID_RANGE');
    error.statusCode = 400;
    throw error;
  }

  const model = getModel();
  const latest = await model.findFirst({
    orderBy: { summaryDate: 'desc' },
    select: { summaryDate: true }
  });

  if (!latest?.summaryDate) {
    return { range, available: false, points: [], generatedAt: null };
  }

  const latestDate = new Date(latest.summaryDate);
  const startDate = startDateFor(range, latestDate);
  const rows = await model.findMany({
    where: { summaryDate: { gte: startDate, lte: latestDate } },
    orderBy: { summaryDate: 'asc' },
    select: {
      summaryDate: true,
      overallIndex: true,
      equalIndex: true,
      totalValue: true,
      totalVolume: true,
      totalTrades: true
    }
  });

  const points = rows.map((row) => ({
    timestamp: new Date(row.summaryDate).toISOString(),
    index: toNumber(row.overallIndex),
    equalWeightedIndex: toNumber(row.equalIndex),
    totalValue: toNumber(row.totalValue),
    totalVolume: toNumber(row.totalVolume),
    totalTrades: toNumber(row.totalTrades)
  }));

  return {
    range,
    available: points.length > 0,
    points,
    generatedAt: new Date().toISOString()
  };
}

module.exports = { getHistory, normalizeRange };
