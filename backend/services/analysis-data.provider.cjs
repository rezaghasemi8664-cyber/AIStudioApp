'use strict';

/**
 * Shared data boundary for deterministic analysis.
 *
 * Market data remains on BRS. CODAL is an optional fundamental-data provider;
 * when configured it is queried for the requested symbol and its normalized
 * announcements are classified and enriched from linked financial Excel files.
 */

var brs = require('./brs.service.cjs');
var codal = require('./codal.provider.cjs');
var fundamental = require('./fundamental-analysis.v2.service.cjs');
var brsFundamentalScore = require('./brs-fundamental-score.service.cjs');

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

function chronologyKey(item, index) {
  var date = String(item && item.date || '').trim();
  var time = String(item && item.time || '').trim();
  var raw = date + ' ' + time;
  var parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return parsed;

  var match = date.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})$/);
  if (match) {
    var dayNumber = Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
    var timeMatch = time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    var timeNumber = timeMatch
      ? Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3] || 0)
      : 0;
    return dayNumber * 86400 + timeNumber;
  }

  return Number.POSITIVE_INFINITY + index / 1000000;
}

function normalizeCandles(history) {
  return asArray(history).map(function (item, index) {
    if (!item || typeof item !== 'object') return null;

    var close = toFinite(item.close != null ? item.close : item.last);
    var open = toFinite(item.open);
    var high = toFinite(item.high);
    var low = toFinite(item.low);
    var volume = toFinite(item.volume != null ? item.volume : item.tradedVolume);

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
      tradeCount: toFinite(item.tradeCount != null ? item.tradeCount : item.count),
      _sourceIndex: index
    };
  }).filter(Boolean).sort(function (a, b) {
    var ka = chronologyKey(a, a._sourceIndex);
    var kb = chronologyKey(b, b._sourceIndex);
    return ka - kb;
  }).map(function (item) {
    delete item._sourceIndex;
    return item;
  });
}

function buildQuality(candles, history, marketResult, fundamentalStatus, historyMeta, fundamentalData) {
  var rawCount = asArray(history).length;
  var candleCount = candles.length;
  var marketAvailable = !!unwrap(marketResult);
  var fundamentalConfigured = !!(fundamentalStatus && fundamentalStatus.configured && fundamentalStatus.enabled);
  var fundamentalScoreAvailable = fundamentalData && Number.isFinite(Number(fundamentalData.score));
  var invalidCandleCount = Math.max(0, rawCount - candleCount);
  var coverageRatio = rawCount > 0 ? Number((candleCount / rawCount).toFixed(4)) : 0;
  var fallbackUsed = !!(historyMeta && historyMeta.fallback && historyMeta.fallback.used);
  var stale = !!(historyMeta && historyMeta.stale);

  var marketPoints = marketAvailable ? 30 : 0;
  var historyBasePoints = candleCount >= 50 ? 40 : candleCount >= 20 ? 35 : candleCount >= 10 ? 20 : candleCount >= 5 ? 10 : 0;
  var historyPoints = Math.round(historyBasePoints * coverageRatio);
  var fundamentalPoints = fundamentalScoreAvailable ? 30 : 0;
  var score = Math.max(0, Math.min(100, marketPoints + historyPoints + fundamentalPoints));

  var level = coverageRatio >= 0.9 && score >= 80
    ? 'عالی'
    : coverageRatio >= 0.75 && score >= 60
      ? 'خوب'
      : coverageRatio >= 0.6 && score >= 45
        ? 'متوسط'
        : 'ضعیف';

  var reasons = [
    marketAvailable ? 'داده بازار دریافت شد' : 'داده بازار در دسترس نیست',
    candleCount >= 50 ? 'تاریخچه معتبر برای شاخص‌های اصلی کافی است' : candleCount >= 20 ? 'تاریخچه معتبر برای شاخص‌های اصلی قابل استفاده است' : 'تاریخچه معتبر برای برخی شاخص‌ها کافی نیست',
    invalidCandleCount > 0 ? 'ردیف‌های فاقد OHLC معتبر از محاسبات تکنیکال حذف شدند' : 'تمام کندل‌های دریافتی OHLC معتبر دارند',
    coverageRatio < 0.6 && rawCount > 0
      ? 'پوشش OHLC تاریخچه ضعیف است'
      : coverageRatio < 0.75 && rawCount > 0
        ? 'پوشش OHLC تاریخچه متوسط است'
        : 'پوشش OHLC تاریخچه مناسب است',
    fallbackUsed ? 'داده تاریخچه از مسیر جایگزین دریافت شده است' : 'داده تاریخچه از مسیر اصلی دریافت شده است',
    stale ? 'داده تاریخچه ممکن است قدیمی باشد' : 'داده تاریخچه تازه یا بدون وضعیت قدیمی بودن است',
    fundamentalConfigured ? 'اتصال CODAL پیکربندی شده است' : 'اتصال CODAL هنوز پیکربندی نشده است',
    fundamentalScoreAvailable ? 'امتیاز بنیادی بر اساس داده عددی مالی در دسترس است' : 'امتیاز بنیادی تا استخراج داده عددی صورت‌های مالی محاسبه نمی‌شود'
  ];

  return {
    score: score,
    level: level,
    marketAvailable: marketAvailable,
    rawHistoryCount: rawCount,
    candleCount: candleCount,
    invalidCandleCount: invalidCandleCount,
    coverageRatio: coverageRatio,
    fallbackUsed: fallbackUsed,
    stale: stale,
    chronology: 'ascending-oldest-to-newest',
    fundamentalAvailable: fundamentalScoreAvailable,
    fundamentalConfigured: fundamentalConfigured,
    deterministicReady: candleCount >= 20,
    reasons: reasons
  };
}

