"use strict";

/**
 * services/aiValidator.service.cjs
 * نسخه نهایی اصلاح‌شده:
 * - نرمال‌سازی کامل خروجی AI
 * - سازگاری ontology_version (IRAN_V1.1)
 * - پشتیبانی از خروجی‌های ناقص/ناهمگون
 * - Quality Gate عملیاتی
 * - Fail نکردن تحلیل در صورت summary معتبر (Schema Bypass)
 * - سازگاری recommendation فارسی/انگلیسی + recommendation_en
 */

const Ajv = require("ajv");
const schema = require("../config/ontology/output.schema.cjs");

const DEFAULT_ONTOLOGY_VERSION = process.env.ONTOLOGY_VERSION || "IRAN_V1.1";
const LOW_QUALITY_MIN_SUMMARY_LEN = Number(process.env.AI_MIN_SUMMARY_LEN || 40);

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  removeAdditional: false,
  useDefaults: false,
  coerceTypes: false,
});

const validateSchema = ajv.compile(schema);

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max, fallback = min) {
  const num = toNumber(value, fallback);
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function toText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

function firstDefined() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function normalizeOntologyVersion(value) {
  const raw = toText(value, DEFAULT_ONTOLOGY_VERSION)
    .replace(/\s+/g, "")
    .replace(/_/g, ".")
    .toUpperCase();

  if (["1.0.0", "IRAN.V1", "IRAN_V1", "V1"].includes(raw)) return "IRAN_V1.1";
  if (["IRAN.V1.1", "IRAN_V1.1", "V1.1"].includes(raw)) return "IRAN_V1.1";
  return DEFAULT_ONTOLOGY_VERSION;
}

function normalizeRecommendationFa(value) {
  const raw = toText(value, "نگهداری").toLowerCase();

  if (["buy", "strong_buy", "خرید", "buy_now", "long"].includes(raw)) return "خرید";
  if (["sell", "strong_sell", "فروش", "exit", "short"].includes(raw)) return "فروش";
  return "نگهداری";
}

function mapRecommendationEn(fa) {
  if (fa === "خرید") return "BUY";
  if (fa === "فروش") return "SELL";
  return "HOLD";
}

function normalizeRiskLevelFa(value) {
  const raw = toText(value, "متوسط").toLowerCase();
  if (["low", "کم"].includes(raw)) return "کم";
  if (["medium", "med", "متوسط"].includes(raw)) return "متوسط";
  return "زیاد";
}

function normalizeRiskLevelEn(value) {
  const raw = toText(value, "medium").toLowerCase();
  if (["low", "کم"].includes(raw)) return "low";
  if (["medium", "med", "متوسط"].includes(raw)) return "medium";
  return "high";
}

function normalizeSentiment(value) {
  const raw = toText(value, "خنثی").toLowerCase();
  if (["positive", "bullish", "مثبت"].includes(raw)) return "مثبت";
  if (["negative", "bearish", "منفی"].includes(raw)) return "منفی";
  return "خنثی";
}

function normalizeTrend(value) {
  const raw = toText(value, "خنثی").toLowerCase();
  if (["bullish", "up", "صعودی", "مثبت"].includes(raw)) return "صعودی";
  if (["bearish", "down", "نزولی", "منفی"].includes(raw)) return "نزولی";
  return "خنثی";
}

function normalizePricePoints(value) {
  if (!Array.isArray(value)) return [];

  const allObjects = value.every((item) => isObject(item));
  if (allObjects) {
    return value
      .map((item) => ({
        price: toNumber(item.price, NaN),
        reason: toText(item.reason, "نقطه تحلیلی"),
      }))
      .filter((item) => Number.isFinite(item.price));
  }

  return value
    .map((item) => toNumber(item, NaN))
    .filter((item) => Number.isFinite(item));
}

function normalizeMoneyFlowObject(value) {
  const source = isObject(value) ? value : {};
  const inflow = toNumber(firstDefined(source.inflow, source.buy), 0);
  const outflow = toNumber(firstDefined(source.outflow, source.sell), 0);
  const buy = toNumber(firstDefined(source.buy, source.inflow), inflow);
  const sell = toNumber(firstDefined(source.sell, source.outflow), outflow);
  const net = toNumber(firstDefined(source.net), inflow - outflow);

  return { inflow, outflow, net, buy, sell };
}

function normalizeMoneyFlowTopLevel(value) {
  if (isObject(value)) return normalizeMoneyFlowObject(value);
  return toNumber(value, 0);
}

function normalizeTargets(value) {
  if (!isObject(value)) return undefined;
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    const num = Number(raw);
    if (Number.isFinite(num)) result[key] = num;
  }
  return Object.keys(result).length ? result : undefined;
}

