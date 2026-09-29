'use strict';

const provider = require('./analysis-data.provider.cjs');
const technical = require('./technical-analysis.v11.service.cjs');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function first(...values) {
  for (const value of values) {
    const n = num(value);
    if (n !== null) return n;
  }
  return null;
}

function qualityWarning(q) {
  if (!q || !Number.isFinite(Number(q.coverageRatio)) || Number(q.coverageRatio) >= 0.75) return null;
  const raw = Number(q.rawHistoryCount || 0);
  const valid = Number(q.candleCount || 0);
  const invalid = Number(q.invalidCandleCount || Math.max(0, raw - valid));
  return `هشدار کیفیت داده: از ${raw} رکورد، ${valid} کندل معتبر و ${invalid} رکورد نامعتبر بوده است؛ پوشش OHLC برابر ${(Number(q.coverageRatio) * 100).toFixed(1)}٪ است.`;
}

function deriveFlowNet(flow, side, averagePrice) {
  const buyVolume = first(flow?.buyVolume, flow?.buyQty, flow?.inVolume);
  const sellVolume = first(flow?.sellVolume, flow?.sellQty, flow?.outVolume);

  // BRS may expose net/netValue as 0 while the underlying buy/sell volumes
  // are populated. In that case the volume-based calculation is more useful
  // and avoids masking a real money-flow direction as zero.
  if (buyVolume !== null && sellVolume !== null && averagePrice !== null && averagePrice > 0 && buyVolume !== sellVolume) {
    return {
      value: (buyVolume - sellVolume) * averagePrice,
      estimated: true,
      method: `حجم خرید و فروش ${side} × میانگین قیمت معامله`
    };
  }

  const direct = first(flow?.netValue, flow?.net);
  if (direct !== null) return { value: direct, estimated: false, method: null };

  if (buyVolume !== null && sellVolume !== null && averagePrice !== null && averagePrice > 0) {
    return {
      value: (buyVolume - sellVolume) * averagePrice,
      estimated: true,
      method: `حجم خرید و فروش ${side} × میانگین قیمت معامله`
    };
  }

  return { value: null, estimated: false, method: null };
}

function deriveFlowValue(flow, field, averagePrice) {
  const direct = first(flow?.[field]);
  if (direct !== null) return { value: direct, estimated: false };

  const volumeField = field === 'buyValue' ? 'buyVolume' : 'sellVolume';
  const volume = first(flow?.[volumeField]);
  if (volume !== null && averagePrice !== null && averagePrice > 0) {
    return { value: volume * averagePrice, estimated: true };
  }

  return { value: null, estimated: false };
}

function normalizeMoneyFlow(market) {
  const flow = market?.moneyFlow || {};
  const real = flow.real || {};
  const legal = flow.legal || flow.institutional || {};
  const averagePrice = first(
    market.averagePrice,
    market.price?.average,
    market.trading?.value && market.trading?.volume > 0
      ? market.trading.value / market.trading.volume
      : null
  );

  const realBuy = deriveFlowValue(real, 'buyValue', averagePrice);
  const realSell = deriveFlowValue(real, 'sellValue', averagePrice);
  const legalBuy = deriveFlowValue(legal, 'buyValue', averagePrice);
  const legalSell = deriveFlowValue(legal, 'sellValue', averagePrice);

  const realDerived = deriveFlowNet(real, 'حقیقی', averagePrice);
  const legalDerived = deriveFlowNet(legal, 'حقوقی', averagePrice);

  const rawNet = first(flow.netValue, flow.net, market.moneyFlowNet);
  const calculatedNet = realDerived.value !== null && legalDerived.value !== null
    ? realDerived.value + legalDerived.value
    : null;
  const net = rawNet !== null && rawNet !== 0 ? rawNet : calculatedNet;

  return {
    net,
    estimated: Boolean(
      realDerived.estimated ||
      legalDerived.estimated ||
      realBuy.estimated ||
      realSell.estimated ||
      legalBuy.estimated ||
      legalSell.estimated
    ),
    real: {
      inflow: first(real.inflow, realBuy.value),
      outflow: first(real.outflow, realSell.value),
      net: realDerived.value,
      estimated: Boolean(realDerived.estimated || realBuy.estimated || realSell.estimated),
      estimateMethod: realDerived.method || (realBuy.estimated || realSell.estimated ? 'حجم معاملات حقیقی × میانگین قیمت معامله' : null),
    },
    legal: {
      inflow: first(legal.inflow, legalBuy.value),
      outflow: first(legal.outflow, legalSell.value),
      net: legalDerived.value,
      estimated: Boolean(legalDerived.estimated || legalBuy.estimated || legalSell.estimated),
      estimateMethod: legalDerived.method || (legalBuy.estimated || legalSell.estimated ? 'حجم معاملات حقوقی × میانگین قیمت معامله' : null),
    },
  };
}

