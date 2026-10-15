'use strict';

/**
 * Shared data boundary for deterministic analysis.
 *
 * Market data remains on BRS. CODAL is an optional fundamental-data provider;
 * when configured it is queried for the requested symbol and its normalized
 * announcements are classified and enriched from linked financial Excel files.
 */

var brs = require('./brs.service.cjs');
var allSymbolsSnapshot = require('./allSymbolsSnapshot.service.cjs');
var codal = require('./codal.provider.cjs');
var fundamental = require('./fundamental-analysis.v2.service.cjs');

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
    // Query the dedicated financial-statement category across several
    // pages. A single general page can be filled with routine disclosures,
    // while the financial statements needed for scoring may be on page 2/3.
    const financialPages = Math.max(
      1,
      Math.min(5, Number(process.env.CODAL_FINANCIAL_PAGES) || 1)
    );
    const financialResults = await Promise.all(
      Array.from({ length: financialPages }, (_, index) =>
        codal.getCompanyReports({
          symbol: symbolClean,
          category: '1',
          page: index + 1
        })
      )
    );
    const generalResult = await codal.getCompanyReports({
      symbol: symbolClean,
      page: 1
    });

    const mergedAnnouncements = [];
    const seen = new Set();

    for (const item of [
      ...asArray(generalResult && generalResult.announcements),
      ...financialResults.flatMap(item => asArray(item && item.announcements))
    ]) {
      const key = [
        item && item.code,
        item && item.linkExcel,
        item && item.link,
        item && item.dateSend,
        item && item.title
      ].map(value => String(value || '').trim()).join('|');

      if (seen.has(key)) continue;
      seen.add(key);
      mergedAnnouncements.push(item);
    }

    const result = {
      success: true,
      provider: 'CODAL',
      symbol: symbolClean,
      announcements: mergedAnnouncements,
      countAnnouncement: mergedAnnouncements.length,
      countPage: Math.max(
        Number(generalResult && generalResult.countPage) || 0,
        ...financialResults.map(item => Number(item && item.countPage) || 0)
      ),
      page: 1,
      fetchedAt: new Date().toISOString()
    };

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

function tehranDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    calendar: 'gregory'
  }).format(date || new Date());
}

function isTehranMarketOpen(date) {
  var parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date || new Date());
  var values = Object.fromEntries(parts.map(function (part) { return [part.type, part.value]; }));
  var minute = Number(values.hour || 0) * 60 + Number(values.minute || 0);
  return ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'].includes(values.weekday) &&
    minute >= 9 * 60 && minute < 12 * 60 + 30;
}

function buildSnapshotMarketResult(snapshotResult) {
  if (!snapshotResult || snapshotResult.status !== 'FOUND' || !snapshotResult.symbol) return null;
  var item = snapshotResult.symbol;
  var lastPrice = toFinite(item.lastPrice, item.lastTradedPrice, item.pDrCotVal, item.pl);
  var closingPrice = toFinite(item.closingPrice, item.closePrice, item.pClosing, item.pc);
  if (lastPrice == null || lastPrice <= 0 || closingPrice == null || closingPrice <= 0) return null;

  var updatedAt = snapshotResult.snapshotUpdatedAt ? new Date(snapshotResult.snapshotUpdatedAt) : null;
  if (!updatedAt || !Number.isFinite(updatedAt.getTime())) return null;
  var ageMs = Date.now() - updatedAt.getTime();
  if (ageMs < 0) return null;

  // During expected trading hours, require a recent quote. Outside those
  // hours, use the latest valid database snapshot regardless of its age: the
  // market may be closed for multiple consecutive days or public holidays.
  var fresh = isTehranMarketOpen(new Date()) ? ageMs <= 5 * 60 * 1000 : true;
  if (!fresh) return null;

  var market = Object.assign({}, item, {
    symbol: String(item.symbol || '').trim(),
    name: item.name || item.symbol,
    lastPrice: lastPrice,
    lastTradedPrice: lastPrice,
    pDrCotVal: lastPrice,
    pl: lastPrice,
    lastChange: toFinite(item.lastChange, item.change, item.plc),
    lastChangePercent: toFinite(item.lastChangePercent, item.changePercent, item.plp),
    plp: toFinite(item.lastChangePercent, item.changePercent, item.plp),
    closingPrice: closingPrice,
    closePrice: closingPrice,
    pClosing: closingPrice,
    pc: closingPrice,
    closingChange: toFinite(item.closingChange, item.closeChange),
    closingChangePercent: toFinite(item.closingChangePercent, item.closeChangePercent, item.pcp),
    closeChangePercent: toFinite(item.closingChangePercent, item.closeChangePercent, item.pcp),
    pcp: toFinite(item.closingChangePercent, item.closeChangePercent, item.pcp),
    allowedMin: toFinite(item.allowedMin),
    allowedMax: toFinite(item.allowedMax),
    pe: toFinite(item.pe),
    eps: toFinite(item.eps),
    tradeCount: toFinite(item.tradeCount),
    tradedVolume: toFinite(item.tradeVolume, item.volume, item.tvol),
    volume: toFinite(item.tradeVolume, item.volume, item.tvol),
    tvol: toFinite(item.tradeVolume, item.volume, item.tvol),
    trading: Object.assign({}, item.trading || {}, {
      volume: toFinite(item.tradeVolume, item.volume, item.tvol),
      tradeCount: toFinite(item.tradeCount, item.count, item.tno),
      value: toFinite(item.tradedValue != null ? item.tradedValue : item.value)
    }),
    moneyFlow: Object.assign({}, item.moneyFlow || {}, {
      real: Object.assign({}, item.moneyFlow && item.moneyFlow.real || {}, {
        buyVolume: toFinite(item.realBuyVolume),
        sellVolume: toFinite(item.realSellVolume)
      }),
      legal: Object.assign({}, item.moneyFlow && (item.moneyFlow.legal || item.moneyFlow.institutional) || {}, {
        buyVolume: toFinite(item.instBuyVolume),
        sellVolume: toFinite(item.instSellVolume)
      })
    })
  });

  return {
    data: market,
    _meta: {
      source: 'all-symbols-snapshot',
      cacheHit: true,
      snapshotDate: snapshotResult.snapshotDate,
      snapshotUpdatedAt: updatedAt.toISOString(),
      snapshotAgeMs: ageMs,
      symbolCount: snapshotResult.symbolCount,
      baseSource: snapshotResult.source || 'brsapi-allsymbols'
    }
  };
}