function normalizeSignals(value, fallbackEntryPoints, fallbackExitPoints, fallbackStopLoss, fallbackTargets) {
  if (Array.isArray(value)) return value;

  const source = isObject(value) ? value : {};
  const normalized = {
    entryPoints: normalizePricePoints(
      source.entryPoints !== undefined ? source.entryPoints : fallbackEntryPoints
    ),
    exitPoints: normalizePricePoints(
      source.exitPoints !== undefined ? source.exitPoints : fallbackExitPoints
    ),
    stopLoss: toNumber(
      source.stopLoss !== undefined ? source.stopLoss : fallbackStopLoss,
      0
    ),
    timeframe: toText(source.timeframe, "unknown"),
  };

  const targets = normalizeTargets(
    source.targets !== undefined ? source.targets : fallbackTargets
  );
  if (targets) normalized.targets = targets;

  return normalized;
}

function normalizeExplanations(output) {
  const explanations = isObject(output.explanations) ? output.explanations : {};

  const fundamental = toText(
    output.detailedFundamentalExplanation || explanations.fundamental,
    "توضیح بنیادی کافی در خروجی مدل وجود نداشت."
  );

  const technical = toText(
    output.detailedTechnicalExplanation || explanations.technical,
    "توضیح تکنیکال کافی در خروجی مدل وجود نداشت."
  );

  const additional = toText(explanations.additional, "generated");

  return {
    detailedFundamentalExplanation: fundamental,
    detailedTechnicalExplanation: technical,
    explanations: { fundamental, technical, additional },
  };
}

function normalizeCandle(item) {
  if (!isObject(item)) return null;

  const open = toNumber(firstDefined(item.open, item.o, item.openPrice, item.openingPrice), 0);
  const high = toNumber(firstDefined(item.high, item.h, item.highPrice, item.maxPrice), 0);
  const low = toNumber(firstDefined(item.low, item.l, item.lowPrice, item.minPrice), 0);
  const close = toNumber(
    firstDefined(item.close, item.c, item.closingPrice, item.lastClosePrice, item.priceClose, item.pl, item.pc),
    0
  );
  const volume = toNumber(firstDefined(item.volume, item.v, item.tradedVolume, item.totalVolume, item.qTotTran5J), 0);
  const value = toNumber(firstDefined(item.value, item.tradeValue, item.tradedValue, item.qTotCap), 0);
  const count = toNumber(firstDefined(item.count, item.tradeCount, item.transactions, item.zTotTran), 0);
  const date = toText(firstDefined(item.date, item.d, item.tradeDate, item.jdate, item.gdate, item.insDate), "");

  if (open <= 0 && high <= 0 && low <= 0 && close <= 0 && volume <= 0) return null;
  return { open, high, low, close, volume, value, count, date };
}

function normalizeCandleSeries(value, fallback) {
  const source = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  return source.map(normalizeCandle).filter(Boolean);
}

function extractPriceHistory(output) {
  if (isObject(output.priceHistory)) return output.priceHistory;
  if (isObject(output.marketData) && isObject(output.marketData.priceHistory)) return output.marketData.priceHistory;
  return {};
}

function extractDailyCandles(output) {
  const priceHistory = extractPriceHistory(output);
  return normalizeCandleSeries(
    firstDefined(
      output.dailyCandles,
      output.daily,
      priceHistory.daily,
      isObject(output.marketData) ? output.marketData.dailyCandles : undefined,
      isObject(output.marketData) ? output.marketData.daily : undefined
    ),
    []
  );
}

function extractWeeklyCandles(output) {
  const priceHistory = extractPriceHistory(output);
  return normalizeCandleSeries(
    firstDefined(
      output.weeklyCandles,
      output.weekly,
      priceHistory.weekly,
      isObject(output.marketData) ? output.marketData.weeklyCandles : undefined,
      isObject(output.marketData) ? output.marketData.weekly : undefined
    ),
    []
  );
}

