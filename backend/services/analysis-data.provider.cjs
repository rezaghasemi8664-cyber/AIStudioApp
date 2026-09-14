'use strict';

/**
 * Shared data boundary for deterministic analysis.
 *
 * This layer deliberately delegates market-data access to the existing BRS
 * service instead of changing that service. Codal is exposed as an optional
 * fundamental provider and remains disabled until its real API contract is configured.
 */

var brs = require('./brs.service.cjs');
var codal = require('./codal.provider.cjs');

function isoNow() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unwrap(result) {
  if (!result) return null;
  if (Object.prototype.hasOwnProperty.call(result, 'data')) return result.data;
  return result;
}

function getMeta(result) {
  return result && result._meta ? result._meta : null;
}

function toFinite(value) {
  var number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCandles(history) {
  return asArray(history).map(function (item) {
    if (!item || typeof item !== 'object') return null;

    var close = toFinite(item.close != null ? item.close : item.last);
    var open = toFinite(item.open);
    var high = toFinite(item.high);
    var low = toFinite(item.low);
    var volume = toFinite(item.volume != null ? item.volume : item.tradedVolume);

    // Technical indicators require a real OHLC candle. Do not let the
    // historical fallback's zero-OHLC placeholder rows contaminate ATR,
    // Bollinger, support/resistance or future volume indicators.
    if (close == null || close <= 0) return null;
    if (open == null || high == null || low == null) return null;
    if (open <= 0 || high <= 0 || low <= 0) return null;
    if (high < low || high < open || high < close || low > open || low > close) return null;

    return {
      date: item.date || null,
      time: item.time || null,
      open: open,
      high: high,
      low: low,
      close: close,
      last: toFinite(item.last),
      yesterday: toFinite(item.yesterday),
      volume: volume != null && volume >= 0 ? volume : 0,
      value: toFinite(item.value != null ? item.value : item.tradedValue),
      tradeCount: toFinite(item.tradeCount != null ? item.tradeCount : item.count)
    };
  }).filter(Boolean);
}

function buildQuality(candles, history, marketResult, fundamentalStatus) {
  var rawCount = asArray(history).length;
  var candleCount = candles.length;
  var marketAvailable = !!unwrap(marketResult);
  var fundamentalConfigured = !!(fundamentalStatus && fundamentalStatus.configured && fundamentalStatus.enabled);
  var invalidCandleCount = Math.max(0, rawCount - candleCount);

  var score = 0;
  if (marketAvailable) score += 30;
  if (candleCount >= 50) score += 40;
  else if (candleCount >= 20) score += 35;
  else if (candleCount >= 10) score += 20;
  else if (candleCount >= 5) score += 10;
  if (fundamentalConfigured) score += 30;

  var level = score >= 80 ? 'عالی' : score >= 55 ? 'متوسط' : 'ضعیف';

  return {
    score: score,
    level: level,
    marketAvailable: marketAvailable,
    rawHistoryCount: rawCount,
    candleCount: candleCount,
    invalidCandleCount: invalidCandleCount,
    fundamentalAvailable: fundamentalConfigured,
    deterministicReady: candleCount >= 20,
    reasons: [
      marketAvailable ? 'داده بازار دریافت شد' : 'داده بازار در دسترس نیست',
      candleCount >= 50 ? 'تاریخچه معتبر برای شاخص‌های اصلی کافی است' : candleCount >= 20 ? 'تاریخچه معتبر برای شاخص‌های اصلی قابل استفاده است' : 'تاریخچه معتبر برای برخی شاخص‌ها کافی نیست',
      invalidCandleCount > 0 ? 'ردیف‌های فاقد OHLC معتبر از محاسبات تکنیکال حذف شدند' : 'تمام کندل‌های دریافتی OHLC معتبر دارند',
      fundamentalConfigured ? 'داده بنیادی در دسترس است' : 'داده بنیادی هنوز پیکربندی نشده است'
    ]
  };
}

async function getMarketData(symbol, options) {
  var opts = options || {};
  var symbolClean = String(symbol || '').trim();
  if (!symbolClean) throw new Error('Symbol is required');

  var historyCount = Number.isFinite(Number(opts.historyCount))
    ? Math.max(1, Math.min(500, Number(opts.historyCount)))
    : 120;

  var results = await Promise.all([
    brs.getSymbolData(symbolClean),
    brs.getAdjustedDailyCandlestick(symbolClean, historyCount)
  ]);

  var marketResult = results[0];
  var historyResult = results[1];
  var market = unwrap(marketResult);
  var history = asArray(unwrap(historyResult));
  var candles = normalizeCandles(history);
  var fundamentalStatus = codal.getStatus();

  return {
    symbol: symbolClean,
    market: market,
    history: history,
    candles: candles,
    fundamental: null,
    dataQuality: buildQuality(candles, history, marketResult, fundamentalStatus),
    sources: {
      market: 'BRS',
      history: 'BRS',
      fundamental: fundamentalStatus
    },
    fetchedAt: isoNow(),
    meta: {
      market: getMeta(marketResult),
      history: getMeta(historyResult)
    }
  };
}

function getProviderStatus() {
  return {
    provider: 'analysis-data',
    version: '1.1.0',
    market: {
      provider: 'BRS',
      enabled: true,
      methods: [
        'getSymbolData',
        'getAdjustedDailyCandlestick'
      ]
    },
    fundamental: codal.getStatus()
  };
}

module.exports = {
  getMarketData: getMarketData,
  getProviderStatus: getProviderStatus
};
