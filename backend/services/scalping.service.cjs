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
  if (!rawSymbols) {
    return [];
  }

  if (Array.isArray(rawSymbols)) {
    return rawSymbols
      .map(function mapSymbol(item) {
        return String(item || '').trim().toUpperCase();
      })
      .filter(Boolean);
  }

  if (typeof rawSymbols === 'string') {
    try {
      const parsed = JSON.parse(rawSymbols);
      if (Array.isArray(parsed)) {
        return parsed
          .map(function mapParsed(item) {
            return String(item || '').trim().toUpperCase();
          })
          .filter(Boolean);
      }
    } catch (error) {
      return rawSymbols
        .split(',')
        .map(function splitSymbol(item) {
          return String(item || '').trim().toUpperCase();
        })
        .filter(Boolean);
    }
  }

  return [];
}

function serializeSymbols(symbols) {
  return JSON.stringify(parseSymbols(symbols));
}

function normalizeConfidence(value) {
  const numeric = safeNumber(value, 0);

  if (numeric <= 1) {
    return clamp(Math.round(numeric * 100), 0, 100);
  }

  return clamp(Math.round(numeric), 0, 100);
}

function pickFirstNonEmpty() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

function pickPrice(payload) {
  if (!payload || typeof payload !== 'object') {
    return 0;
  }

  const candidates = [
    payload.lastPrice,
    payload.price,
    payload.close,
    payload.finalPrice,
    payload.pclose,
    payload.last,
    payload.tradePrice,
    payload.pl,
    payload.pc,
    payload.value
  ];

  for (const item of candidates) {
    const value = Number(item);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  if (payload.data && typeof payload.data === 'object') {
    return pickPrice(payload.data);
  }

  if (Array.isArray(payload.data) && payload.data.length > 0) {
    return pickPrice(payload.data[0]);
  }

  return 0;
}

function mapConfigForOutput(config) {
  if (!config) {
    return { symbols: [] };
  }

  return Object.assign({}, config, {
    symbols: parseSymbols(config.symbols)
  });
}

// اصلاح شده برای سازگاری با مدل جدید ScalpingOpportunity
function mapOpportunityForOutput(item) {
  if (!item) {
    return null;
  }

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
  if (!run) {
    return null;
  }

  return Object.assign({}, run, {
    meta: typeof run.meta === 'string' ? safeJsonParse(run.meta, run.meta) : run.meta,
    results: Array.isArray(run.results)
      ? run.results.map(function mapResult(result) {
          // اصلاح شده برای خواندن از dataJson بجای extra
          return Object.assign({}, result, {
            extra: typeof result.dataJson === 'string' ? safeJsonParse(result.dataJson, result.dataJson) : result.dataJson
          });
        })
      : []
  });
}

async function finalizeRun(runId, status, meta) {
  const data = {
    status: status,
    finishedAt: new Date()
  };

  if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) {
    data.meta = JSON.stringify(meta);
  }

  try {
    await prisma.scalpingRun.update({
      where: { id: runId },
      data: data
    });
  } catch (error) {
    console.error('[SCALPING SERVICE] Failed to finalize run:', error.message);
  }
}

async function getOrCreateConfig(userId) {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    throw new Error('Valid userId is required');
  }

  let config = await prisma.scalpingConfig.findUnique({
    where: { userId: normalizedUserId }
  });

  if (!config) {
    config = await prisma.scalpingConfig.create({
      data: {
        userId: normalizedUserId,
        symbols: '[]'
      }
    });
  }

  return config;
}

async function getSettings(userId) {
  const config = await getOrCreateConfig(userId);
  return mapConfigForOutput(config);
}

async function saveConfig(userId, data) {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    throw new Error('Valid userId is required');
  }

  const payload = Object.assign({}, data || {});

  if (Object.prototype.hasOwnProperty.call(payload, 'symbols')) {
    payload.symbols = serializeSymbols(payload.symbols);
  }

  const saved = await prisma.scalpingConfig.upsert({
    where: { userId: normalizedUserId },
    create: Object.assign({ userId: normalizedUserId }, payload),
    update: payload
  });

  return saved;
}

