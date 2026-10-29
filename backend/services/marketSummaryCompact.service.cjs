'use strict';

const prismaModule = require('../config/prisma.cjs');

function resolvePrismaClient(mod) {
  return mod?.prisma || mod?.db || mod?.client || mod?.default || mod;
}

const prisma = resolvePrismaClient(prismaModule);

function toIsoDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getLatestCompactMarketSummary() {
  const model = prisma?.MarketSummary || prisma?.marketSummary;
  if (!model) throw new Error('[MarketSummaryCompactService] MarketSummary model is unavailable.');

  const row = await model.findFirst({
    orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      summaryDate: true,
      overallIndex: true,
      overallChange: true,
      equalIndex: true,
      equalChange: true,
      marketStatus: true,
      totalTrades: true,
      totalVolume: true,
      totalValue: true,
      positiveStocks: true,
      negativeStocks: true,
      neutralStocks: true,
      createdAt: true
    }
  });

  if (!row) return null;

  const classifiedCounts = [row.positiveStocks, row.negativeStocks, row.neutralStocks];
  const totalSymbols = classifiedCounts.every(Number.isFinite)
    ? classifiedCounts.reduce((sum, count) => sum + count, 0)
    : null;

  const index = row.overallIndex;
  const change = row.overallChange;
  const previousIndex = Number.isFinite(index) && Number.isFinite(change) ? index - change : null;
  const changePercent = Number.isFinite(previousIndex) && previousIndex !== 0
    ? (change / previousIndex) * 100
    : null;

  return {
    id: row.id,
    date: toIsoDate(row.summaryDate),
    summaryDate: toIsoDate(row.summaryDate),
    overallIndex: index,
    overallChange: change,
    overallChangePercent: changePercent,
    equalIndex: row.equalIndex,
    equalChange: row.equalChange,
    marketStatus: row.marketStatus,
    totalTrades: row.totalTrades == null ? null : String(row.totalTrades),
    totalVolume: row.totalVolume == null ? null : String(row.totalVolume),
    totalValue: row.totalValue == null ? null : String(row.totalValue),
    positiveStocks: row.positiveStocks,
    negativeStocks: row.negativeStocks,
    neutralStocks: row.neutralStocks,
    totalSymbols,
    createdAt: toIsoDate(row.createdAt)
  };
}

module.exports = { getLatestCompactMarketSummary };