function deriveSentiment(marketData) {
  const priceChange = first(
    marketData.lastChangePercent,
    marketData.priceChangePercent,
    marketData.dailySummary?.priceChangePercent
  );
  const totalFlow = first(marketData.moneyFlow?.net);
  const hasFlow = totalFlow !== null;

  if (priceChange !== null && hasFlow) {
    if (priceChange >= 1 && totalFlow > 0) return 'مثبت';
    if (priceChange <= -1 && totalFlow < 0) return 'منفی';
  }
  if (priceChange !== null) {
    if (priceChange >= 2) return 'مثبت';
    if (priceChange <= -2) return 'منفی';
  }
  if (hasFlow) {
    if (totalFlow > 0) return 'مثبت';
    if (totalFlow < 0) return 'منفی';
  }
  return 'خنثی';
}

function buildMarketData(data) {
  const market = data.market || {};
  const candles = Array.isArray(data.candles) ? data.candles : [];
  const latest = candles[candles.length - 1] || null;
  const currentPrice = first(market.lastPrice, market.lastTradedPrice, market.pDrCotVal, market.pl, market.currentPrice, market.price?.last);
  const closingPrice = first(market.closingPrice, market.closePrice, market.pClosing, market.pc, market.close, market.price?.closing);
  const lastTradedPrice = first(market.lastPrice, market.lastTradedPrice, market.pDrCotVal, market.pl, currentPrice);
  const moneyFlow = normalizeMoneyFlow(market);
  const adjusted = Array.isArray(data.adjustedDailyCandles) && data.adjustedDailyCandles.length ? data.adjustedDailyCandles : candles;

  return {
    ...market,
    currentPrice,
    closingPrice,
    lastClosePrice: closingPrice,
    lastTradedPrice,
    pe: first(market.pe, market.fundamental?.pe),
    eps: first(market.eps, market.fundamental?.eps),
    marketCap: first(market.marketCap, market.fundamental?.marketCap),
    tradedVolume: first(market.tradedVolume, market.volume, market.trading?.volume),
    tradedValue: first(market.tradedValue, market.value, market.tradeValue, market.trading?.value),
    moneyFlow,
    realMoneyFlow: moneyFlow.real.net,
    legalMoneyFlow: moneyFlow.legal.net,
    netMoneyFlow: moneyFlow.net,
    realMoneyFlowEstimated: moneyFlow.real.estimated,
    legalMoneyFlowEstimated: moneyFlow.legal.estimated,
    dailyCandles: candles,
    adjustedDailyCandles: adjusted,
    dailyCandle: latest,
    adjustedDailyCandle: adjusted[adjusted.length - 1] || latest,
    dailySummary: {
      date: latest?.date || market.date || data.fetchedAt,
      openingPrice: first(market.openingPrice, market.open, latest?.open),
      high: first(market.highPrice, market.high, latest?.high),
      low: first(market.lowPrice, market.low, latest?.low),
      average: first(market.averagePrice, market.price?.average),
      closingPrice,
      lastTradedPrice,
      priceChangePercent: first(market.closingPriceChangePercent, market.closeChangePercent, market.pcp, market.priceChangePercent),
      tradedVolume: first(market.tradedVolume, market.volume, latest?.volume),
      tradedValue: first(market.tradedValue, market.value, latest?.value),
      pe: first(market.pe),
      eps: first(market.eps),
      marketCap: first(market.marketCap),
      moneyFlow: moneyFlow.net,
      realMoneyFlow: moneyFlow.real.net,
      legalMoneyFlow: moneyFlow.legal.net,
    },
    marketMetrics: market.marketMetrics || null,
  };
}