async function updateSettings(userId, data) {
  const saved = await saveConfig(userId, data);
  return mapConfigForOutput(saved);
}

function normalizeMarketStatus(status, sourceName) {
  const checkedAt = new Date().toISOString();

  if (!status || typeof status !== 'object') {
    return {
      isOpen: false,
      available: false,
      source: sourceName || 'unknown',
      reason: 'invalid-market-status-payload',
      checkedAt: checkedAt
    };
  }

  return {
    isOpen: !!status.isOpen,
    available: status.available === undefined ? true : !!status.available,
    source: status.source || sourceName || 'unknown',
    reason: status.reason || 'ok',
    checkedAt: checkedAt
  };
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
      return {
        isOpen: !!isOpen,
        available: true,
        source: 'brs.isMarketOpen',
        reason: isOpen ? 'market-open' : 'market-closed',
        checkedAt: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      isOpen: false,
      available: false,
      source: 'market-status-error',
      reason: error && error.message ? error.message : 'market-status-failed',
      checkedAt: new Date().toISOString()
    };
  }

  return {
    isOpen: false,
    available: false,
    source: 'market-status-missing',
    reason: 'BRS market status function is not available',
    checkedAt: new Date().toISOString()
  };
}

function extractSymbolIdentity(item) {
  const symbol = String(
    pickFirstNonEmpty(
      item.symbol,
      item.Symbol,
      item.l18,
      item.insCodeSymbol,
      item.ticker,
      item.code
    ) || ''
  ).trim().toUpperCase();

  const companyName = String(
    pickFirstNonEmpty(
      item.companyName,
      item.CompanyName,
      item.name,
      item.l30,
      item.title,
      item.fullName
    ) || ''
  ).trim();

  const insCode = String(
    pickFirstNonEmpty(
      item.insCode,
      item.InsCode,
      item.instrumentCode,
      item.id,
      item.ID
    ) || ''
  ).trim();

  return {
    symbol: symbol,
    companyName: companyName,
    insCode: insCode
  };
}

function normalizeCandle(candle) {
  if (!candle || typeof candle !== 'object') {
    return null;
  }

  const open = safeNumber(pickFirstNonEmpty(candle.open, candle.o, candle.OpenPrice), 0);
  const high = safeNumber(pickFirstNonEmpty(candle.high, candle.h, candle.HighPrice), 0);
  const low = safeNumber(pickFirstNonEmpty(candle.low, candle.l, candle.LowPrice), 0);
  const close = safeNumber(
    pickFirstNonEmpty(candle.close, candle.c, candle.lastPrice, candle.finalPrice, candle.ClosePrice),
    0
  );
  const volume = safeNumber(
    pickFirstNonEmpty(candle.volume, candle.v, candle.qTotTran5J, candle.Volume),
    0
  );
  const value = safeNumber(
    pickFirstNonEmpty(candle.value, candle.qTotCap, candle.tradeValue, candle.Value),
    0
  );

  if (close <= 0) {
    return null;
  }

  return {
    date: pickFirstNonEmpty(candle.date, candle.dEven, candle.Date) || null,
    open: open > 0 ? open : close,
    high: high > 0 ? high : close,
    low: low > 0 ? low : close,
    close: close,
    volume: volume,
    value: value
  };
}

function sortCandles(candles) {
  return candles.slice().sort(function sortByDate(a, b) {
    const ad = String(a && a.date ? a.date : '');
    const bd = String(b && b.date ? b.date : '');
    if (ad === bd) {
      return 0;
    }
    return ad > bd ? 1 : -1;
  });
}

function normalizeCandles(raw) {
  let items = [];

  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && Array.isArray(raw.data)) {
    items = raw.data;
  } else if (raw && Array.isArray(raw.result)) {
    items = raw.result;
  } else if (raw && raw.data && typeof raw.data === 'object') {
    if (Array.isArray(raw.data.items)) {
      items = raw.data.items;
    } else if (Array.isArray(raw.data.result)) {
      items = raw.data.result;
    }
  }

  return sortCandles(items.map(normalizeCandle).filter(Boolean));
}

