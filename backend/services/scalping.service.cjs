'use strict';

const { prisma } = require('./db.service.cjs');
const brsService = require('./brs.service.cjs');
const gapGPTService = require('./gapGPT.service.cjs');

const CONFIDENCE_THRESHOLD = 60;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_CANDIDATES = 30;
const AI_REVIEW_LIMIT = 10;
const SCALPING_CANDLE_LIMIT = 30;
const DEFAULT_SYSTEM_USER_ID = parseInt(process.env.SCALPING_SYSTEM_USER_ID || '0', 10) || null;

function normalizeUserId(userId) {
  const parsed = parseInt(userId, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}
function safeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
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
function normalizeConfidence(value) {
  const numeric = safeNumber(value, 0);
  if (numeric <= 1) return clamp(Math.round(numeric * 100), 0, 100);
  return clamp(Math.round(numeric), 0, 100);
}
function pickFirstNonEmpty() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}
function pickPrice(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  const values = [payload.lastPrice, payload.price, payload.close, payload.finalPrice, payload.pclose, payload.last, payload.tradePrice, payload.pl, payload.pc, payload.value];
  for (const item of values) { const value = Number(item); if (Number.isFinite(value) && value > 0) return value; }
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) return pickPrice(payload.data);
  if (Array.isArray(payload.data) && payload.data.length > 0) return pickPrice(payload.data[0]);
  return 0;
}
function mapConfigForOutput(config) { return config ? Object.assign({}, config, { symbols: parseSymbols(config.symbols) }) : { symbols: [] }; }
function mapOpportunityForOutput(item) {
  if (!item) return null;
  const meta = safeJsonParse(item.meta, {});
  return {
    id: item.id, userId: item.userId, symbol: item.symbol, price: safeNumber(item.entryPrice, 0),
    reason: meta.recommendationText || '', score: safeNumber(item.score, 0), signalType: item.signal || 'none',
    entryPrice: safeNumber(item.entryPrice, 0), exitPrice: safeNumber(item.takeProfit, 0), targetPrice: safeNumber(item.takeProfit, 0),
    stopLossPrice: safeNumber(item.stopLoss, 0), recommendationText: meta.recommendationText || '', marketStatus: meta.marketStatus || null,
    strategyName: meta.strategyName || null, confidence: safeNumber(meta.confidence, 0), aiScore: safeNumber(meta.aiScore, 0),
    baseScore: safeNumber(meta.baseScore, 0), isGeneratedByAi: !!meta.isGeneratedByAi, createdAt: item.createdAt || null, updatedAt: item.updatedAt || null
  };
}
function mapRunForOutput(run) {
  if (!run) return null;
  return Object.assign({}, run, {
    meta: typeof run.meta === 'string' ? safeJsonParse(run.meta, run.meta) : run.meta,
    results: Array.isArray(run.results) ? run.results.map(result => Object.assign({}, result, { extra: typeof result.dataJson === 'string' ? safeJsonParse(result.dataJson, result.dataJson) : result.dataJson })) : []
  });
}
async function finalizeRun(runId, status, meta) {
  const data = { status, finishedAt: new Date() };
  if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) data.meta = JSON.stringify(meta);
  try { await prisma.scalpingRun.update({ where: { id: runId }, data }); }
  catch (error) { console.error('[SCALPING SERVICE] Failed to finalize run:', error.message); }
}
async function getOrCreateConfig(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) throw new Error('Valid userId is required');
  let config = await prisma.scalpingConfig.findUnique({ where: { userId: normalizedUserId } });
  if (!config) config = await prisma.scalpingConfig.create({ data: { userId: normalizedUserId, symbols: '[]' } });
  return config;
}
async function getSettings(userId) { return mapConfigForOutput(await getOrCreateConfig(userId)); }
async function saveConfig(userId, data) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) throw new Error('Valid userId is required');
  const payload = Object.assign({}, data || {});
  if (Object.prototype.hasOwnProperty.call(payload, 'symbols')) payload.symbols = serializeSymbols(payload.symbols);
  return prisma.scalpingConfig.upsert({ where: { userId: normalizedUserId }, create: Object.assign({ userId: normalizedUserId }, payload), update: payload });
}
async function updateSettings(userId, data) { return mapConfigForOutput(await saveConfig(userId, data)); }

function normalizeMarketStatus(status, sourceName) {
  const checkedAt = new Date().toISOString();
  if (!status || typeof status !== 'object') {
    return { isOpen: false, available: false, source: sourceName || 'unknown', reason: 'invalid-market-status-payload', checkedAt };
  }

  // BRS local schedule uses `isOpenBySchedule`, while API status uses `isOpen`.
  // Accept both so the scalping engine never turns a valid open schedule into CLOSED.
  const hasExplicitOpen = typeof status.isOpen === 'boolean';
  const hasScheduleOpen = typeof status.isOpenBySchedule === 'boolean';
  const isOpen = hasExplicitOpen ? status.isOpen : hasScheduleOpen ? status.isOpenBySchedule : false;

  return {
    isOpen: !!isOpen,
    available: status.available === undefined ? (hasExplicitOpen || hasScheduleOpen) : !!status.available,
    source: status.source || sourceName || 'unknown',
    reason: status.reason || (isOpen ? 'market-open' : 'market-closed'),
    checkedAt
  };
}

async function getMarketStatus() {
  try {
    // Prefer the authoritative BRS API status. It already combines the Tehran
    // trading window with the live BRS market state.
    if (brsService && typeof brsService.getMarketStatus === 'function') {
      return normalizeMarketStatus(await brsService.getMarketStatus(), 'brs.getMarketStatus');
    }

    if (brsService && typeof brsService.getLocalMarketWindowStatus === 'function') {
      return normalizeMarketStatus(await brsService.getLocalMarketWindowStatus(), 'brs.getLocalMarketWindowStatus');
    }

    if (brsService && typeof brsService.isMarketOpen === 'function') {
      const isOpen = await Promise.resolve(brsService.isMarketOpen());
      return { isOpen: !!isOpen, available: true, source: 'brs.isMarketOpen', reason: isOpen ? 'market-open' : 'market-closed', checkedAt: new Date().toISOString() };
    }
  } catch (error) {
    return { isOpen: false, available: false, source: 'market-status-error', reason: error && error.message ? error.message : 'market-status-failed', checkedAt: new Date().toISOString() };
  }
  return { isOpen: false, available: false, source: 'market-status-missing', reason: 'BRS market status function is not available', checkedAt: new Date().toISOString() };
}
