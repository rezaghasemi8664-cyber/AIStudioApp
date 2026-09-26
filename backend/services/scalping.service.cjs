'use strict';

const { prisma } = require('./db.service.cjs');

const DEFAULT_HISTORY_LIMIT = 20;

function normalizeUserId(userId) { const parsed = parseInt(userId, 10); return Number.isNaN(parsed) || parsed <= 0 ? null : parsed; }
function safeNumber(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function safeJsonParse(value, fallback) { try { return JSON.parse(value); } catch (error) { return fallback; } }
function parseSymbols(rawSymbols) {
  if (!rawSymbols) return [];
  if (Array.isArray(rawSymbols)) return rawSymbols.map(item => String(item || '').trim().toUpperCase()).filter(Boolean);
  if (typeof rawSymbols === 'string') {
    try {
      const parsed = JSON.parse(rawSymbols);
      if (Array.isArray(parsed)) return parsed.map(item => String(item || '').trim().toUpperCase()).filter(Boolean);
    } catch (error) {
      return rawSymbols.split(',').map(item => String(item || '').trim().toUpperCase()).filter(Boolean);
    }
  }
  return [];
}
function serializeSymbols(symbols) { return JSON.stringify(parseSymbols(symbols)); }
function mapConfigForOutput(config) { return config ? Object.assign({}, config, { symbols: parseSymbols(config.symbols) }) : { symbols: [] }; }

function mapRunForOutput(run) { if (!run) return null; return Object.assign({}, run, { meta: typeof run.meta === 'string' ? safeJsonParse(run.meta, run.meta) : run.meta, results: Array.isArray(run.results) ? run.results.map(result => Object.assign({}, result, { extra: typeof result.dataJson === 'string' ? safeJsonParse(result.dataJson, result.dataJson) : result.dataJson })) : [] }); }

async function getOrCreateConfig(userId) { const normalizedUserId = normalizeUserId(userId); if (!normalizedUserId) throw new Error('Valid userId is required'); let config = await prisma.scalpingConfig.findUnique({ where: { userId: normalizedUserId } }); if (!config) config = await prisma.scalpingConfig.create({ data: { userId: normalizedUserId, symbols: '[]' } }); return config; }
async function getSettings(userId) { return mapConfigForOutput(await getOrCreateConfig(userId)); }
async function saveConfig(userId, data) { const normalizedUserId = normalizeUserId(userId); if (!normalizedUserId) throw new Error('Valid userId is required'); const payload = Object.assign({}, data || {}); if (Object.prototype.hasOwnProperty.call(payload, 'symbols')) payload.symbols = serializeSymbols(payload.symbols); return prisma.scalpingConfig.upsert({ where: { userId: normalizedUserId }, create: Object.assign({ userId: normalizedUserId }, payload), update: payload }); }
async function updateSettings(userId, data) { return mapConfigForOutput(await saveConfig(userId, data)); }

async function getHistory(userId, page, limit) { const normalizedUserId = normalizeUserId(userId); const safePage = Math.max(parseInt(page, 10) || 1, 1); const safeLimit = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_HISTORY_LIMIT, 1), 100); const skip = (safePage - 1) * safeLimit; const where = normalizedUserId ? { userId: normalizedUserId } : {}; const [runs, total] = await Promise.all([prisma.scalpingRun.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: safeLimit, include: { results: true } }), prisma.scalpingRun.count({ where })]); return { items: runs.map(mapRunForOutput), total, page: safePage, limit: safeLimit }; }
async function getLatest(userId) { const normalizedUserId = normalizeUserId(userId); const where = normalizedUserId ? { userId: normalizedUserId } : {}; return mapRunForOutput(await prisma.scalpingRun.findFirst({ where, orderBy: { createdAt: 'desc' }, include: { results: true } })); }
async function getOpportunities(userId, options) {
  const limit = Math.min(Math.max(parseInt(options && options.limit, 10) || 50, 1), 200);
  const sharedMarketService = require('./sharedMarket.service.cjs');

  // User-facing signals are now read only from the shared market snapshot.
  // The central worker is responsible for refreshing MarketScalpingOpportunity.
  const rows = await sharedMarketService.getScalpingOpportunities({
    status: 'ACTIVE',
    limit
  });

  return rows.map((row) => ({
    id: row.id,
    userId: normalizeUserId(userId),
    symbol: row.symbol,
    price: row.currentPrice ?? row.entryPrice ?? 0,
    currentPrice: row.currentPrice ?? row.entryPrice ?? 0,
    reason: row.recommendationText || '',
    score: safeNumber(row.score, 0),
    signalType: row.signal || 'none',
    entryPrice: safeNumber(row.entryPrice, 0),
    exitPrice: safeNumber(row.takeProfit, 0),
    targetPrice: safeNumber(row.takeProfit, 0),
    stopLossPrice: safeNumber(row.stopLoss, 0),
    recommendationText: row.recommendationText || '',
    marketStatus: null,
    strategyName: row.strategyName || null,
    confidence: safeNumber(row.confidence, 0),
    aiScore: safeNumber(row.score, 0),
    baseScore: safeNumber(row.score, 0),
    isGeneratedByAi: false,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
    source: row.source || 'shared-db',
    marketDate: row.marketDate || null,
    status: row.status || 'ACTIVE'
  }));
}
async function getBest(userId) { return (await getOpportunities(userId, { limit: 1 }))[0] || null; }

module.exports = { getSettings, saveConfig, updateSettings, getHistory, getLatest, getOpportunities, getBest };
