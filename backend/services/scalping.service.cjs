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
  if (!status || typeof status !== 'object') return { isOpen: false, available: false, source: sourceName || 'unknown', reason: 'invalid-market-status-payload', checkedAt };
  return { isOpen: !!status.isOpen, available: status.available === undefined ? true : !!status.available, source: status.source || sourceName || 'unknown', reason: status.reason || 'ok', checkedAt };
}
async function getMarketStatus() {
  try {
    if (brsService && typeof brsService.getLocalMarketWindowStatus === 'function') return normalizeMarketStatus(await brsService.getLocalMarketWindowStatus(), 'brs.getLocalMarketWindowStatus');
    if (brsService && typeof brsService.getMarketStatus === 'function') return normalizeMarketStatus(await brsService.getMarketStatus(), 'brs.getMarketStatus');
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
  return { symbol, companyName, insCode };
}
function normalizeCandle(candle) {
  if (!candle || typeof candle !== 'object') return null;
  const open = safeNumber(pickFirstNonEmpty(candle.open, candle.o, candle.OpenPrice, candle.pf), 0);
  const high = safeNumber(pickFirstNonEmpty(candle.high, candle.h, candle.HighPrice, candle.pmax), 0);
  const low = safeNumber(pickFirstNonEmpty(candle.low, candle.l, candle.LowPrice, candle.pmin), 0);
  const close = safeNumber(pickFirstNonEmpty(candle.close, candle.c, candle.lastPrice, candle.finalPrice, candle.ClosePrice, candle.pc, candle.pl), 0);
  const last = safeNumber(pickFirstNonEmpty(candle.last, candle.lastPrice, candle.pl, candle.pc, close), close);
  const volume = safeNumber(pickFirstNonEmpty(candle.volume, candle.v, candle.qTotTran5J, candle.Volume, candle.tradedVolume, candle.tradeVolume), 0);
  const value = safeNumber(pickFirstNonEmpty(candle.value, candle.qTotCap, candle.tradeValue, candle.Value, candle.tradedValue), 0);
  const count = safeNumber(pickFirstNonEmpty(candle.count, candle.tradeCount, candle.zTotTran, candle.tno), 0);
  const date = pickFirstNonEmpty(candle.date, candle.dEven, candle.Date, candle.tradeDate, candle.jdate, candle.gdate, candle.insDate) || null;
  if (close <= 0 && last <= 0) return null;
  return { date, open: open > 0 ? open : (close || last), high: high > 0 ? high : (close || last), low: low > 0 ? low : (close || last), close: close || last, last: last || close, volume, value, count };
}
function normalizeUniverseItem(item) {
  const identity = extractSymbolIdentity(item || {});
  return Object.assign({}, item || {}, identity, {
    lastPrice: safeNumber(pickFirstNonEmpty(item && item.lastPrice, item && item.pl, item && item.last), 0),
    closingPrice: safeNumber(pickFirstNonEmpty(item && item.closingPrice, item && item.pc, item && item.close), 0),
    yesterday: safeNumber(pickFirstNonEmpty(item && item.yesterday, item && item.py), 0),
    high: safeNumber(pickFirstNonEmpty(item && item.high, item && item.pmax), 0), low: safeNumber(pickFirstNonEmpty(item && item.low, item && item.pmin), 0),
    open: safeNumber(pickFirstNonEmpty(item && item.open, item && item.pf), 0), tradeVolume: safeNumber(pickFirstNonEmpty(item && item.tradeVolume, item && item.tvol, item && item.volume), 0),
    tradeValue: safeNumber(pickFirstNonEmpty(item && item.tradeValue, item && item.tval, item && item.value), 0), tradeCount: safeNumber(pickFirstNonEmpty(item && item.tradeCount, item && item.tno, item && item.count), 0),
    lastChangePercent: safeNumber(pickFirstNonEmpty(item && item.lastChangePercent, item && item.plp), 0), closingChangePercent: safeNumber(pickFirstNonEmpty(item && item.closingChangePercent, item && item.pcp), 0),
    realBuyVolume: safeNumber(pickFirstNonEmpty(item && item.realBuyVolume, item && item.Buy_I_Volume), 0), realSellVolume: safeNumber(pickFirstNonEmpty(item && item.realSellVolume, item && item.Sell_I_Volume), 0),
    instBuyVolume: safeNumber(pickFirstNonEmpty(item && item.instBuyVolume, item && item.Buy_N_Volume), 0), instSellVolume: safeNumber(pickFirstNonEmpty(item && item.instSellVolume, item && item.Sell_N_Volume), 0)
  });
}
function unwrapData(response) {
  if (!response) return {};
  if (Array.isArray(response)) return response;
  if (response.data && typeof response.data === 'object') return Array.isArray(response.data) ? response.data : unwrapData(response.data);
  if (response.result && typeof response.result === 'object') return Array.isArray(response.result) ? response.result : unwrapData(response.result);
  if (response.symbolData && typeof response.symbolData === 'object') return response.symbolData;
  if (response.snapshot && typeof response.snapshot === 'object') return response.snapshot;
  return response;
}
function extractArray(response) {
  if (Array.isArray(response)) return response;
  const unwrapped = unwrapData(response);
  if (Array.isArray(unwrapped)) return unwrapped;
  if (unwrapped && typeof unwrapped === 'object') {
    for (const key of ['items','rows','records','candles','history','daily','data','result']) if (Array.isArray(unwrapped[key])) return unwrapped[key];
  }
  return [];
}
async function fetchRecentCandles(symbol, limit) {
  const loaders = [];
  if (brsService && typeof brsService.getAdjustedDailyCandlestick === 'function') loaders.push(['adjusted', () => brsService.getAdjustedDailyCandlestick(symbol, limit)]);
  if (brsService && typeof brsService.getSymbolHistory === 'function') loaders.push(['history', () => brsService.getSymbolHistory(symbol, limit)]);
  for (const [name, loader] of loaders) {
    try {
      const normalized = extractArray(await loader()).map(normalizeCandle).filter(Boolean);
      if (normalized.length > 0) {
        console.log('[SCALPING SERVICE] Candles loaded:', symbol, name, normalized.length);
        return normalized.slice(0, limit);
      }
    } catch (error) { console.warn('[SCALPING SERVICE] Candle fetch failed:', symbol, name, error.message); }
  }
  return [];
}
function buildWeeklyCandles(dailyCandles) {
  if (!Array.isArray(dailyCandles) || dailyCandles.length === 0) return [];
  const chronological = dailyCandles.slice().reverse();
  const weeks = [];
  for (let i = 0; i < chronological.length; i += 5) {
    const chunk = chronological.slice(i, i + 5);
    if (!chunk.length) continue;
    const first = chunk[0]; const last = chunk[chunk.length - 1];
    weeks.push({ date: last.date, open: first.open, high: Math.max(...chunk.map(x => x.high)), low: Math.min(...chunk.map(x => x.low)), close: last.close, last: last.last, volume: chunk.reduce((s, x) => s + safeNumber(x.volume, 0), 0), value: chunk.reduce((s, x) => s + safeNumber(x.value, 0), 0), count: chunk.reduce((s, x) => s + safeNumber(x.count, 0), 0) });
  }
  return weeks.reverse();
}
function scoreUniverseItem(item) {
  const last = safeNumber(item.lastPrice, 0); const close = safeNumber(item.closingPrice, last); const yesterday = safeNumber(item.yesterday, close);
  const pct = yesterday > 0 ? ((last - yesterday) / yesterday) * 100 : safeNumber(item.lastChangePercent, 0);
  const flow = safeNumber(item.realBuyVolume, 0) - safeNumber(item.realSellVolume, 0); const volume = safeNumber(item.tradeVolume, 0);
  const activity = Math.min(20, Math.log10(Math.max(volume, 1)) * 2); const momentum = clamp(10 + pct * 2, 0, 20); const flowScore = clamp(10 + (flow / Math.max(volume, 1)) * 20, 0, 20); const liquidity = Math.min(20, activity);
  const score = clamp(Math.round(momentum + flowScore + liquidity), 0, 100); const signal = score >= 70 ? 'buy' : score >= 55 ? 'watch' : 'none';
  return { score, signal, pct, flow, last, close };
}
function buildCandidate(item) {
  const normalized = normalizeUniverseItem(item); const scored = scoreUniverseItem(normalized); const entryPrice = scored.last > 0 ? scored.last : scored.close;
  if (!normalized.symbol || entryPrice <= 0) return null;
  const targetPrice = entryPrice * 1.02; const stopLossPrice = entryPrice * 0.99;
  return Object.assign({}, normalized, { score: scored.score, signal: scored.signal, entryPrice, exitPrice: targetPrice, targetPrice, stopLossPrice, strategyName: 'momentum-flow', signalDate: new Date().toISOString(), recommendationText: scored.signal === 'buy' ? 'مومنتوم و جریان نقدینگی مناسب است.' : 'در حال بررسی؛ هنوز سیگنال قطعی صادر نشده است.' });
}
async function buildCandidatesFromUniverse(universe, allowedSymbols) {
  const allowedSet = Array.isArray(allowedSymbols) && allowedSymbols.length > 0 ? new Set(allowedSymbols.map(item => String(item).trim().toUpperCase())) : null;
  const candidates = []; const errors = [];
  for (const rawItem of Array.isArray(universe) ? universe : []) {
    const item = normalizeUniverseItem(rawItem); if (!item.symbol || (allowedSet && !allowedSet.has(item.symbol))) continue;
    try { const candidate = buildCandidate(item); if (candidate) candidates.push(candidate); } catch (error) { errors.push({ symbol: item.symbol, message: error.message }); }
  }
  candidates.sort((a, b) => safeNumber(b.score, 0) - safeNumber(a.score, 0));
  return { candidates: candidates.slice(0, MAX_CANDIDATES), errors };
}
function extractMoneyFlow(candidate) {
  const realBuy = safeNumber(candidate.realBuyVolume, 0); const realSell = safeNumber(candidate.realSellVolume, 0);
  const instBuy = safeNumber(candidate.instBuyVolume, 0); const instSell = safeNumber(candidate.instSellVolume, 0);
  const realNet = realBuy - realSell; const legalNet = instBuy - instSell;
  return { real: { inflow: realBuy, outflow: realSell, net: realNet }, legal: { inflow: instBuy, outflow: instSell, net: legalNet }, net: realNet + legalNet };
}
function buildScalpingMarketData(candidate, snapshot, dailyCandles) {
  const snapshotData = unwrapData(snapshot); const merged = Object.assign({}, candidate, snapshotData && typeof snapshotData === 'object' ? snapshotData : {});
  const normalized = normalizeUniverseItem(merged); const candles = Array.isArray(dailyCandles) ? dailyCandles : [];
  const latest = candles.length ? candles[0] : null;
  const closingPrice = normalized.closingPrice > 0 ? normalized.closingPrice : (latest ? latest.close : 0);
  const lastPrice = normalized.lastPrice > 0 ? normalized.lastPrice : (latest ? latest.last : closingPrice);
  const tradedVolume = normalized.tradeVolume > 0 ? normalized.tradeVolume : (latest ? latest.volume : 0);
  const tradeValue = normalized.tradeValue > 0 ? normalized.tradeValue : (latest ? latest.value : 0);
  const moneyFlow = extractMoneyFlow(normalized);
  const weeklyCandles = buildWeeklyCandles(candles);
  return {
    symbol: normalized.symbol, companyName: normalized.companyName, closingPrice, lastPrice, tradedVolume, tradeValue,
    yesterdayClose: normalized.yesterday, priceChangePercent: normalized.lastChangePercent, highPrice: normalized.high, lowPrice: normalized.low,
    moneyFlow, realMoneyFlow: moneyFlow.real.net, legalMoneyFlow: moneyFlow.legal.net,
    dailyCandles: candles, adjustedDailyCandles: candles, weeklyCandles, weekly: weeklyCandles,
    source: { snapshot: !!snapshot, candles: candles.length > 0 ? 'brs' : 'unavailable' },
    dataInsufficient: closingPrice <= 0 || tradedVolume <= 0 || candles.length === 0
  };
}
async function loadCandidateMarketData(candidate) {
  let snapshot = null; let candles = [];
  if (brsService && typeof brsService.getSymbolData === 'function') {
    try { snapshot = await brsService.getSymbolData(candidate.symbol); console.log('[SCALPING SERVICE] Snapshot loaded:', candidate.symbol); }
    catch (error) { console.warn('[SCALPING SERVICE] Snapshot fetch failed:', candidate.symbol, error.message); }
  }
  candles = await fetchRecentCandles(candidate.symbol, SCALPING_CANDLE_LIMIT);
  return buildScalpingMarketData(candidate, snapshot, candles);
}
async function analyzeWithAI(candidate, marketStatus, userId) {
  const marketData = await loadCandidateMarketData(candidate);
  const input = {
    type: 'scalping', symbol: candidate.symbol, context: 'live-scalping-scan',
    candidate: { score: candidate.score, signal: candidate.signal, entryPrice: candidate.entryPrice, targetPrice: candidate.targetPrice, stopLossPrice: candidate.stopLossPrice, strategyName: candidate.strategyName },
    marketStatus, marketData,
    analysisDataQuality: {
      liveSnapshotRequested: true, liveSnapshotSucceeded: !!marketData.source.snapshot,
      adjustedDailyRequested: true, adjustedDailySucceeded: marketData.dailyCandles.length > 0,
      hasLiveSnapshot: !!marketData.source.snapshot, hasDailyHistory: marketData.dailyCandles.length > 0,
      hasRichDailyHistory: marketData.dailyCandles.length >= 5, hasMoneyFlow: Number.isFinite(marketData.realMoneyFlow) || Number.isFinite(marketData.legalMoneyFlow),
      isFallbackUsed: false
    }
  };
  if (!gapGPTService || typeof gapGPTService.runAnalysis !== 'function') {
    return { source: 'rules', score: candidate.score, confidence: candidate.score, reason: candidate.recommendationText, marketData };
  }
  try {
    const first = await gapGPTService.runAnalysis(input, userId || null);
    const result = first && typeof first === 'object' ? first : {};
    const returnedMarketData = result.marketData && typeof result.marketData === 'object' ? result.marketData : {};
    const effectiveMarketData = Object.assign({}, marketData, returnedMarketData, {
      closingPrice: safeNumber(returnedMarketData.closingPrice, marketData.closingPrice),
      tradedVolume: safeNumber(returnedMarketData.tradedVolume, marketData.tradedVolume),
      dailyCandles: Array.isArray(returnedMarketData.dailyCandles) && returnedMarketData.dailyCandles.length ? returnedMarketData.dailyCandles : marketData.dailyCandles,
      weeklyCandles: Array.isArray(returnedMarketData.weeklyCandles) && returnedMarketData.weeklyCandles.length ? returnedMarketData.weeklyCandles : marketData.weeklyCandles,
      moneyFlow: returnedMarketData.moneyFlow || marketData.moneyFlow
    });
    const score = normalizeConfidence(result.score != null ? result.score : result.confidence);
    const confidence = normalizeConfidence(result.confidence != null ? result.confidence : score);
    const recommendation = result.recommendation || result.reason || result.summary || candidate.recommendationText;
    const aiSignal = Array.isArray(result.signals) && result.signals.length ? result.signals[0] : null;
    return { source: result.fallback ? 'rules-fallback' : 'ai', score, confidence, reason: typeof recommendation === 'string' ? recommendation : candidate.recommendationText, marketData: effectiveMarketData, raw: result, aiSignal };
  } catch (error) {
    return { source: 'rules-fallback', score: candidate.score, confidence: candidate.score, reason: candidate.recommendationText + ' بررسی AI در دسترس نبود.', marketData };
  }
}
async function persistCandidate(runId, userId, candidate, aiResult, marketStatus) {
  const finalScore = safeNumber(aiResult && aiResult.score, candidate.score); const confidence = normalizeConfidence(aiResult && aiResult.confidence);
  const finalSignal = finalScore >= CONFIDENCE_THRESHOLD && candidate.signal !== 'none' ? candidate.signal : 'none';
  const meta = JSON.stringify({ marketStatus, strategyName: candidate.strategyName, recommendationText: aiResult.reason || candidate.recommendationText, confidence, aiScore: finalScore, baseScore: candidate.score, isGeneratedByAi: aiResult.source === 'ai', marketData: aiResult.marketData || null, aiSignal: aiResult.aiSignal || null });
  const result = await prisma.scalpingResult.create({ data: { runId, symbol: candidate.symbol, dataJson: JSON.stringify(Object.assign({}, candidate, { aiResult, finalSignal })) } });
  let opportunity = null;
  if (finalSignal !== 'none') opportunity = await prisma.scalpingOpportunity.create({ data: { userId, symbol: candidate.symbol, score: finalScore, signal: finalSignal, entryPrice: candidate.entryPrice, stopLoss: candidate.stopLossPrice, takeProfit: candidate.targetPrice, status: 'active', meta } });
  return { result, opportunity, finalSignal };
}
async function createRun(userId, initialStatus, meta) {
  const payload = { userId, status: initialStatus || 'running' }; if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) payload.meta = JSON.stringify(meta); return prisma.scalpingRun.create({ data: payload });
}
async function resolveExecutionUserId(explicitUserId) {
  const normalizedExplicit = normalizeUserId(explicitUserId); if (normalizedExplicit) return normalizedExplicit; if (DEFAULT_SYSTEM_USER_ID) return DEFAULT_SYSTEM_USER_ID;
  const firstConfig = await prisma.scalpingConfig.findFirst({ orderBy: { userId: 'asc' } }); return firstConfig && firstConfig.userId ? firstConfig.userId : null;
}
async function fetchMarketUniverse() {
  if (!brsService || typeof brsService.getAllSymbols !== 'function') throw new Error('BRS all symbols service is not available');
  const response = await brsService.getAllSymbols(); const data = extractArray(response);
  return data;
}
async function runScalping(userId, options) {
  const opts = options || {}; const normalizedUserId = await resolveExecutionUserId(userId); if (!normalizedUserId) throw new Error('No user available for scalping run');
  const configured = await getOrCreateConfig(normalizedUserId); const configuredSymbols = parseSymbols(configured.symbols); const onlyConfiguredSymbols = opts.onlyConfiguredSymbols === true; const marketStatus = await getMarketStatus();
  if (!marketStatus.available || !marketStatus.isOpen) return { runId: null, status: 'skipped', count: 0, actionableCount: 0, bestSignal: null, results: [], errors: [], marketStatus };
  const run = await createRun(normalizedUserId, 'running', { marketStatus, configuredSymbols, mode: onlyConfiguredSymbols ? 'configured' : 'all-symbols' });
  if (onlyConfiguredSymbols && configuredSymbols.length === 0) { await finalizeRun(run.id, 'skipped', { reason: 'no-configured-symbols', marketStatus, processedSymbols: 0, savedResults: 0, savedOpportunities: 0 }); return { runId: run.id, status: 'skipped', count: 0, actionableCount: 0, bestSignal: null, results: [], errors: [], marketStatus }; }
  try {
    const universe = await fetchMarketUniverse(); const candidateBuild = await buildCandidatesFromUniverse(universe, onlyConfiguredSymbols ? configuredSymbols : null); const topForReview = candidateBuild.candidates.slice(0, AI_REVIEW_LIMIT);
    const savedResults = []; const outputSignals = []; let savedOpportunities = 0;
    for (const candidate of topForReview) {
      const aiResult = await analyzeWithAI(candidate, marketStatus, normalizedUserId); const persisted = await persistCandidate(run.id, normalizedUserId, candidate, aiResult, marketStatus);
      savedResults.push(persisted.result); if (persisted.opportunity) savedOpportunities += 1;
      outputSignals.push({ insCode: candidate.insCode, symbol: candidate.symbol, companyName: candidate.companyName, signalType: persisted.finalSignal, entryPrice: candidate.entryPrice, exitPrice: candidate.exitPrice, targetPrice: candidate.targetPrice, stopLossPrice: candidate.stopLossPrice, signalDate: candidate.signalDate, marketStatus, strategyName: candidate.strategyName, recommendationText: aiResult.reason || candidate.recommendationText, isGeneratedByAi: aiResult.source === 'ai', confidence: aiResult.confidence, aiScore: aiResult.score, score: candidate.score, dataQuality: aiResult.raw && aiResult.raw.meta ? aiResult.raw.meta.analysisDataQuality : null });
    }
    outputSignals.sort((a, b) => safeNumber(b.score, 0) - safeNumber(a.score, 0)); const actionableSignals = outputSignals.filter(item => item.signalType && item.signalType !== 'none'); const bestSignal = actionableSignals.length ? actionableSignals[0] : null;
    const finalStatus = savedResults.length === 0 && candidateBuild.errors.length > 0 ? 'failed' : candidateBuild.errors.length > 0 ? 'partial' : 'success';
    await finalizeRun(run.id, finalStatus, { marketStatus, processedSymbols: universe.length, shortlistedCandidates: candidateBuild.candidates.length, reviewedByAi: topForReview.length, savedResults: savedResults.length, savedOpportunities, bestSignal, errors: candidateBuild.errors });
    return { runId: run.id, status: finalStatus, count: outputSignals.length, actionableCount: actionableSignals.length, bestSignal, results: outputSignals, errors: candidateBuild.errors, marketStatus };
  } catch (error) { await finalizeRun(run.id, 'failed', { marketStatus, error: error && error.message ? error.message : String(error) }); throw error; }
}
async function runEngine(userId) { return runScalping(userId, { onlyConfiguredSymbols: false }); }
async function getHistory(userId, page, limit) {
  const normalizedUserId = normalizeUserId(userId); const safePage = Math.max(parseInt(page, 10) || 1, 1); const safeLimit = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_HISTORY_LIMIT, 1), 100); const skip = (safePage - 1) * safeLimit; const where = normalizedUserId ? { userId: normalizedUserId } : {};
  const [runs, total] = await Promise.all([prisma.scalpingRun.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: safeLimit, include: { results: true } }), prisma.scalpingRun.count({ where })]); return { items: runs.map(mapRunForOutput), total, page: safePage, limit: safeLimit };
}
async function getLatest(userId) { const normalizedUserId = normalizeUserId(userId); const where = normalizedUserId ? { userId: normalizedUserId } : {}; return mapRunForOutput(await prisma.scalpingRun.findFirst({ where, orderBy: { createdAt: 'desc' }, include: { results: true } })); }
async function getOpportunities(userId, options) { const normalizedUserId = normalizeUserId(userId); const limit = Math.min(Math.max(parseInt(options && options.limit, 10) || 50, 1), 200); const where = normalizedUserId ? { userId: normalizedUserId, status: 'active' } : { status: 'active' }; return (await prisma.scalpingOpportunity.findMany({ where, orderBy: [{ score: 'desc' }, { createdAt: 'desc' }], take: limit })).map(mapOpportunityForOutput); }
async function getBest(userId) { return (await getOpportunities(userId, { limit: 1 }))[0] || null; }
module.exports = { getSettings, saveConfig, updateSettings, runScalping, runEngine, getHistory, getLatest, getOpportunities, getBest, getMarketStatus };
