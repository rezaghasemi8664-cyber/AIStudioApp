'use strict';

const { analyzeStock } = require('./deterministic-stock-analysis.service.cjs');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildHistory(result) {
  const source = Array.isArray(result?.priceHistory?.adjustedDaily) && result.priceHistory.adjustedDaily.length
    ? result.priceHistory.adjustedDaily
    : Array.isArray(result?.priceHistory?.daily) ? result.priceHistory.daily : [];
  return source.map((item) => ({
    date: item?.date || item?.timestamp || null,
    close: num(item?.close ?? item?.closingPrice ?? item?.pClosing ?? item?.price),
  })).filter(item => item.date && item.close !== null).slice(-120);
}

function buildComparable(result) {
  const market = result.marketData || {};
  const daily = result.dailySummary || {};
  const scores = result.scores || {};
  const quality = result.dataQuality || {};
  const history = buildHistory(result);
  const qualityFields = [
    ['قیمت پایانی', result.closingPrice],
    ['قیمت فعلی', result.currentPrice],
    ['تغییر روزانه', daily.priceChangePercent ?? market.priceChangePercent],
    ['حجم معاملات', market.tradedVolume],
    ['ارزش معاملات', market.tradedValue],
    ['جریان پول خالص', market.netMoneyFlow ?? market.moneyFlow?.net],
    ['EPS', market.eps],
    ['P/E', market.pe],
    ['ارزش بازار', market.marketCap],
  ];
  const availableFields = qualityFields.filter(([, value]) => num(value) !== null).length;
  const fieldCoverage = qualityFields.length ? availableFields / qualityFields.length : 0;
  const historyCoverage = num(quality.coverageRatio) !== null
    ? Math.max(0, Math.min(1, Number(quality.coverageRatio)))
    : (history.length ? Math.min(1, history.length / 120) : 0);
  const qualityScore = Math.round(((fieldCoverage * 0.45) + (historyCoverage * 0.55)) * 100);
  const qualityLevel = qualityScore >= 90 ? 'عالی' : qualityScore >= 75 ? 'خوب' : qualityScore >= 60 ? 'متوسط' : 'ضعیف';
  return {
    symbol: result.symbol,
    currentPrice: num(result.currentPrice),
    closingPrice: num(result.closingPrice),
    priceChangePercent: num(daily.priceChangePercent ?? market.priceChangePercent),
    technicalScore: num(scores.technicalScore ?? result.score),
    fundamentalScore: num(scores.fundamentalScore),
    totalScore: num(result.score),
    trend: result.trend || 'خنثی',
    recommendation: result.recommendationFa || 'نگهداری',
    riskLevel: result.riskLevel || 'متوسط',
    pe: num(market.pe),
    eps: num(market.eps),
    marketCap: num(market.marketCap),
    tradedVolume: num(market.tradedVolume),
    tradedValue: num(market.tradedValue),
    netMoneyFlow: num(market.netMoneyFlow),
    realMoneyFlow: num(market.realMoneyFlow),
    legalMoneyFlow: num(market.legalMoneyFlow),
    dataQuality: result.dataQuality || null,
    fetchedAt: result.fetchedAt || null,
    history,
    comparisonQuality: {
      score: qualityScore,
      level: qualityLevel,
      fieldCoverage: Math.round(fieldCoverage * 100),
      historyCoverage: Math.round(historyCoverage * 100),
      availableFields,
      totalFields: qualityFields.length,
      historyPoints: history.length,
      deterministicReady: quality.deterministicReady !== false,
    },
  };
}

function compareMetric(rows, key, direction) {
  const valid = rows.filter(row => num(row[key]) !== null);
  if (!valid.length) return null;
  const values = valid.map(row => num(row[key]));
  const best = direction === 'desc' ? Math.max(...values) : Math.min(...values);
  return valid.find(row => num(row[key]) === best)?.symbol || null;
}

async function compareStocksDeterministic(params = {}) {
  const symbols = Array.from(new Set((Array.isArray(params.symbols) ? params.symbols : []).map(s => String(s || '').trim().toUpperCase()).filter(Boolean)));
  if (symbols.length < 2) throw Object.assign(new Error('حداقل دو نماد برای مقایسه لازم است.'), { statusCode: 400, code: 'COMPARE_SYMBOLS_REQUIRED' });
  if (symbols.length > 5) throw Object.assign(new Error('حداکثر پنج نماد را می‌توان همزمان مقایسه کرد.'), { statusCode: 400, code: 'COMPARE_SYMBOLS_LIMIT' });

  const historyCount = Math.max(50, Math.min(500, Number(params.historyCount ?? params.dailyCount ?? 120)));
  const results = await Promise.all(symbols.map(async symbol => {
    try {
      return { symbol, result: await analyzeStock({ symbol, historyCount, lookback: params.lookback, rsiPeriod: params.rsiPeriod }) };
    } catch (error) {
      return { symbol, error: { message: error.message || 'داده کافی برای تحلیل این نماد در دسترس نیست.', code: error.code || 'COMPARE_SYMBOL_ERROR', dataQuality: error.dataQuality || null } };
    }
  }));

  const rows = results.filter(item => item.result).map(item => buildComparable(item.result));
  const failed = results.filter(item => item.error).map(item => ({ symbol: item.symbol, ...item.error }));
  if (rows.length < 2) throw Object.assign(new Error('برای حداقل دو نماد، داده معتبر مقایسه‌ای در دسترس نیست.'), { statusCode: 422, code: 'COMPARE_INSUFFICIENT_DATA', failed });

  const qualityValues = rows.map(row => row.comparisonQuality?.score).filter(value => Number.isFinite(Number(value)));
  const averageQualityScore = qualityValues.length
    ? Math.round(qualityValues.reduce((sum, value) => sum + Number(value), 0) / qualityValues.length)
    : null;
  const consistency = qualityValues.length >= 2
    ? Math.round((Math.min(...qualityValues) / Math.max(...qualityValues || [1])) * 100)
    : null;
  const metrics = {
    highestTechnicalScore: compareMetric(rows, 'technicalScore', 'desc'),
    highestFundamentalScore: compareMetric(rows, 'fundamentalScore', 'desc'),
    highestDailyChange: compareMetric(rows, 'priceChangePercent', 'desc'),
    strongestMoneyFlow: compareMetric(rows, 'netMoneyFlow', 'desc'),
    lowestPE: compareMetric(rows, 'pe', 'asc'),
    highestMarketCap: compareMetric(rows, 'marketCap', 'desc'),
    averageDataQuality: averageQualityScore,
    comparisonConsistency: consistency,
  };

  const validTechnical = rows.filter(row => row.technicalScore !== null);
  const ranking = [...validTechnical].sort((a, b) => (b.technicalScore ?? -Infinity) - (a.technicalScore ?? -Infinity)).map((row, index) => ({
    rank: index + 1,
    symbol: row.symbol,
    technicalScore: row.technicalScore,
    fundamentalScore: row.fundamentalScore,
    recommendation: row.recommendation,
    trend: row.trend,
    riskLevel: row.riskLevel,
  }));

  return {
    success: true,
    deterministic: true,
    engine: { name: 'deterministic-stock-comparison', version: '1.2.0', deterministic: true },
    symbols,
    rows,
    ranking,
    metrics,
    failed,
    comparedAt: new Date().toISOString(),
  };
}

module.exports = { compareStocksDeterministic };