function getLatestAndPreviousCandles(candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return { latest: null, previous: null };
  }

  const latest = candles[candles.length - 1] || null;
  const previous = candles.length > 1 ? candles[candles.length - 2] : null;

  return { latest: latest, previous: previous };
}

async function fetchCandlesForSymbol(identity) {
  const insCode = identity && identity.insCode ? identity.insCode : null;
  const symbol = identity && identity.symbol ? identity.symbol : null;
  let response = null;

  if (brsService && typeof brsService.getAdjustedDailyCandlestick === 'function') {
    try {
      response = await brsService.getAdjustedDailyCandlestick(insCode || symbol);
    } catch (error) {
      response = null;
    }
  }

  if (!response && brsService && typeof brsService.getSymbolDailyCandlestick === 'function') {
    try {
      response = await brsService.getSymbolDailyCandlestick(insCode || symbol);
    } catch (error) {
      response = null;
    }
  }

  if (!response && brsService && typeof brsService.getSymbol === 'function' && symbol) {
    const snapshot = await brsService.getSymbol(symbol);
    const price = pickPrice(snapshot);
    if (price > 0) {
      return [
        {
          date: new Date().toISOString().slice(0, 10),
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 0,
          value: 0
        }
      ];
    }
  }

  return normalizeCandles(response);
}

function calculateSignalFromCandles(identity, marketRow, candles) {
  const pair = getLatestAndPreviousCandles(candles);
  const latest = pair.latest;
  const previous = pair.previous;

  if (!latest) {
    return null;
  }

  const lastPrice = safeNumber(latest.close, 0);
  const openPrice = safeNumber(latest.open, lastPrice);
  const highPrice = safeNumber(latest.high, lastPrice);
  const lowPrice = safeNumber(latest.low, lastPrice);
  const volume = safeNumber(latest.volume, 0);
  const prevClose = previous ? safeNumber(previous.close, lastPrice) : lastPrice;
  const prevVolume = previous ? safeNumber(previous.volume, volume) : volume;

  if (lastPrice <= 0) {
    return null;
  }

  const momentumPct = prevClose > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
  const intradayRangePct = lowPrice > 0 ? ((highPrice - lowPrice) / lowPrice) * 100 : 0;
  const bodyPct = openPrice > 0 ? ((lastPrice - openPrice) / openPrice) * 100 : 0;
  const volumeRatio = prevVolume > 0 ? volume / prevVolume : volume > 0 ? 1.2 : 0;
  const closeLocation = highPrice > lowPrice ? (lastPrice - lowPrice) / (highPrice - lowPrice) : 0.5;

  let score = 0;
  score += clamp(momentumPct * 8, -20, 30);
  score += clamp(intradayRangePct * 5, 0, 25);
  score += clamp((volumeRatio - 1) * 18, -10, 20);
  score += clamp((closeLocation - 0.5) * 20, -10, 10);
  score += clamp(bodyPct * 6, -10, 15);

  const signalType = score >= 25 ? 'buy' : 'none';
  const stopLossPct = clamp(Math.max(intradayRangePct * 0.35, 1.2), 1.0, 3.0);
  const targetPct = clamp(Math.max(stopLossPct * 1.8, 2.0), 2.0, 6.0);

  const entryPrice = lastPrice;
  const stopLossPrice = Math.max(1, Math.round(entryPrice * (1 - stopLossPct / 100)));
  const targetPrice = Math.round(entryPrice * (1 + targetPct / 100));
  const exitPrice = targetPrice;

  const reasonParts = [
    'momentum=' + momentumPct.toFixed(2) + '%',
    'range=' + intradayRangePct.toFixed(2) + '%',
    'volumeRatio=' + volumeRatio.toFixed(2),
    'closeLocation=' + closeLocation.toFixed(2)
  ];

  return {
    insCode: identity.insCode || null,
    symbol: identity.symbol,
    companyName: identity.companyName || '',
    signalType: signalType,
    price: entryPrice,
    entryPrice: entryPrice,
    exitPrice: exitPrice,
    targetPrice: targetPrice,
    stopLossPrice: stopLossPrice,
    signalDate: latest.date || new Date().toISOString(),
    strategyName: '7-factor-regime-aware-scalping',
    recommendationText: reasonParts.join(' | '),
    score: clamp(Math.round(score * 100) / 100, 0, 100),
    metrics: {
      momentumPct: momentumPct,
      intradayRangePct: intradayRangePct,
      bodyPct: bodyPct,
      volumeRatio: volumeRatio,
      closeLocation: closeLocation,
      openPrice: openPrice,
      highPrice: highPrice,
      lowPrice: lowPrice,
      lastPrice: lastPrice,
      prevClose: prevClose,
      volume: volume,
      prevVolume: prevVolume
    },
    sourceRow: marketRow || null
  };
}

