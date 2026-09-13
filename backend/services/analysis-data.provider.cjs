'use strict';

/**
 * Shared data boundary for deterministic analysis.
 *
 * This layer deliberately delegates market-data access to the existing BRS
 * service instead of changing that service. Codal is exposed as an optional
 * fundamental provider and remains disabled until its real API contract is
 * configured.
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

function countValidCandles(history) {
  return asArray(history).filter(function (item) {
    if (!item || typeof item !== 'object') return false;
    var close = Number(item.close != null ? item.close : item.last);
    return Number.isFinite(close) && close > 0;
  }).length;
}

function buildQuality(history, marketResult, fundamentalStatus) {
  var candleCount = countValidCandles(history);
  var marketAvailable = !!unwrap(marketResult);
  var fundamentalConfigured = !!(fundamentalStatus && fundamentalStatus.configured && fundamentalStatus.enabled);

  var score = 0;
  if (marketAvailable) score += 30;
  if (candleCount >= 20) score += 40;
  else if (candleCount >= 10) score += 25;
  else if (candleCount >= 5) score += 15;
  if (fundamentalConfigured) score += 30;

  var level = score >= 80 ? 'عالی' : score >= 55 ? 'متوسط' : 'ضعیف';

  return {
    score: score,
    level: level,
    marketAvailable: marketAvailable,
    candleCount: candleCount,
    fundamentalAvailable: fundamentalConfigured,
    deterministicReady: candleCount >= 5,
    reasons: [
      marketAvailable ? 'داده بازار دریافت شد' : 'داده بازار در دسترس نیست',
      candleCount >= 20 ? 'تاریخچه کافی برای شاخص‌های اصلی وجود دارد' : 'تاریخچه برای برخی شاخص‌ها کافی نیست',
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
  var fundamentalStatus = codal.getStatus();

  return {
    symbol: symbolClean,
    market: market,
    history: history,
    fundamental: null,
    dataQuality: buildQuality(history, marketResult, fundamentalStatus),
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
    version: '1.0.0',
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