function buildDailySummary(output, dailyCandles, normalizedMarketData) {
  const source =
    (isObject(output.dailySummary) && output.dailySummary) ||
    (isObject(output.marketData) && isObject(output.marketData.dailySummary) && output.marketData.dailySummary) ||
    {};

  const latest = dailyCandles.length > 0 ? dailyCandles[0] : null;

  const close = toNumber(firstDefined(source.close, source.closingPrice, normalizedMarketData.closingPrice, latest ? latest.close : 0), 0);
  const open = toNumber(firstDefined(source.open, source.openingPrice, latest ? latest.open : 0), 0);
  const high = toNumber(firstDefined(source.high, source.maxPrice, latest ? latest.high : 0), 0);
  const low = toNumber(firstDefined(source.low, source.minPrice, latest ? latest.low : 0), 0);
  const volume = toNumber(firstDefined(source.volume, source.tradedVolume, normalizedMarketData.tradedVolume, latest ? latest.volume : 0), 0);
  const value = toNumber(firstDefined(source.value, source.tradedValue, latest ? latest.value : 0), 0);
  const count = toNumber(firstDefined(source.count, source.tradeCount, latest ? latest.count : 0), 0);
  const date = toText(firstDefined(source.date, latest ? latest.date : ""), "");

  return { close, open, high, low, volume, value, count, date };
}

function buildNormalizedMarketData(output, normalized, dailyCandles, weeklyCandles, dailySummary) {
  const source = isObject(output.marketData) ? output.marketData : {};

  const closingPrice = toNumber(firstDefined(source.closingPrice, source.lastClosePrice, normalized.closingPrice, dailySummary.close), 0);
  const tradedVolume = toNumber(firstDefined(source.tradedVolume, source.volume, normalized.tradedVolume, dailySummary.volume), 0);
  const volume = toNumber(firstDefined(source.volume, source.tradedVolume, normalized.volume, tradedVolume), 0);

  return {
    lastClosePrice: toNumber(firstDefined(source.lastClosePrice, closingPrice), 0),
    closingPrice,
    tradedVolume,
    volume,
    moneyFlow: toNumber(firstDefined(source.moneyFlow, normalized.moneyFlow), 0),
    realMoneyFlow: normalizeMoneyFlowObject(firstDefined(source.realMoneyFlow, normalized.realMoneyFlow)),
    legalMoneyFlow: normalizeMoneyFlowObject(firstDefined(source.legalMoneyFlow, normalized.legalMoneyFlow)),
    dailySummary,
    dailyCandles,
    weeklyCandles,
    priceHistory: { daily: dailyCandles, weekly: weeklyCandles },
    _meta: isObject(source._meta) ? source._meta : {},
  };
}

function detectLowQuality(normalized) {
  const summary = toText(normalized.summary, "");
  const signals = Array.isArray(normalized.signals) ? normalized.signals : [];
  const md = isObject(normalized.marketData) ? normalized.marketData : {};
  const dailyCandles = Array.isArray(md.dailyCandles) ? md.dailyCandles : [];
  const weeklyCandles = Array.isArray(md.weeklyCandles) ? md.weeklyCandles : [];

  const closingPrice = toNumber(firstDefined(md.closingPrice, normalized.closingPrice), 0);
  const tradedVolume = toNumber(firstDefined(md.tradedVolume, normalized.tradedVolume), 0);
  const moneyFlow = toNumber(firstDefined(md.moneyFlow, normalized.moneyFlow), 0);

  const reasons = [];
  if (summary.length < LOW_QUALITY_MIN_SUMMARY_LEN) reasons.push("SUMMARY_TOO_SHORT");
  if (signals.length === 0) reasons.push("EMPTY_SIGNALS");
  if (!(closingPrice > 0)) reasons.push("MISSING_CLOSING_PRICE");
  if (!(tradedVolume > 0)) reasons.push("MISSING_TRADED_VOLUME");
  if (dailyCandles.length === 0 && weeklyCandles.length === 0) reasons.push("MISSING_CANDLES");
  if (moneyFlow === 0) reasons.push("ZERO_MONEY_FLOW");

  const lowQuality =
    summary.length < LOW_QUALITY_MIN_SUMMARY_LEN ||
    (signals.length === 0 && !(closingPrice > 0) && dailyCandles.length === 0 && weeklyCandles.length === 0);

  return { lowQuality, reasons };
}