function isAIFallbackResult(ai) {
  return !!(ai && typeof ai === 'object' && (ai.fallback === true || ai.error));
}

async function analyzeWithAI(candidate, marketStatus) {
  if (!candidate || candidate.signalType === 'none') {
    return {
      confidence: 0,
      score: 0,
      reason: 'No actionable signal',
      source: 'rule-engine',
      approved: false
    };
  }

  const prompt = [
    'شما یک تحلیلگر نوسان گیری بازار بورس ایران هستید.',
    'فقط JSON معتبر برگردان و هیچ متن اضافه ننویس.',
    'فیلدهای الزامی:',
    'confidence: number 0..100',
    'score: number 0..5',
    'reason: string',
    '',
    'نماد: ' + candidate.symbol,
    'نام شرکت: ' + candidate.companyName,
    'قیمت ورود: ' + candidate.entryPrice,
    'حد سود: ' + candidate.targetPrice,
    'حد ضرر: ' + candidate.stopLossPrice,
    'نوع سیگنال: ' + candidate.signalType,
    'امتیاز اولیه: ' + candidate.score,
    'وضعیت بازار: ' + JSON.stringify(marketStatus || {}),
    'متریک ها: ' + JSON.stringify(candidate.metrics || {})
  ].join('\n');

  try {
    if (!gapGPTService || typeof gapGPTService.runAnalysis !== 'function') {
      throw new Error('GapGPT analysis service is not available');
    }

    const ai = await gapGPTService.runAnalysis(prompt);

    if (isAIFallbackResult(ai)) {
      return {
        confidence: 50,
        score: 1.5,
        reason: 'AI fallback',
        source: 'fallback',
        approved: false
      };
    }

    const confidence = normalizeConfidence(ai && ai.confidence);
    const score = clamp(safeNumber(ai && ai.score, 2.5), 0, 5);

    return {
      confidence: confidence,
      score: score,
      reason: (ai && ai.reason) || 'AI confirmed signal',
      source: 'ai',
      approved: confidence >= CONFIDENCE_THRESHOLD
    };
  } catch (error) {
    console.warn('[SCALPING SERVICE] AI failed, fallback applied:', error.message);

    return {
      confidence: 50,
      score: 1.5,
      reason: 'AI unavailable, rule-based result used',
      source: 'fallback',
      approved: false
    };
  }
}

async function createRun(userId, initialStatus, meta) {
  const payload = {
    userId: userId,
    status: initialStatus || 'running'
  };

  if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) {
    payload.meta = JSON.stringify(meta);
  }

  return prisma.scalpingRun.create({
    data: payload
  });
}

async function resolveExecutionUserId(explicitUserId) {
  const normalizedExplicit = normalizeUserId(explicitUserId);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  if (DEFAULT_SYSTEM_USER_ID) {
    return DEFAULT_SYSTEM_USER_ID;
  }

  const firstConfig = await prisma.scalpingConfig.findFirst({
    orderBy: { userId: 'asc' }
  });

  return firstConfig && firstConfig.userId ? firstConfig.userId : null;
}

async function fetchMarketUniverse() {
  if (!brsService || typeof brsService.getAllSymbolsData !== 'function') {
    throw new Error('BRS all symbols service is not available');
  }

  const response = await brsService.getAllSymbolsData();

  if (Array.isArray(response)) {
    return response;
  }

  if (response && Array.isArray(response.data)) {
    return response.data;
  }

  if (response && Array.isArray(response.result)) {
    return response.result;
  }

  if (response && response.data && Array.isArray(response.data.items)) {
    return response.data.items;
  }

  return [];
}