async function getMarketResult(symbolClean) {
  try {
    var snapshot = await allSymbolsSnapshot.searchSymbol(symbolClean);
    var snapshotResult = buildSnapshotMarketResult(snapshot);
    if (snapshotResult) return snapshotResult;
  } catch (error) {
    // Snapshot reads are an optimization; they must never block the existing BRS path.
    console.warn('[ANALYSIS DATA] AllSymbols snapshot unavailable; falling back to BRS:', error && error.message);
  }
  return brs.getSymbolData(symbolClean);
}

async function getMarketData(symbol, options) {
  var opts = options || {};
  var symbolClean = String(symbol || '').trim();
  if (!symbolClean) throw new Error('Symbol is required');

  var historyCount = Number.isFinite(Number(opts.historyCount))
    ? Math.max(1, Math.min(500, Number(opts.historyCount)))
    : 120;

  // The controller may already have fetched and calculated Fundamental data.
  // Reuse that immutable result instead of calling CODAL a second time.
  const suppliedFundamental = opts.fundamentalAnalysis && typeof opts.fundamentalAnalysis === 'object'
    ? {
        data: opts.fundamentalData || null,
        analysis: opts.fundamentalAnalysis,
        status: codal.getStatus(),
        error: null
      }
    : null;

  // Technical analysis must use the unadjusted BRS trading history so the
  // latest candle represents the actual traded/current price. Adjusted history
  // is retained separately for any consumers that explicitly need it.
  var results = await Promise.all([
    getMarketResult(symbolClean),
    brs.getSymbolHistory(symbolClean, historyCount),
    brs.getAdjustedDailyCandlestick(symbolClean, historyCount),
    suppliedFundamental || getFundamentalData(symbolClean)
  ]);

  var marketResult = results[0];
  var historyResult = results[1];
  var adjustedHistoryResult = results[2];
  var fundamentalResult = results[3];
  var market = unwrap(marketResult);
  var history = asArray(unwrap(historyResult));
  var adjustedHistory = asArray(unwrap(adjustedHistoryResult));
  var candles = normalizeCandles(history);
  var adjustedDailyCandles = normalizeCandles(adjustedHistory);
  var historyMeta = getMeta(historyResult);
  var fundamentalStatus = fundamentalResult.status;
  var fundamentalAnalysis = fundamentalResult.analysis || {};

  return {
    symbol: symbolClean,
    market: market,
    history: history,
    candles: candles,
    adjustedDailyCandles: adjustedDailyCandles,
    fundamental: fundamentalResult.data,
    fundamentalAnalysis: fundamentalAnalysis,
    dataQuality: buildQuality(candles, history, marketResult, fundamentalStatus, historyMeta, fundamentalAnalysis),
    sources: {
      market: getMeta(marketResult) && getMeta(marketResult).source === 'all-symbols-snapshot' ? 'AllSymbolsSnapshot' : 'BRS',
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
  getFundamentalData: getFundamentalData,
  getProviderStatus: getProviderStatus
};
