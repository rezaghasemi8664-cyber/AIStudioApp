'use strict';

const provider = require('./analysis-data.provider.cjs');
const technical = require('./technical-analysis.v11.service.cjs');

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildDataQualityWarning(quality) {
  if (!quality || !Number.isFinite(Number(quality.coverageRatio))) return null;
  const coverage = Number(quality.coverageRatio);
  if (coverage >= 0.75) return null;

  const raw = toNumber(quality.rawHistoryCount, 0);
  const valid = toNumber(quality.candleCount, 0);
  const invalid = toNumber(quality.invalidCandleCount, Math.max(0, raw - valid));
  const percent = (coverage * 100).toFixed(1);

  return `هشدار کیفیت داده: از ${raw} رکورد تاریخچه، ${valid} کندل دارای OHLC معتبر بوده و ${invalid} رکورد حذف شده است؛ پوشش OHLC برابر ${percent}٪ است. نتایج تکنیکال بر اساس کندل‌های معتبر محاسبه شده‌اند.`;
}

function buildTechnicalSummary(result, qualityWarning) {
  const trend = result.trend || 'خنثی';
  const recommendation = result.recommendation || 'نگهداری';
  const score = toNumber(result.score, 0);
  const rsi = toNumber(result.indicators?.rsi, 0);
  const macd = toNumber(result.indicators?.macd?.line, 0);
  const volumeRatio = toNumber(result.indicators?.volume?.ratio, 0);

  const summary = [
    `روند سهم ${trend} است و امتیاز تکنیکال ${score} از ۱۰۰ ثبت شده است.`,
    `RSI برابر ${rsi.toFixed(2)} و MACD برابر ${macd.toFixed(2)} است.`,
    `نسبت حجم معاملات به میانگین برابر ${volumeRatio.toFixed(2)} است.`,
    `سیگنال موتور تکنیکال: ${recommendation}.`,
  ];

  if (qualityWarning) summary.push(qualityWarning);
  return summary.join(' ');
}

function buildRiskLevel(result) {
  const warnings = Array.isArray(result.riskWarnings) ? result.riskWarnings.length : 0;
  const score = toNumber(result.score, 50);
  if (warnings >= 2 || score < 35) return 'زیاد';
  if (warnings === 1 || score < 50 || score > 80) return 'متوسط';
  return 'کم';
}

async function analyzeStock(params = {}) {
  const symbol = String(params.symbol || params.stock || '').trim();
  if (!symbol) {
    const error = new Error('نماد سهم برای تحلیل مشخص نیست.');
    error.statusCode = 400;
    error.code = 'SYMBOL_REQUIRED';
    throw error;
  }

  const historyCount = Math.max(50, Math.min(500, toNumber(params.historyCount ?? params.dailyCount, 120)));
  const lookback = params.lookback === undefined ? undefined : toNumber(params.lookback, undefined);
  const rsiPeriod = params.rsiPeriod === undefined ? undefined : toNumber(params.rsiPeriod, undefined);

  const marketData = await provider.getMarketData(symbol, { historyCount });
  const quality = marketData.dataQuality || {};

  if (!quality.deterministicReady) {
    const error = new Error('تاریخچه معتبر برای تحلیل تکنیکال کافی نیست.');
    error.statusCode = 422;
    error.code = 'INSUFFICIENT_VALID_HISTORY';
    error.dataQuality = quality;
    error.source = marketData.sources;
    throw error;
  }

  const result = technical.analyze(marketData.candles, {
    lookback,
    rsiPeriod,
  });

  const recommendationMap = {
    'خرید': 'BUY',
    'فروش': 'SELL',
    'نگهداری': 'HOLD',
  };

  const dataQualityWarning = buildDataQualityWarning(quality);
  const technicalSummary = buildTechnicalSummary(result, dataQualityWarning);

  return {
    success: true,
    symbol: marketData.symbol,
    recommendation: recommendationMap[result.recommendation] || 'HOLD',
    recommendationFa: result.recommendation || 'نگهداری',
    currentPrice: toNumber(result.currentPrice, 0),
    closingPrice: toNumber(result.currentPrice, 0),
    score: toNumber(result.score, 0),
    confidence: Math.min(100, Math.max(0, toNumber(result.score, 0))),
    trend: result.trend || 'خنثی',
    riskLevel: buildRiskLevel(result),
    summary: technicalSummary,
    technicalAnalysis: technicalSummary,
    fundamentalAnalysis: 'تحلیل بنیادی در این مرحله از موتور قطعی تکنیکال محاسبه نمی‌شود.',
    indicators: result.indicators,
    supportResistance: result.supportResistance,
    riskWarnings: result.riskWarnings || [],
    dataQualityWarnings: dataQualityWarning ? [dataQualityWarning] : [],
    reasons: result.reasons || [],
    scoreBreakdown: result.scoreBreakdown || [],
    indicatorQuality: result.indicatorQuality || 'نامشخص',
    deterministic: true,
    engine: {
      name: 'deterministic-technical-analysis',
      version: result.version || '1.1.1',
      deterministic: true,
    },
    dataQuality: quality,
    source: marketData.sources,
    fetchedAt: marketData.fetchedAt,
    priceHistory: {
      daily: Array.isArray(marketData.candles) ? marketData.candles : [],
      weekly: [],
    },
    analysisDate: marketData.fetchedAt || new Date().toISOString(),
  };
}

module.exports = {
  analyzeStock,
};