async function buildCandidatesFromUniverse(universe, allowedSymbols) {
  const allowedSet = Array.isArray(allowedSymbols) && allowedSymbols.length > 0
    ? new Set(allowedSymbols.map(function mapAllowed(item) {
        return String(item || '').trim().toUpperCase();
      }))
    : null;

  const candidates = [];
  const errors = [];

  for (const item of universe) {
    const identity = extractSymbolIdentity(item);
    if (!identity.symbol) {
      continue;
    }

    if (allowedSet && !allowedSet.has(identity.symbol)) {
      continue;
    }

    try {
      const candles = await fetchCandlesForSymbol(identity);
      const candidate = calculateSignalFromCandles(identity, item, candles);

      if (candidate && candidate.signalType !== 'none') {
        candidates.push(candidate);
      }
    } catch (error) {
      errors.push({
        symbol: identity.symbol,
        message: error && error.message ? error.message : String(error)
      });
    }
  }

  candidates.sort(function sortCandidates(a, b) {
    return safeNumber(b.score, 0) - safeNumber(a.score, 0);
  });

  return {
    candidates: candidates.slice(0, MAX_CANDIDATES),
    errors: errors
  };
}

// اصلاح شده برای Schema جدید: ذخیره در ScalpingResult و ScalpingOpportunity
async function persistCandidate(runId, userId, candidate, aiResult, marketStatus) {
  const finalApproved = candidate.signalType !== 'none' && (
    aiResult.approved || candidate.score >= 35
  );

  const finalSignal = finalApproved ? candidate.signalType : 'none';

  const metaPayload = {
    recommendationText: aiResult.reason || candidate.recommendationText,
    isGeneratedByAi: aiResult.source === 'ai',
    confidence: aiResult.confidence,
    aiScore: aiResult.score,
    baseScore: candidate.score,
    metrics: candidate.metrics,
    marketStatus: marketStatus,
    strategyName: candidate.strategyName
  };

  // ذخیره در ScalpingResult با فیلد dataJson
  const savedResult = await prisma.scalpingResult.create({
    data: {
      runId: runId,
      symbol: candidate.symbol,
      dataJson: JSON.stringify({
        candidate,
        aiResult,
        marketStatus
      })
    }
  });

  let savedOpportunity = null;

  if (finalSignal !== 'none') {
    // ذخیره در ScalpingOpportunity با فیلدهای جدید
    savedOpportunity = await prisma.scalpingOpportunity.create({
      data: {
        userId: userId,
        symbol: candidate.symbol,
        score: clamp((safeNumber(candidate.score, 0) / 20) + safeNumber(aiResult.score, 0), 0, 5),
        signal: finalSignal,
        entryPrice: candidate.entryPrice,
        stopLoss: candidate.stopLossPrice,
        takeProfit: candidate.targetPrice,
        status: 'active',
        meta: JSON.stringify(metaPayload)
      }
    });
  }

  return {
    result: savedResult,
    opportunity: savedOpportunity,
    finalSignal: finalSignal
  };
}