function deriveTrendLabels(candles, indicators) {
  const values = closes(candles);
  const current = values[values.length - 1] ?? null;
  const recent = values.slice(-10);
  const shortBase = recent.length >= 5 ? recent[0] : null;
  const shortChange = current !== null && shortBase !== null && shortBase > 0 ? ((current - shortBase) / shortBase) * 100 : null;
  const mediumBase = values.length >= 40 ? values[values.length - 40] : values.length >= 20 ? values[0] : null;
  const mediumChange = current !== null && mediumBase !== null && mediumBase > 0 ? ((current - mediumBase) / mediumBase) * 100 : null;
  const shortMA = indicators.ema20 ?? indicators.sma20;
  const mediumMA = indicators.sma50 ?? indicators.sma20;
  const classify = (change, ma, threshold) => {
    if (change === null && ma === null) return 'خنثی';
    const up = (change !== null && change >= threshold) || (ma !== null && current !== null && current > ma);
    const down = (change !== null && change <= -threshold) || (ma !== null && current !== null && current < ma);
    return up && !down ? 'صعودی' : down && !up ? 'نزولی' : 'خنثی';
  };
  return {
    shortTermTrend: classify(shortChange, shortMA, 1),
    mediumTermTrend: classify(mediumChange, mediumMA, 3),
    shortTermChangePercent: shortChange,
    mediumTermChangePercent: mediumChange,
  };
}

function deriveMultiLevels(candles, result) {
  const current = num(result.currentPrice) ?? first(candles[candles.length - 1]?.close);
  if (current === null || current <= 0) return { entryPoints: [], targets: {} };
  const atrValue = num(result.indicators?.atr14) ?? current * 0.03;
  const support = first(result.supportResistance?.support);
  const resistance = first(result.supportResistance?.resistance);
  const lowerBand = num(result.indicators?.bollinger?.lower);
  const ema20 = first(result.indicators?.ema20, result.indicators?.sma20);
  const highs = candles.slice(-60).map(c => num(c.high)).filter(v => v !== null && v > current);
  const lows = candles.slice(-60).map(c => num(c.low)).filter(v => v !== null && v < current);
  const uniqueSorted = (arr) => [...new Set(arr.map(v => Math.round(v)))].sort((a,b) => a-b);
  const entries = uniqueSorted([
    support,
    lowerBand,
    ema20,
    ...lows.filter(v => v < current * 0.995).slice(-6)
  ]).filter(v => v > 0 && v < current * 0.995);
  const entryCandidates = entries.length ? entries.slice(-3).sort((a,b)=>b-a) : [current * 0.985, current * 0.965, current * 0.94].map(v=>Math.round(v));
  const entryPoints = entryCandidates.map((price, i) => ({
    price,
    reason: i === 0 ? 'ورود نزدیک‌ترین حمایت معتبر زیر قیمت فعلی' : i === 1 ? 'ورود پله‌ای در حمایت پایین‌تر / میانگین متحرک' : 'ورود پله‌ای عمیق‌تر برای اصلاح قیمت'
  }));
  const targetCandidates = uniqueSorted([
    resistance,
    ...highs,
    current + atrValue,
    current + atrValue * 2,
    current + atrValue * 3
  ]).filter(v => v > current * 1.01);
  const targets = {};
  targetCandidates.slice(0, 4).forEach((v, i) => { targets['target' + (i + 1)] = v; });
  if (!Object.keys(targets).length) {
    [1,2,3].forEach((n, i) => { targets['target' + (i + 1)] = Math.round(current + atrValue * n); });
  }
  return { entryPoints, targets };
}
function buildSignals(result, candles) {
  const levels = deriveMultiLevels(candles, result);
  const resistance = first(result.supportResistance?.resistance);
  const exitPoints = Object.entries(levels.targets).map(([key, price]) => ({
    price,
    reason: key === 'target1' ? 'اولین مقاومت/هدف معتبر بالاتر از قیمت فعلی' : 'هدف قیمتی بعدی بر اساس مقاومت و دامنه نوسان'
  }));
  const support = first(result.supportResistance?.support);
  return {
    entryPoints: levels.entryPoints,
    exitPoints,
    stopLoss: support !== null && support > 0 ? Math.round(support * 0.97) : Math.round((num(result.currentPrice) || 0) * 0.93),
    targets: levels.targets,
  };
}