async function getFundamentalData(symbolClean) {
  var status = codal.getStatus();
  if (!status.configured || !status.enabled) {
    return {
      data: null,
      analysis: await fundamental.analyzeAnnouncements(null),
      status: status,
      error: null
    };
  }

  try {
    var result = await codal.getCompanyReports({ symbol: symbolClean });
    return {
      data: result,
      analysis: await fundamental.analyzeAnnouncements(result),
      status: status,
      error: null
    };
  } catch (error) {
    return {
      data: null,
      analysis: await fundamental.analyzeAnnouncements(null),
      status: status,
      error: {
        code: error && error.code ? error.code : 'CODAL_REQUEST_FAILED',
        message: error && error.message ? error.message : 'CODAL request failed'
      }
    };
  }
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
    brs.getAdjustedDailyCandlestick(symbolClean, historyCount),
    getFundamentalData(symbolClean)
  ]);

  var marketResult = results[0];
  var historyResult = results[1];
  var fundamentalResult = results[2];
  var market = unwrap(marketResult);
  var history = asArray(unwrap(historyResult));
  var candles = normalizeCandles(history);
  var historyMeta = getMeta(historyResult);
  var fundamentalStatus = fundamentalResult.status;
  var fundamentalAnalysis = fundamentalResult.analysis || {};

  // Direct Codal documents are not reachable from some production networks.
  // When the Codal pipeline cannot calculate a score, use only the already
  // validated numeric BRS symbol snapshot as a deterministic fallback.
  if (!Number.isFinite(Number(fundamentalAnalysis.score)) && market && market.fundamental) {
    var fallbackScore = brsFundamentalScore.calculateFundamentalSnapshotScore(market.fundamental);
    if (fallbackScore && fallbackScore.score !== null) {
      fundamentalAnalysis = Object.assign({}, fundamentalAnalysis, {
        available: true,
        score: fallbackScore.score,
        scoreStatus: fallbackScore.status,
        scoreCoverage: fallbackScore.coverage,
        scoreComponents: fallbackScore.components,
        reason: fallbackScore.reason,
        fallback: true,
        source: fallbackScore.source
      });
    }
  }

  return {
    symbol: symbolClean,
    market: market,
    history: history,
    candles: candles,
    fundamental: fundamentalResult.data,
    fundamentalAnalysis: fundamentalAnalysis,
    dataQuality: buildQuality(candles, history, marketResult, fundamentalStatus, historyMeta, fundamentalAnalysis),
    sources: {
      market: 'BRS',
      history: 'BRS',
      fundamental: fundamentalStatus,
      fundamentalRequest: fundamentalResult.error
    },
    fetchedAt: isoNow(),
    meta: {
      market: getMeta(marketResult),
      history: historyMeta,
      fundamental: fundamentalResult.data
        ? { count: asArray(fundamentalResult.data.announcements).length, fetchedAt: fundamentalResult.data.fetchedAt }
        : null,
      fundamentalAnalysis: fundamentalAnalysis,
      fundamentalError: fundamentalResult.error
    }
  };
}

function getProviderStatus() {
  return {
    provider: 'analysis-data',
    version: '1.6.0',
    market: {
      provider: 'BRS',
      enabled: true,
      methods: ['getSymbolData', 'getAdjustedDailyCandlestick']
    },
    fundamental: codal.getStatus()
  };
}

module.exports = {
  getMarketData: getMarketData,
  getProviderStatus: getProviderStatus
};