async function runScalping(userId, options) {
  const normalizedUserId = await resolveExecutionUserId(userId);
  if (!normalizedUserId) {
    throw new Error('No execution userId is available for scalping run');
  }

  const config = await getOrCreateConfig(normalizedUserId);
  const configuredSymbols = parseSymbols(config.symbols);
  const onlyConfiguredSymbols = !!(options && options.onlyConfiguredSymbols);

  const marketStatus = await getMarketStatus();
  const run = await createRun(normalizedUserId, 'running', {
    marketStatus: marketStatus,
    configuredSymbols: configuredSymbols,
    mode: onlyConfiguredSymbols ? 'configured-symbols' : 'all-symbols'
  });

  if (!marketStatus.available || !marketStatus.isOpen) {
    await finalizeRun(run.id, 'skipped', {
      reason: marketStatus.available === false ? 'market-status-unavailable' : 'market-closed',
      marketStatus: marketStatus,
      processedSymbols: 0,
      savedResults: 0,
      savedOpportunities: 0
    });

    return {
      runId: run.id,
      status: 'skipped',
      count: 0,
      actionableCount: 0,
      bestSignal: null,
      results: [],
      errors: [],
      marketStatus: marketStatus
    };
  }

  if (onlyConfiguredSymbols && configuredSymbols.length === 0) {
    await finalizeRun(run.id, 'skipped', {
      reason: 'no-configured-symbols',
      marketStatus: marketStatus,
      processedSymbols: 0,
      savedResults: 0,
      savedOpportunities: 0
    });

    return {
      runId: run.id,
      status: 'skipped',
      count: 0,
      actionableCount: 0,
      bestSignal: null,
      results: [],
      errors: [],
      marketStatus: marketStatus
    };
  }

  try {
    const universe = await fetchMarketUniverse();
    const candidateBuild = await buildCandidatesFromUniverse(
      universe,
      onlyConfiguredSymbols ? configuredSymbols : null
    );

    const topForReview = candidateBuild.candidates.slice(0, AI_REVIEW_LIMIT);
    const savedResults = [];
    const outputSignals = [];
    let savedOpportunities = 0;

    for (const candidate of topForReview) {
      const aiResult = await analyzeWithAI(candidate, marketStatus);
      const persisted = await persistCandidate(run.id, normalizedUserId, candidate, aiResult, marketStatus);

      savedResults.push(persisted.result);

      if (persisted.opportunity) {
        savedOpportunities += 1;
      }

      outputSignals.push({
        insCode: candidate.insCode,
        symbol: candidate.symbol,
        companyName: candidate.companyName,
        signalType: persisted.finalSignal,
        entryPrice: candidate.entryPrice,
        exitPrice: candidate.exitPrice,
        targetPrice: candidate.targetPrice,
        stopLossPrice: candidate.stopLossPrice,
        signalDate: candidate.signalDate,
        marketStatus: marketStatus,
        strategyName: candidate.strategyName,
        recommendationText: aiResult.reason || candidate.recommendationText,
        isGeneratedByAi: aiResult.source === 'ai',
        confidence: aiResult.confidence,
        aiScore: aiResult.score,
        score: candidate.score
      });
    }

    outputSignals.sort(function sortOutput(a, b) {
      return safeNumber(b.score, 0) - safeNumber(a.score, 0);
    });

    const actionableSignals = outputSignals.filter(function filterSignal(item) {
      return item.signalType && item.signalType !== 'none';
    });

    const bestSignal = actionableSignals.length > 0 ? actionableSignals[0] : null;
    const finalStatus =
      savedResults.length === 0 && candidateBuild.errors.length > 0
        ? 'failed'
        : candidateBuild.errors.length > 0
          ? 'partial'
          : 'success';

    await finalizeRun(run.id, finalStatus, {
      marketStatus: marketStatus,
      processedSymbols: universe.length,
      shortlistedCandidates: candidateBuild.candidates.length,
      reviewedByAi: topForReview.length,
      savedResults: savedResults.length,
      savedOpportunities: savedOpportunities,
      bestSignal: bestSignal,
      errors: candidateBuild.errors
    });

    return {
      runId: run.id,
      status: finalStatus,
      count: outputSignals.length,
      actionableCount: actionableSignals.length,
      bestSignal: bestSignal,
      results: outputSignals,
      errors: candidateBuild.errors,
      marketStatus: marketStatus
    };
  } catch (error) {
    await finalizeRun(run.id, 'failed', {
      marketStatus: marketStatus,
      error: error && error.message ? error.message : String(error)
    });

    throw error;
  }
}

async function runEngine(userId) {
  return runScalping(userId, {
    onlyConfiguredSymbols: false
  });
}

async function getHistory(userId, page, limit) {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    throw new Error('Valid userId is required');
  }

  const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);
  const normalizedLimit = Math.max(parseInt(limit, 10) || DEFAULT_HISTORY_LIMIT, 1);
  const skip = (normalizedPage - 1) * normalizedLimit;
  const where = { userId: normalizedUserId };

  const pair = await Promise.all([
    prisma.scalpingRun.findMany({
      where: where,
      include: { results: true },
      orderBy: { id: 'desc' },
      skip: skip,
      take: normalizedLimit
    }),
    prisma.scalpingRun.count({ where: where })
  ]);

  return {
    items: pair[0].map(mapRunForOutput),
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total: pair[1],
      pages: pair[1] > 0 ? Math.ceil(pair[1] / normalizedLimit) : 0
    }
  };
}

