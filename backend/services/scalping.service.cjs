'use strict';

const { prisma } = require('./db.service.cjs');
const brsService = require('./brs.service.cjs');
const gapGPTService = require('./gapGPT.service.cjs');

const CONFIDENCE_THRESHOLD = 60;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_CANDIDATES = 30;
const AI_REVIEW_LIMIT = 10;
const DEFAULT_SYSTEM_USER_ID = parseInt(process.env.SCALPING_SYSTEM_USER_ID || '0', 10) || null;

function normalizeUserId(userId) {
  const parsed = parseInt(userId, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

function safeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function parseSymbols(rawSymbols) {
  if (!rawSymbols) return [];
  if (Array.isArray(rawSymbols)) return rawSymbols.map(function (item) { return String(item || '').trim().toUpperCase(); }).filter(Boolean);
  if (typeof rawSymbols === 'string') {
    try {
      const parsed = JSON.parse(rawSymbols);
      if (Array.isArray(parsed)) return parsed.map(function (item) { return String(item || '').trim().toUpperCase(); }).filter(Boolean);
    } catch (error) {
      return rawSymbols.split(',').map(function (item) { return String(item || '').trim().toUpperCase(); }).filter(Boolean);
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
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function pickPrice(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  const candidates = [payload.lastPrice, payload.price, payload.close, payload.finalPrice, payload.pclose, payload.last, payload.tradePrice, payload.pl, payload.pc, payload.value];
  for (const item of candidates) {
    const value = Number(item);
    if (Number.isFinite(value) && value > 0) return value;
  }
  if (payload.data && typeof payload.data === 'object') return pickPrice(payload.data);
  if (Array.isArray(payload.data) && payload.data.length > 0) return pickPrice(payload.data[0]);
  return 0;
}

function mapConfigForOutput(config) {
  if (!config) return { symbols: [] };
  return Object.assign({}, config, { symbols: parseSymbols(config.symbols) });
}

function mapOpportunityForOutput(item) {
  if (!item) return null;
  const meta = safeJsonParse(item.meta, {});
  return {
    id: item.id,
    userId: item.userId,
    symbol: item.symbol,
    price: safeNumber(item.entryPrice, 0),
    reason: meta.recommendationText || '',
    score: safeNumber(item.score, 0),
    signalType: item.signal || 'none',
    entryPrice: safeNumber(item.entryPrice, 0),
    exitPrice: safeNumber(item.takeProfit, 0),
    targetPrice: safeNumber(item.takeProfit, 0),
    stopLossPrice: safeNumber(item.stopLoss, 0),
    recommendationText: meta.recommendationText || '',
    marketStatus: meta.marketStatus || null,
    strategyName: meta.strategyName || null,
    confidence: safeNumber(meta.confidence, 0),
    aiScore: safeNumber(meta.aiScore, 0),
    baseScore: safeNumber(meta.baseScore, 0),
    isGeneratedByAi: !!meta.isGeneratedByAi,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

function mapRunForOutput(run) {
  if (!run) return null;
  return Object.assign({}, run, {
    meta: typeof run.meta === 'string' ? safeJsonParse(run.meta, run.meta) : run.meta,
    results: Array.isArray(run.results) ? run.results.map(function (result) {
      return Object.assign({}, result, {
        extra: typeof result.dataJson === 'string' ? safeJsonParse(result.dataJson, result.dataJson) : result.dataJson
      });
    }) : []
  });
}

async function finalizeRun(runId, status, meta) {
  const data = { status: status, finishedAt: new Date() };
  if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) data.meta = JSON.stringify(meta);
  try {
    await prisma.scalpingRun.update({ where: { id: runId }, data: data });
  } catch (error) {
    console.error('[SCALPING SERVICE] Failed to finalize run:', error.message);
  }
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
  const saved = await prisma.scalpingConfig.upsert({
    where: { userId: normalizedUserId },
    create: Object.assign({ userId: normalizedUserId }, payload),
    update: payload
  });
  return saved;
}

async function updateSettings(userId, data) { return mapConfigForOutput(await saveConfig(userId, data)); }

function normalizeMarketStatus(status, sourceName) {
  const checkedAt = new Date().toISOString();
  if (!status || typeof status !== 'object') return { isOpen: false, available: false, source: sourceName || 'unknown', reason: 'invalid-market-status-payload', checkedAt: checkedAt };
  return { isOpen: !!status.isOpen, available: status.available === undefined ? true : !!status.available, source: status.source || sourceName || 'unknown', reason: status.reason || 'ok', checkedAt: checkedAt };
}

async function getMarketStatus() {
  try {
    if (brsService && typeof brsService.getLocalMarketWindowStatus === 'function') {
      const status = await brsService.getLocalMarketWindowStatus();
      return normalizeMarketStatus(status, 'brs.getLocalMarketWindowStatus');
    }
    if (brsService && typeof brsService.getMarketStatus === 'function') {
      const status = await brsService.getMarketStatus();
      return normalizeMarketStatus(status, 'brs.getMarketStatus');
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

function extractSymbolIdentity(item) {
  const symbol = String(pickFirstNonEmpty(item.symbol, item.Symbol, item.l18, item.insCodeSymbol, item.ticker, item.code) || '').trim().toUpperCase();
  const companyName = String(pickFirstNonEmpty(item.companyName, item.CompanyName, item.name, item.l30, item.title, item.fullName) || '').trim();
  const insCode = String(pickFirstNonEmpty(item.insCode, item.InsCode, item.instrumentCode, item.id, item.ID) || '').trim();
  return { symbol: symbol, companyName: companyName, insCode: insCode };
}

function normalizeCandle(candle) {
  if (!candle || typeof candle !== 'object') return null;
  const open = safeNumber(pickFirstNonEmpty(candle.open, candle.o, candle.OpenPrice), 0);
  const high = safeNumber(pickFirstNonEmpty(candle.high, candle.h, candle.HighPrice), 0);
  const low = safeNumber(pickFirstNonEmpty(candle.low, candle.l, candle.LowPrice), 0);
  const close = safeNumber(pickFirstNonEmpty(candle.close, candle.c, candle.lastPrice, candle.finalPrice, candle.ClosePrice), 0);
  const volume = safeNumber(pickFirstNonEmpty(candle.volume, candle.v, candle.qTotTran5J, candle.Volume), 0);
  const value = safeNumber(pickFirstNonEmpty(candle.value, candle.qTotCap, candle.tradeValue, candle.Value), 0);
  if (close <= 0) return null;
  return { date: pickFirstNonEmpty(candle.date, candle.dEven, candle.Date) || null, open: open > 0 ? open : close, high: high > 0 ? high : close, low: low > 0 ? low : close, close: close, volume: volume, value: value };
}

function normalizeUniverseItem(item) {
  const identity = extractSymbolIdentity(item || {});
  return Object.assign({}, item || {}, identity, {
    lastPrice: safeNumber(pickFirstNonEmpty(item && item.lastPrice, item && item.pl, item && item.last), 0),
    closingPrice: safeNumber(pickFirstNonEmpty(item && item.closingPrice, item && item.pc, item && item.close), 0),
    yesterday: safeNumber(pickFirstNonEmpty(item && item.yesterday, item && item.py), 0),
    high: safeNumber(pickFirstNonEmpty(item && item.high, item && item.pmax), 0),
    low: safeNumber(pickFirstNonEmpty(item && item.low, item && item.pmin), 0),
    open: safeNumber(pickFirstNonEmpty(item && item.open, item && item.pf), 0),
    tradeVolume: safeNumber(pickFirstNonEmpty(item && item.tradeVolume, item && item.tvol, item && item.volume), 0),
    tradeValue: safeNumber(pickFirstNonEmpty(item && item.tradeValue, item && item.tval, item && item.value), 0),
    tradeCount: safeNumber(pickFirstNonEmpty(item && item.tradeCount, item && item.tno, item && item.count), 0),
    lastChangePercent: safeNumber(pickFirstNonEmpty(item && item.lastChangePercent, item && item.plp), 0),
    closingChangePercent: safeNumber(pickFirstNonEmpty(item && item.closingChangePercent, item && item.pcp), 0),
    realBuyVolume: safeNumber(pickFirstNonEmpty(item && item.realBuyVolume, item && item.Buy_I_Volume), 0),
    realSellVolume: safeNumber(pickFirstNonEmpty(item && item.realSellVolume, item && item.Sell_I_Volume), 0),
    instBuyVolume: safeNumber(pickFirstNonEmpty(item && item.instBuyVolume, item && item.Buy_N_Volume), 0),
    instSellVolume: safeNumber(pickFirstNonEmpty(item && item.instSellVolume, item && item.Sell_N_Volume), 0)
  });
}

function getLatestAndPreviousCandles(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return { latest: null, previous: null };
  const sorted = candles.slice().sort(function (a, b) { return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime(); });
  return { latest: sorted[sorted.length - 1] || null, previous: sorted[sorted.length - 2] || null };
}

async function fetchRecentCandles(symbol, limit) {
  const candidates = [];
  if (brsService && typeof brsService.getAdjustedDailyCandlestick === 'function') candidates.push(function () { return brsService.getAdjustedDailyCandlestick(symbol, limit); });
  if (brsService && typeof brsService.getSymbolHistory === 'function') candidates.push(function () { return brsService.getSymbolHistory(symbol, limit); });
  for (const loader of candidates) {
    try {
      const response = await loader();
      const data = Array.isArray(response) ? response : (response && Array.isArray(response.data) ? response.data : []);
      const normalized = data.map(normalizeCandle).filter(Boolean);
      if (normalized.length > 0) return normalized;
    } catch (error) {
      console.warn('[SCALPING SERVICE] Candle fetch failed:', error.message);
    }
  }
  return [];
}

function scoreUniverseItem(item) {
  const last = safeNumber(item.lastPrice, 0);
  const close = safeNumber(item.closingPrice, last);
  const yesterday = safeNumber(item.yesterday, close);
  const pct = yesterday > 0 ? ((last - yesterday) / yesterday) * 100 : safeNumber(item.lastChangePercent, 0);
  const flow = safeNumber(item.realBuyVolume, 0) - safeNumber(item.realSellVolume, 0);
  const volume = safeNumber(item.tradeVolume, 0);
  const activity = Math.min(20, Math.log10(Math.max(volume, 1)) * 2);
  const momentum = clamp(10 + pct * 2, 0, 20);
  const flowScore = clamp(10 + (flow / Math.max(volume, 1)) * 20, 0, 20);
  const liquidity = Math.min(20, activity);
  const score = clamp(Math.round(momentum + flowScore + liquidity), 0, 100);
  const signal = score >= 70 ? 'buy' : score >= 55 ? 'watch' : 'none';
  return { score: score, signal: signal, pct: pct, flow: flow, last: last, close: close };
}

function buildCandidate(item) {
  const normalized = normalizeUniverseItem(item);
  const scored = scoreUniverseItem(normalized);
  const entryPrice = scored.last > 0 ? scored.last : scored.close;
  if (!normalized.symbol || entryPrice <= 0) return null;
  const targetPrice = entryPrice * 1.02;
  const stopLossPrice = entryPrice * 0.99;
  return Object.assign({}, normalized, {
    score: scored.score,
    signal: scored.signal,
    entryPrice: entryPrice,
    exitPrice: targetPrice,
    targetPrice: targetPrice,
    stopLossPrice: stopLossPrice,
    strategyName: 'momentum-flow',
    signalDate: new Date().toISOString(),
    recommendationText: scored.signal === 'buy' ? 'مومنتوم و جریان نقدینگی مناسب است.' : 'در حال بررسی؛ هنوز سیگنال قطعی صادر نشده است.'
  });
}

async function buildCandidatesFromUniverse(universe, allowedSymbols) {
  const allowedSet = Array.isArray(allowedSymbols) && allowedSymbols.length > 0 ? new Set(allowedSymbols.map(function (item) { return String(item).trim().toUpperCase(); })) : null;
  const candidates = [];
  const errors = [];
  for (const rawItem of Array.isArray(universe) ? universe : []) {
    const item = normalizeUniverseItem(rawItem);
    if (!item.symbol) continue;
    if (allowedSet && !allowedSet.has(item.symbol)) continue;
    try {
      const candidate = buildCandidate(item);
      if (candidate) candidates.push(candidate);
    } catch (error) {
      errors.push({ symbol: item.symbol, message: error.message });
    }
  }
  candidates.sort(function (a, b) { return safeNumber(b.score, 0) - safeNumber(a.score, 0); });
  return { candidates: candidates.slice(0, MAX_CANDIDATES), errors: errors };
}

async function analyzeWithAI(candidate, marketStatus) {
  if (!gapGPTService || typeof gapGPTService.analyzeBulk !== 'function') return { source: 'rules', score: candidate.score, confidence: candidate.score, reason: candidate.recommendationText };
  try {
    const response = await gapGPTService.analyzeBulk([candidate], null);
    const first = Array.isArray(response) ? response[0] : (response && Array.isArray(response.results) ? response.results[0] : response);
    const score = normalizeConfidence(first && (first.score != null ? first.score : first.confidence));
    const confidence = normalizeConfidence(first && (first.confidence != null ? first.confidence : score));
    return { source: 'ai', score: score, confidence: confidence, reason: first && (first.reason || first.recommendation || first.summary) ? (first.reason || first.recommendation || first.summary) : candidate.recommendationText };
  } catch (error) {
    return { source: 'rules-fallback', score: candidate.score, confidence: candidate.score, reason: candidate.recommendationText + ' بررسی AI در دسترس نبود.' };
  }
}

async function persistCandidate(runId, userId, candidate, aiResult, marketStatus) {
  const finalScore = safeNumber(aiResult && aiResult.score, candidate.score);
  const confidence = normalizeConfidence(aiResult && aiResult.confidence);
  const finalSignal = finalScore >= CONFIDENCE_THRESHOLD && candidate.signal !== 'none' ? candidate.signal : 'none';
  const meta = JSON.stringify({ marketStatus: marketStatus, strategyName: candidate.strategyName, recommendationText: aiResult.reason || candidate.recommendationText, confidence: confidence, aiScore: finalScore, baseScore: candidate.score, isGeneratedByAi: aiResult.source === 'ai' });
  const result = await prisma.scalpingResult.create({ data: { runId: runId, symbol: candidate.symbol, dataJson: JSON.stringify(Object.assign({}, candidate, { aiResult: aiResult, finalSignal: finalSignal })) } });
  let opportunity = null;
  if (finalSignal !== 'none') {
    opportunity = await prisma.scalpingOpportunity.create({ data: { userId: userId, symbol: candidate.symbol, score: finalScore, signal: finalSignal, entryPrice: candidate.entryPrice, stopLoss: candidate.stopLossPrice, takeProfit: candidate.targetPrice, status: 'active', meta: meta } });
  }
  return { result: result, opportunity: opportunity, finalSignal: finalSignal };
}

async function createRun(userId, initialStatus, meta) {
  const payload = { userId: userId, status: initialStatus || 'running' };
  if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) payload.meta = JSON.stringify(meta);
  return prisma.scalpingRun.create({ data: payload });
}

async function resolveExecutionUserId(explicitUserId) {
  const normalizedExplicit = normalizeUserId(explicitUserId);
  if (normalizedExplicit) return normalizedExplicit;
  if (DEFAULT_SYSTEM_USER_ID) return DEFAULT_SYSTEM_USER_ID;
  const firstConfig = await prisma.scalpingConfig.findFirst({ orderBy: { userId: 'asc' } });
  return firstConfig && firstConfig.userId ? firstConfig.userId : null;
}

async function fetchMarketUniverse() {
  if (!brsService) throw new Error('BRS service is not available');

  // brs.service.cjs exports getAllSymbols(); the previous getAllSymbolsData() name
  // did not exist and made the scalping engine stop before scanning the market.
  if (typeof brsService.getAllSymbols !== 'function') {
    throw new Error('BRS all symbols service is not available');
  }

  const response = await brsService.getAllSymbols();
  if (Array.isArray(response)) return response;
  if (response && Array.isArray(response.data)) return response.data;
  if (response && Array.isArray(response.result)) return response.result;
  if (response && response.data && Array.isArray(response.data.items)) return response.data.items;
  return [];
}

async function runScalping(userId, options) {
  const opts = options || {};
  const normalizedUserId = await resolveExecutionUserId(userId);
  if (!normalizedUserId) throw new Error('No user available for scalping run');
  const configured = await getOrCreateConfig(normalizedUserId);
  const configuredSymbols = parseSymbols(configured.symbols);
  const onlyConfiguredSymbols = opts.onlyConfiguredSymbols === true;
  const marketStatus = await getMarketStatus();
  if (!marketStatus.available || !marketStatus.isOpen) {
    return { runId: null, status: 'skipped', count: 0, actionableCount: 0, bestSignal: null, results: [], errors: [], marketStatus: marketStatus };
  }
  const run = await createRun(normalizedUserId, 'running', { marketStatus: marketStatus, configuredSymbols: configuredSymbols, mode: onlyConfiguredSymbols ? 'configured' : 'all-symbols' });
  if (onlyConfiguredSymbols && configuredSymbols.length === 0) {
    await finalizeRun(run.id, 'skipped', { reason: 'no-configured-symbols', marketStatus: marketStatus, processedSymbols: 0, savedResults: 0, savedOpportunities: 0 });
    return { runId: run.id, status: 'skipped', count: 0, actionableCount: 0, bestSignal: null, results: [], errors: [], marketStatus: marketStatus };
  }
  try {
    const universe = await fetchMarketUniverse();
    const candidateBuild = await buildCandidatesFromUniverse(universe, onlyConfiguredSymbols ? configuredSymbols : null);
    const topForReview = candidateBuild.candidates.slice(0, AI_REVIEW_LIMIT);
    const savedResults = [];
    const outputSignals = [];
    let savedOpportunities = 0;
    for (const candidate of topForReview) {
      const aiResult = await analyzeWithAI(candidate, marketStatus);
      const persisted = await persistCandidate(run.id, normalizedUserId, candidate, aiResult, marketStatus);
      savedResults.push(persisted.result);
      if (persisted.opportunity) savedOpportunities += 1;
      outputSignals.push({ insCode: candidate.insCode, symbol: candidate.symbol, companyName: candidate.companyName, signalType: persisted.finalSignal, entryPrice: candidate.entryPrice, exitPrice: candidate.exitPrice, targetPrice: candidate.targetPrice, stopLossPrice: candidate.stopLossPrice, signalDate: candidate.signalDate, marketStatus: marketStatus, strategyName: candidate.strategyName, recommendationText: aiResult.reason || candidate.recommendationText, isGeneratedByAi: aiResult.source === 'ai', confidence: aiResult.confidence, aiScore: aiResult.score, score: candidate.score });
    }
    outputSignals.sort(function (a, b) { return safeNumber(b.score, 0) - safeNumber(a.score, 0); });
    const actionableSignals = outputSignals.filter(function (item) { return item.signalType && item.signalType !== 'none'; });
    const bestSignal = actionableSignals.length > 0 ? actionableSignals[0] : null;
    const finalStatus = savedResults.length === 0 && candidateBuild.errors.length > 0 ? 'failed' : candidateBuild.errors.length > 0 ? 'partial' : 'success';
    await finalizeRun(run.id, finalStatus, { marketStatus: marketStatus, processedSymbols: universe.length, shortlistedCandidates: candidateBuild.candidates.length, reviewedByAi: topForReview.length, savedResults: savedResults.length, savedOpportunities: savedOpportunities, bestSignal: bestSignal, errors: candidateBuild.errors });
    return { runId: run.id, status: finalStatus, count: outputSignals.length, actionableCount: actionableSignals.length, bestSignal: bestSignal, results: outputSignals, errors: candidateBuild.errors, marketStatus: marketStatus };
  } catch (error) {
    await finalizeRun(run.id, 'failed', { marketStatus: marketStatus, error: error && error.message ? error.message : String(error) });
    throw error;
  }
}

async function runEngine(userId) { return runScalping(userId, { onlyConfiguredSymbols: false }); }

async function getHistory(userId, page, limit) {
  const normalizedUserId = normalizeUserId(userId);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_HISTORY_LIMIT, 1), 100);
  const skip = (safePage - 1) * safeLimit;
  const where = normalizedUserId ? { userId: normalizedUserId } : {};
  const [runs, total] = await Promise.all([
    prisma.scalpingRun.findMany({ where: where, orderBy: { createdAt: 'desc' }, skip: skip, take: safeLimit, include: { results: true } }),
    prisma.scalpingRun.count({ where: where })
  ]);
  return { items: runs.map(mapRunForOutput), total: total, page: safePage, limit: safeLimit };
}

async function getLatest(userId) {
  const normalizedUserId = normalizeUserId(userId);
  const where = normalizedUserId ? { userId: normalizedUserId } : {};
  const run = await prisma.scalpingRun.findFirst({ where: where, orderBy: { createdAt: 'desc' }, include: { results: true } });
  return mapRunForOutput(run);
}

async function getOpportunities(userId, options) {
  const normalizedUserId = normalizeUserId(userId);
  const limit = Math.min(Math.max(parseInt(options && options.limit, 10) || 50, 1), 200);
  const where = normalizedUserId ? { userId: normalizedUserId, status: 'active' } : { status: 'active' };
  const items = await prisma.scalpingOpportunity.findMany({ where: where, orderBy: [{ score: 'desc' }, { createdAt: 'desc' }], take: limit });
  return items.map(mapOpportunityForOutput);
}

async function getBest(userId) {
  const items = await getOpportunities(userId, { limit: 1 });
  return items[0] || null;
}

module.exports = { getSettings, saveConfig, updateSettings, runScalping, runEngine, getHistory, getLatest, getOpportunities, getBest, getMarketStatus };