function normalizeOutput(output) {
  if (!isObject(output)) {
    const error = new Error("AI_OUTPUT_INVALID_TYPE");
    error.code = "AI_OUTPUT_INVALID_TYPE";
    throw error;
  }

  const ontologyVersion = normalizeOntologyVersion(
    output.ontology_version || (isObject(output.meta) ? output.meta.ontology_version : "")
  );

  const recommendationFa = normalizeRecommendationFa(
    firstDefined(output.recommendation, output.action, output.signal)
  );
  const recommendationEn = mapRecommendationEn(recommendationFa);

  const riskLevel = normalizeRiskLevelFa(output.riskLevel || output.risk_level);
  const risk_level = normalizeRiskLevelEn(output.risk_level || output.riskLevel);

  const entryPoints = normalizePricePoints(output.entryPoints);
  const exitPoints = normalizePricePoints(output.exitPoints);
  const targets = normalizeTargets(output.targets);
  const stopLoss = toNumber(output.stopLoss, 0);

  const { detailedFundamentalExplanation, detailedTechnicalExplanation, explanations } = normalizeExplanations(output);

  const summaryText = toText(
    firstDefined(
      output.summary,
      output.content,
      output.analysisSummary,
      isObject(output.result) ? output.result.summary : undefined
    ),
    "خروجی مدل معتبر نبود و نیاز به fallback دارد."
  );

  const normalized = {
    symbol: toText(output.symbol, "UNKNOWN"),
    summary: summaryText,
    recommendation: recommendationFa,
    recommendation_en: recommendationEn,
    confidence: clamp(output.confidence, 0, 100, 0),
    riskLevel,
    risk_level,

    shortTermTrend: normalizeTrend(output.shortTermTrend),
    mediumTermTrend: normalizeTrend(output.mediumTermTrend),
    sentiment: normalizeSentiment(output.sentiment),

    closingPrice: toNumber(
      firstDefined(
        output.closingPrice,
        isObject(output.marketData) ? output.marketData.closingPrice : undefined,
        isObject(output.marketData) ? output.marketData.lastClosePrice : undefined
      ),
      0
    ),
    tradedVolume: toNumber(
      firstDefined(
        output.tradedVolume,
        isObject(output.marketData) ? output.marketData.tradedVolume : undefined,
        isObject(output.marketData) ? output.marketData.volume : undefined
      ),
      0
    ),
    volume: toNumber(
      firstDefined(
        output.volume,
        isObject(output.marketData) ? output.marketData.volume : undefined,
        isObject(output.marketData) ? output.marketData.tradedVolume : undefined
      ),
      0
    ),
    moneyFlow: toNumber(
      firstDefined(
        output.moneyFlow,
        isObject(output.marketData) ? output.marketData.moneyFlow : undefined
      ),
      0
    ),

    realMoneyFlow: normalizeMoneyFlowTopLevel(output.realMoneyFlow),
    legalMoneyFlow: normalizeMoneyFlowTopLevel(output.legalMoneyFlow),
    realMoneyFlowBuy: toNumber(output.realMoneyFlowBuy, 0),
    realMoneyFlowSell: toNumber(output.realMoneyFlowSell, 0),
    legalMoneyFlowBuy: toNumber(output.legalMoneyFlowBuy, 0),
    legalMoneyFlowSell: toNumber(output.legalMoneyFlowSell, 0),

    fundamentalScore: clamp(output.fundamentalScore || (isObject(output.scores) ? output.scores.fundamentalScore : 0), 0, 100, 0),
    technicalScore: clamp(output.technicalScore || (isObject(output.scores) ? output.scores.technicalScore : 0), 0, 100, 0),

    entryPoints,
    exitPoints,
    stopLoss,

    detailedFundamentalExplanation,
    detailedTechnicalExplanation,
    explanations,

    analysisDate: toText(output.analysisDate, new Date().toISOString()),
    model: toText(firstDefined(output.model, isObject(output.meta) ? output.meta.model : undefined), process.env.GAPGPT_MODEL || "gpt-4o-mini"),
    usage: isObject(output.usage) ? output.usage : {},
    rawData: Array.isArray(output.rawData) ? output.rawData : [],

    ontology_version: ontologyVersion,
    fallback: Boolean(output.fallback),
    fallback_reason: output.fallback_reason == null ? null : toText(output.fallback_reason, "validation_failed"),

    meta: {
      ...(isObject(output.meta) ? output.meta : {}),
      ontology_version: ontologyVersion,
    },
  };

  if (targets) normalized.targets = targets;

  normalized.signals = normalizeSignals(
    output.signals,
    normalized.entryPoints,
    normalized.exitPoints,
    normalized.stopLoss,
    normalized.targets
  );

  const dailyCandles = extractDailyCandles(output);
  const weeklyCandles = extractWeeklyCandles(output);

  const normalizedMarketDataSeed = {
    closingPrice: normalized.closingPrice,
    tradedVolume: normalized.tradedVolume,
    volume: normalized.volume,
    moneyFlow: normalized.moneyFlow,
  };

  const dailySummary = buildDailySummary(output, dailyCandles, normalizedMarketDataSeed);

  normalized.dailyCandles = dailyCandles;
  normalized.weeklyCandles = weeklyCandles;
  normalized.dailySummary = dailySummary;
  normalized.priceHistory = { daily: dailyCandles, weekly: weeklyCandles };

  normalized.marketData = buildNormalizedMarketData(
    output,
    normalized,
    dailyCandles,
    weeklyCandles,
    dailySummary
  );

  normalized.closingPrice = toNumber(firstDefined(normalized.closingPrice, normalized.marketData.closingPrice, dailySummary.close), 0);
  normalized.tradedVolume = toNumber(firstDefined(normalized.tradedVolume, normalized.marketData.tradedVolume, dailySummary.volume), 0);
  normalized.volume = toNumber(firstDefined(normalized.volume, normalized.marketData.volume, normalized.tradedVolume), 0);
  normalized.moneyFlow = toNumber(firstDefined(normalized.moneyFlow, normalized.marketData.moneyFlow), 0);

  normalized.realMoneyFlow = isObject(normalized.realMoneyFlow)
    ? normalized.realMoneyFlow
    : normalizeMoneyFlowObject(isObject(normalized.marketData.realMoneyFlow) ? normalized.marketData.realMoneyFlow : {});

  normalized.legalMoneyFlow = isObject(normalized.legalMoneyFlow)
    ? normalized.legalMoneyFlow
    : normalizeMoneyFlowObject(isObject(normalized.marketData.legalMoneyFlow) ? normalized.marketData.legalMoneyFlow : {});

  normalized.realMoneyFlowBuy = toNumber(firstDefined(normalized.realMoneyFlowBuy, normalized.realMoneyFlow.buy), 0);
  normalized.realMoneyFlowSell = toNumber(firstDefined(normalized.realMoneyFlowSell, normalized.realMoneyFlow.sell), 0);
  normalized.legalMoneyFlowBuy = toNumber(firstDefined(normalized.legalMoneyFlowBuy, normalized.legalMoneyFlow.buy), 0);
  normalized.legalMoneyFlowSell = toNumber(firstDefined(normalized.legalMoneyFlowSell, normalized.legalMoneyFlow.sell), 0);

  normalized.scores = isObject(output.scores)
    ? {
        fundamentalScore: clamp(output.scores.fundamentalScore, 0, 100, normalized.fundamentalScore),
        technicalScore: clamp(output.scores.technicalScore, 0, 100, normalized.technicalScore),
      }
    : {
        fundamentalScore: normalized.fundamentalScore,
        technicalScore: normalized.technicalScore,
      };

  const quality = detectLowQuality(normalized);
  normalized.meta = {
    ...normalized.meta,
    dataInsufficient: quality.lowQuality ? true : Boolean(normalized.meta.dataInsufficient),
    lowQuality: quality.lowQuality ? true : Boolean(normalized.meta.lowQuality),
    lowQualityReason:
      quality.lowQuality && quality.reasons.length
        ? quality.reasons.join("|")
        : normalized.meta.lowQualityReason || null,
  };

  if (quality.lowQuality) {
    normalized.quality = "low";
    if (!normalized.fallback_reason) normalized.fallback_reason = "LOW_ANALYSIS_QUALITY";
  } else {
    normalized.quality = normalized.quality || "ok";
  }

  return normalized;
}