async function history(userId) {
  const result = await getHistory(userId, 1, 100);
  return result.items;
}

async function opportunities(userId) {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    throw new Error('Valid userId is required');
  }

  const items = await prisma.scalpingOpportunity.findMany({
    where: { userId: normalizedUserId },
    orderBy: { id: 'desc' }
  });

  return items.map(mapOpportunityForOutput).filter(Boolean);
}

async function getBestSignal(userId) {
  const items = await opportunities(userId);
  const actionable = items.filter(function filterSignal(item) {
    return item && item.signalType && item.signalType !== 'none';
  });

  if (actionable.length === 0) {
    return null;
  }

  actionable.sort(function sortSignals(a, b) {
    return safeNumber(b.score, 0) - safeNumber(a.score, 0);
  });

  return actionable[0];
}

async function getSignals(userId) {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    throw new Error('Valid userId is required');
  }

  const items = await opportunities(normalizedUserId);
  const actionable = items.filter(function filterSignal(item) {
    return item && item.signalType && item.signalType !== 'none';
  });

  let lastSignalUpdateIso = null;
  if (items.length > 0) {
    const first = items[0];
    lastSignalUpdateIso = toIsoOrNull(first.updatedAt || first.createdAt);
  }

  return {
    signals: items,
    totalSignals: items.length,
    activeSignals: actionable.length,
    bestSignal: actionable.length > 0
      ? actionable.slice().sort(function sortSignals(a, b) {
          return safeNumber(b.score, 0) - safeNumber(a.score, 0);
        })[0]
      : null,
    lastUpdate: lastSignalUpdateIso,
    lastUpdated: lastSignalUpdateIso
  };
}

// اصلاح شده برای Schema جدید: استفاده از فیلدهای اختصاصی به جای reason JSON
async function createSignal(userId, signalData) {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    throw new Error('Valid userId is required');
  }

  const symbol = String(signalData.symbol || '').trim().toUpperCase();
  const price = safeNumber(signalData.price || signalData.entryPrice, 0);
  const score = clamp(safeNumber(signalData.score, 1), 0, 5);

  if (!symbol) {
    throw new Error('Symbol is required');
  }

  const meta = {
    recommendationText: String(signalData.reason || signalData.recommendationText || 'manual-signal').trim(),
    isGeneratedByAi: !!signalData.isGeneratedByAi,
    confidence: normalizeConfidence(signalData.confidence || 0),
    strategyName: String(signalData.strategyName || 'manual').trim()
  };

  const created = await prisma.scalpingOpportunity.create({
    data: {
      userId: normalizedUserId,
      symbol: symbol,
      score: score,
      signal: signalData.signalType || 'buy',
      entryPrice: price,
      stopLoss: safeNumber(signalData.stopLossPrice, 0),
      takeProfit: safeNumber(signalData.targetPrice || signalData.exitPrice, 0),
      status: 'active',
      meta: JSON.stringify(meta)
    }
  });

  return mapOpportunityForOutput(created);
}

function toIsoOrNull(dateLike) {
  if (!dateLike) {
    return null;
  }

  const dt = new Date(dateLike);
  if (Number.isNaN(dt.getTime())) {
    return null;
  }

  return dt.toISOString();
}