async function analyzeStock(params = {}) {
  const symbol = String(params.symbol || params.stock || '').trim();
  if (!symbol) throw Object.assign(new Error('نماد سهم برای تحلیل مشخص نیست.'), { statusCode: 400, code: 'SYMBOL_REQUIRED' });

  const historyCount = Math.max(50, Math.min(500, Number(params.historyCount ?? params.dailyCount ?? 120)));

  // /api/analyze/stock calls this service directly, without the controller
  // context. Therefore Fundamental data must be resolved here when the caller
  // has not already supplied it. This keeps every deterministic entry point
  // independent of AI and guarantees the CODAL score is carried into the
  // final response instead of falling back to zero.
  // The /api/analyze/stock route is a public deterministic entry point and
  // must never inherit a cached/legacy Fundamental object from another
  // analysis context. Even a legacy object marked "calculated" can contain
  // score=0 and the old insufficient-data explanation. Always resolve the
  // canonical CODAL Fundamental result here, then pass that exact result to
  // the market-data provider so the score and explanation come from the same
  // calculation.
  const fundamentalResult = await provider.getFundamentalData(symbol);
  const fundamentalAnalysis = fundamentalResult && fundamentalResult.analysis
    ? fundamentalResult.analysis
    : null;
  const fundamentalData = fundamentalResult && fundamentalResult.data
    ? fundamentalResult.data
    : null;

  const data = await provider.getMarketData(symbol, {
    historyCount,
    // Reuse the Fundamental result already resolved above. This prevents a
    // second CODAL fetch from producing a different/stale result.
    fundamentalAnalysis,
    fundamentalData,
  });
  if (!data.dataQuality?.deterministicReady) {
    throw Object.assign(new Error('تاریخچه معتبر برای تحلیل تکنیکال کافی نیست.'), { statusCode: 422, code: 'INSUFFICIENT_VALID_HISTORY', dataQuality: data.dataQuality, source: data.sources });
  }

  const result = technical.analyze(data.candles, {
    lookback: params.lookback === undefined ? undefined : Number(params.lookback),
    rsiPeriod: params.rsiPeriod === undefined ? undefined : Number(params.rsiPeriod),
  });
  const marketData = buildMarketData(data);
  const signals = buildSignals({ ...result, currentPrice: marketData.currentPrice }, data.candles);
  const warning = qualityWarning(data.dataQuality);
  // Keep the canonical CODAL Fundamental object intact all the way to the API.
  // Scalar aliases below are derived from this same object for legacy consumers.
  const fundamental = (
    data.fundamentalAnalysis &&
    typeof data.fundamentalAnalysis === 'object'
  ) ? data.fundamentalAnalysis : {
    available: false,
    score: null,
    scoreStatus: 'unavailable',
    scoreCoverage: 0,
    reason: 'برای محاسبه امتیاز بنیادی، داده عددی معتبر از صورت‌های مالی CODAL در دسترس نیست.'
  };
  const fundamentalScore = num(fundamental.score);
  const fundamentalReason = String(
    fundamental.reason ||
    'برای محاسبه امتیاز بنیادی، داده عددی معتبر از صورت‌های مالی CODAL در دسترس نیست.'
  );
  const fundamentalAvailable =
    fundamental.available === true &&
    fundamental.scoreStatus === 'calculated' &&
    fundamentalScore !== null;
  const technicalScore = num(result.score) ?? 0;
  const recommendationFa = result.recommendation || 'نگهداری';
  const recommendation = recommendationFa === 'خرید' ? 'BUY' : recommendationFa === 'فروش' ? 'SELL' : 'HOLD';
  const trendLabels = deriveTrendLabels(data.candles, result.indicators || {});
  const sentiment = deriveSentiment(marketData);
  const summary = [`روند سهم ${result.trend || 'خنثی'} است و امتیاز تکنیکال ${technicalScore} از ۱۰۰ ثبت شده است.`, `سیگنال موتور تکنیکال: ${recommendationFa}.`, `روند کوتاه‌مدت: ${trendLabels.shortTermTrend}؛ میان‌مدت: ${trendLabels.mediumTermTrend}.`, `روند احساس بازار: ${sentiment}.`];
  if (warning) summary.push(warning);

  return {
    success: true,
    symbol: data.symbol,
    recommendation,
    recommendationFa,
    sentiment,
    shortTermTrend: trendLabels.shortTermTrend,
    mediumTermTrend: trendLabels.mediumTermTrend,
    shortTermChangePercent: trendLabels.shortTermChangePercent,
    mediumTermChangePercent: trendLabels.mediumTermChangePercent,
    currentPrice: marketData.currentPrice,
    closingPrice: marketData.closingPrice,
    score: technicalScore,
    confidence: Math.max(0, Math.min(100, technicalScore)),
    trend: result.trend || 'خنثی',
    riskLevel: Array.isArray(result.riskWarnings) && result.riskWarnings.length > 1 ? 'زیاد' : 'متوسط',
    summary: summary.join(' '),
    technicalAnalysis: summary.join(' '),
    // Canonical Fundamental payload. Do not flatten this object to a string:
    // the frontend and history layer use score/status/reason from this exact result.
    fundamentalAnalysis: fundamental,
    fundamentalAvailable,
    // Backward-compatible scalar aliases derived from the canonical object above.
    fundamentalScore,
    fundamentalReason,
    scores: { fundamentalScore, technicalScore },
    signals,
    entryPoints: signals.entryPoints,
    exitPoints: signals.exitPoints,
    stopLoss: signals.stopLoss,
    targets: signals.targets,
    marketData,
    marketMetrics: marketData.marketMetrics,
    dailySummary: marketData.dailySummary,
    adjustedDailyCandle: marketData.adjustedDailyCandle,
    indicators: result.indicators,
    supportResistance: result.supportResistance,
    riskWarnings: result.riskWarnings || [],
    dataQualityWarnings: warning ? [warning] : [],
    reasons: result.reasons || [],
    scoreBreakdown: result.scoreBreakdown || [],
    indicatorQuality: result.indicatorQuality || 'نامشخص',
    deterministic: true,
    engine: { name: 'deterministic-technical-analysis', version: result.version || '1.1.1', deterministic: true },
    dataQuality: data.dataQuality,
    source: data.sources,
    fetchedAt: data.fetchedAt,
    fundamentalMeta: data.meta?.fundamentalAnalysis || null,
    priceHistory: { daily: data.candles, adjustedDaily: marketData.adjustedDailyCandles, weekly: [] },
    analysisDate: data.fetchedAt || new Date().toISOString(),
  };
}

module.exports = { analyzeStock };
