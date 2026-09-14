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
  const direct = first(flow?.netValue, flow?.net);
  if (direct !== null) return { value: direct, estimated: false };

  const buyVolume = first(flow?.buyVolume, flow?.buyQty, flow?.inVolume);
  const sellVolume = first(flow?.sellVolume, flow?.sellQty, flow?.outVolume);
  if (buyVolume !== null && sellVolume !== null && averagePrice !== null && averagePrice > 0) {
    return {
      value: (buyVolume - sellVolume) * averagePrice,
      estimated: true,
      method: `حجم خرید و فروش ${side} × میانگین قیمت معامله`
    };
  }

  return { value: null, estimated: false };
}

function normalizeMoneyFlow(market) {
  const flow = market?.moneyFlow || {};
  const real = flow.real || {};
  const legal = flow.legal || flow.institutional || {};
  const averagePrice = first(market.averagePrice, market.price?.average, market.trading?.value && market.trading?.volume > 0 ? market.trading.value / market.trading.volume : null);
  const realDirect = first(market.realMoneyFlow, real.netValue, real.net);
  const legalDirect = first(market.legalMoneyFlow, legal.netValue, legal.net);
  const realDerived = realDirect !== null ? { value: realDirect, estimated: false } : deriveFlowNet(real, 'حقیقی', averagePrice);
  const legalDerived = legalDirect !== null ? { value: legalDirect, estimated: false } : deriveFlowNet(legal, 'حقوقی', averagePrice);
  const net = first(flow.netValue, flow.net, market.moneyFlowNet, realDerived.value !== null && legalDerived.value !== null ? realDerived.value + legalDerived.value : null);

  return {
    net,
    estimated: Boolean(realDerived.estimated || legalDerived.estimated),
    real: {
      inflow: first(real.inflow, real.buyValue),
      outflow: first(real.outflow, real.sellValue),
      net: realDerived.value,
      estimated: realDerived.estimated,
      estimateMethod: realDerived.method || null,
    },
    legal: {
      inflow: first(legal.inflow, legal.buyValue),
      outflow: first(legal.outflow, legal.sellValue),
      net: legalDerived.value,
      estimated: legalDerived.estimated,
      estimateMethod: legalDerived.method || null,
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

function buildSignals(result) {
  const support = first(result.supportResistance?.support);
  const resistance = first(result.supportResistance?.resistance);
  return {
    entryPoints: support === null ? [] : [{ price: support, reason: 'حمایت تکنیکال اخیر' }],
    exitPoints: resistance === null ? [] : [{ price: resistance, reason: 'مقاومت تکنیکال اخیر' }],
    stopLoss: support !== null && support > 0 ? Math.round(support * 0.97) : null,
    targets: resistance === null ? {} : { target1: resistance },
  };
}

async function analyzeStock(params = {}) {
  const symbol = String(params.symbol || params.stock || '').trim();
  if (!symbol) throw Object.assign(new Error('نماد سهم برای تحلیل مشخص نیست.'), { statusCode: 400, code: 'SYMBOL_REQUIRED' });

  const historyCount = Math.max(50, Math.min(500, Number(params.historyCount ?? params.dailyCount ?? 120)));
  const data = await provider.getMarketData(symbol, { historyCount });
  if (!data.dataQuality?.deterministicReady) {
    throw Object.assign(new Error('تاریخچه معتبر برای تحلیل تکنیکال کافی نیست.'), { statusCode: 422, code: 'INSUFFICIENT_VALID_HISTORY', dataQuality: data.dataQuality, source: data.sources });
  }

  const result = technical.analyze(data.candles, {
    lookback: params.lookback === undefined ? undefined : Number(params.lookback),
    rsiPeriod: params.rsiPeriod === undefined ? undefined : Number(params.rsiPeriod),
  });
  const marketData = buildMarketData(data);
  const signals = buildSignals(result);
  const warning = qualityWarning(data.dataQuality);
  const fundamental = data.fundamentalAnalysis || {};
  const fundamentalScore = num(fundamental.score);
  const technicalScore = num(result.score) ?? 0;
  const recommendationFa = result.recommendation || 'نگهداری';
  const recommendation = recommendationFa === 'خرید' ? 'BUY' : recommendationFa === 'فروش' ? 'SELL' : 'HOLD';
  const sentiment = deriveSentiment(marketData);
  const summary = [`روند سهم ${result.trend || 'خنثی'} است و امتیاز تکنیکال ${technicalScore} از ۱۰۰ ثبت شده است.`, `سیگنال موتور تکنیکال: ${recommendationFa}.`, `روند احساس بازار: ${sentiment}.`];
  if (warning) summary.push(warning);

  return {
    success: true,
    symbol: data.symbol,
    recommendation,
    recommendationFa,
    sentiment,
    currentPrice: marketData.currentPrice,
    closingPrice: marketData.closingPrice,
    score: technicalScore,
    confidence: Math.max(0, Math.min(100, technicalScore)),
    trend: result.trend || 'خنثی',
    riskLevel: Array.isArray(result.riskWarnings) && result.riskWarnings.length > 1 ? 'زیاد' : 'متوسط',
    summary: summary.join(' '),
    technicalAnalysis: summary.join(' '),
    fundamentalAnalysis: String(fundamental.reason || 'برای محاسبه امتیاز بنیادی، داده عددی معتبر از صورت‌های مالی CODAL در دسترس نیست.'),
    fundamentalAvailable: fundamental.available === true && fundamentalScore !== null,
    fundamentalScore: fundamentalScore,
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