async function getStatus(userId) {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    throw new Error('Valid userId is required');
  }

  try {
    const latestRun = await prisma.scalpingRun.findFirst({
      where: { userId: normalizedUserId },
      orderBy: { id: 'desc' },
      include: { results: true }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRuns = await prisma.scalpingRun.findMany({
      where: {
        userId: normalizedUserId,
        createdAt: { gte: today }
      },
      include: { results: true }
    });

    let todayTrades = 0;
    for (const run of todayRuns) {
      const results = Array.isArray(run.results) ? run.results : [];
      for (const result of results) {
        if (result && result.signal && result.signal !== 'none') {
          todayTrades += 1;
        }
      }
    }

    const marketStatus = await getMarketStatus();
    const signalPack = await getSignals(normalizedUserId);

    const runLastUpdateIso = toIsoOrNull(latestRun ? (latestRun.finishedAt || latestRun.createdAt) : null);
    const signalLastUpdateIso = toIsoOrNull(signalPack.lastUpdate);
    const marketCheckedAtIso = toIsoOrNull(marketStatus && marketStatus.checkedAt ? marketStatus.checkedAt : null);
    const nowIso = new Date().toISOString();

    const finalLastUpdate =
      runLastUpdateIso ||
      signalLastUpdateIso ||
      marketCheckedAtIso ||
      nowIso;

    return {
      isRunning: latestRun ? latestRun.status === 'running' : false,
      lastRunId: latestRun ? latestRun.id : null,
      lastStatus: latestRun ? latestRun.status : null,

      lastUpdate: finalLastUpdate,
      lastUpdated: finalLastUpdate,

      statusCheckedAt: marketCheckedAtIso || nowIso,

      todayTrades: todayTrades,
      activePositions: 0,
      todayPnL: 0,
      marketStatus: marketStatus || {
        isOpen: false,
        available: false,
        source: 'market-status-null',
        reason: 'market-status-unavailable',
        checkedAt: nowIso
      },
      bestSignal: signalPack.bestSignal || null,
      totalSignals: signalPack.totalSignals || 0,
      activeSignals: signalPack.activeSignals || 0
    };
  } catch (error) {
    const nowIso = new Date().toISOString();
    console.error('[SCALPING SERVICE] getStatus failed:', error.message);

    return {
      isRunning: false,
      lastRunId: null,
      lastStatus: 'error',
      lastUpdate: nowIso,
      lastUpdated: nowIso,
      statusCheckedAt: nowIso,
      todayTrades: 0,
      activePositions: 0,
      todayPnL: 0,
      marketStatus: {
        isOpen: false,
        available: false,
        source: 'getStatus-catch',
        reason: error && error.message ? error.message : 'get-status-failed',
        checkedAt: nowIso
      },
      bestSignal: null,
      totalSignals: 0,
      activeSignals: 0
    };
  }
}

async function startEngine(userId) {
  return runEngine(userId);
}

async function stopEngine(userId) {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    throw new Error('Valid userId is required');
  }

  const status = await getStatus(normalizedUserId);

  return {
    stopped: false,
    canStop: false,
    message: 'Scalping engine runs on-demand per execution. No cancellable background job is registered in the current schema.',
    status: status
  };
}

async function fetchPrice(symbol) {
  if (!symbol) {
    throw new Error('Symbol is required');
  }

  if (!brsService || typeof brsService.getSymbol !== 'function') {
    throw new Error('BRS symbol service is not available');
  }

  const response = await brsService.getSymbol(symbol);
  const price = pickPrice(response);

  if (!price || price <= 0) {
    throw new Error('Price not found for symbol: ' + symbol);
  }

  return price;
}

function generateSignal(price) {
  const normalizedPrice = safeNumber(price, 0);

  if (normalizedPrice <= 0) {
    return 'none';
  }

  if (normalizedPrice > 1000) {
    return 'sell';
  }

  if (normalizedPrice < 500) {
    return 'buy';
  }

  return 'none';
}

module.exports = {
  getOrCreateConfig: getOrCreateConfig,
  getSettings: getSettings,
  saveConfig: saveConfig,
  updateSettings: updateSettings,
  getHistory: getHistory,
  history: history,
  opportunities: opportunities,
  getBestSignal: getBestSignal,
  getSignals: getSignals,
  createSignal: createSignal,
  getStatus: getStatus,
  getMarketStatus: getMarketStatus,
  runEngine: runEngine,
  runScalping: runScalping,
  startEngine: startEngine,
  stopEngine: stopEngine,
  fetchPrice: fetchPrice,
  generateSignal: generateSignal,
  analyzeWithAI: analyzeWithAI,
  finalizeRun: finalizeRun
};