function validateAIOutput(output) {
  const normalized = normalizeOutput(output);
  const valid = validateSchema(normalized);

  if (!valid) {
    const hasUsableSummary =
      typeof normalized.summary === "string" &&
      normalized.summary.trim().length >= 10;

    // سیاست عملیاتی: اگر summary قابل استفاده است، fail سخت نده؛ فقط علامت‌گذاری شود
    if (hasUsableSummary) {
      normalized.meta = {
        ...(isObject(normalized.meta) ? normalized.meta : {}),
        schemaValid: false,
        schemaValidationBypass: true,
        schemaErrors: validateSchema.errors || [],
      };
      if (!normalized.fallback_reason) normalized.fallback_reason = "SCHEMA_BYPASS_WITH_SUMMARY";
      return normalized;
    }

    const error = new Error("AI_OUTPUT_SCHEMA_VALIDATION_FAILED");
    error.code = "AI_OUTPUT_SCHEMA_VALIDATION_FAILED";
    error.validationErrors = validateSchema.errors || [];
    error.output = normalized;
    throw error;
  }

  normalized.meta = {
    ...(isObject(normalized.meta) ? normalized.meta : {}),
    schemaValid: true,
    schemaValidationBypass: false,
  };

  return normalized;
}

module.exports = {
  validateAIOutput,
  normalizeOutput,
  _detectLowQuality: detectLowQuality,
};
