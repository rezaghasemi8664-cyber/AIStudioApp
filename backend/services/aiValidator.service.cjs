"use strict";

const Ajv = require("ajv");
const schema = require("../config/ontology/output.schema.cjs");

const ONTOLOGY_VERSION = "1.0.0";

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
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function normalizeRecommendation(value) {
  const raw = toText(value, "نگهداری").toLowerCase();

  if (["buy", "strong_buy", "خرید"].includes(raw)) return "خرید";
  if (["sell", "strong_sell", "فروش"].includes(raw)) return "فروش";
  return "نگهداری";
}

function normalizeRiskLevelFa(value) {
  const raw = toText(value, "زیاد").toLowerCase();

  if (["low", "کم"].includes(raw)) return "کم";
  if (["medium", "med", "متوسط"].includes(raw)) return "متوسط";
  return "زیاد";
}

function normalizeRiskLevelEn(value) {
  const raw = toText(value, "high").toLowerCase();

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

  return {
    inflow,
    outflow,
    net,
    buy,
    sell,
  };
}

function normalizeMoneyFlowTopLevel(value) {
  if (isObject(value)) {
    return normalizeMoneyFlowObject(value);
  }
  return toNumber(value, 0);
}

function normalizeTargets(value) {
  if (!isObject(value)) return undefined;

  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    const num = Number(raw);
    if (Number.isFinite(num)) {
      result[key] = num;
    }
  }

  return Object.keys(result).length ? result : undefined;
}

function normalizeSignals(
  value,
  fallbackEntryPoints,
  fallbackExitPoints,
  fallbackStopLoss,
  fallbackTargets
) {
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
  if (targets) {
    normalized.targets = targets;
  }

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
    explanations: {
      fundamental,
      technical,
      additional,
    },
  };
}

function normalizeCandle(item) {
  if (!isObject(item)) return null;

  const open = toNumber(
    firstDefined(item.open, item.o, item.openPrice, item.openingPrice),
    0
  );
  const high = toNumber(
    firstDefined(item.high, item.h, item.highPrice, item.maxPrice),
    0
  );
  const low = toNumber(
    firstDefined(item.low, item.l, item.lowPrice, item.minPrice),
    0
  );
  const close = toNumber(
    firstDefined(
      item.close,
      item.c,
      item.closingPrice,
      item.lastClosePrice,
      item.priceClose,
      item.pl,
      item.pc
    ),
    0
  );
  const volume = toNumber(
    firstDefined(item.volume, item.v, item.tradedVolume, item.totalVolume, item.qTotTran5J),
    0
  );
  const value = toNumber(
    firstDefined(item.value, item.tradeValue, item.tradedValue, item.qTotCap),
    0
  );
  const count = toNumber(
    firstDefined(item.count, item.tradeCount, item.transactions, item.zTotTran),
    0
  );
  const date = toText(
    firstDefined(item.date, item.d, item.tradeDate, item.jdate, item.gdate, item.insDate),
    ""
  );

  if (open <= 0 && high <= 0 && low <= 0 && close <= 0 && volume <= 0) {
    return null;
  }

  return {
    open,
    high,
    low,
    close,
    volume,
    value,
    count,
    date,
  };
}

function normalizeCandleSeries(value, fallback) {
  const source = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  return source.map(normalizeCandle).filter(Boolean);
}

function extractPriceHistory(output) {
  if (isObject(output.priceHistory)) return output.priceHistory;
  if (isObject(output.marketData) && isObject(output.marketData.priceHistory)) {
    return output.marketData.priceHistory;
  }
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

  const close = toNumber(
    firstDefined(
      source.close,
      source.closingPrice,
      normalizedMarketData.closingPrice,
      latest ? latest.close : 0
    ),
    0
  );

  const open = toNumber(
    firstDefined(source.open, source.openingPrice, latest ? latest.open : 0),
    0
  );

  const high = toNumber(
    firstDefined(source.high, source.maxPrice, latest ? latest.high : 0),
    0
  );

  const low = toNumber(
    firstDefined(source.low, source.minPrice, latest ? latest.low : 0),
    0
  );

  const volume = toNumber(
    firstDefined(
      source.volume,
      source.tradedVolume,
      normalizedMarketData.tradedVolume,
      latest ? latest.volume : 0
    ),
    0
  );

  const value = toNumber(
    firstDefined(source.value, source.tradedValue, latest ? latest.value : 0),
    0
  );

  const count = toNumber(
    firstDefined(source.count, source.tradeCount, latest ? latest.count : 0),
    0
  );

  const date = toText(
    firstDefined(source.date, latest ? latest.date : ""),
    ""
  );

  return {
    close,
    open,
    high,
    low,
    volume,
    value,
    count,
    date,
  };
}

function buildNormalizedMarketData(output, normalized, dailyCandles, weeklyCandles, dailySummary) {
  const source = isObject(output.marketData) ? output.marketData : {};

  const closingPrice = toNumber(
    firstDefined(
      source.closingPrice,
      source.lastClosePrice,
      normalized.closingPrice,
      dailySummary.close
    ),
    0
  );

  const tradedVolume = toNumber(
    firstDefined(
      source.tradedVolume,
      source.volume,
      normalized.tradedVolume,
      dailySummary.volume
    ),
    0
  );

  const volume = toNumber(
    firstDefined(source.volume, source.tradedVolume, normalized.volume, tradedVolume),
    0
  );

  return {
    lastClosePrice: toNumber(firstDefined(source.lastClosePrice, closingPrice), 0),
    closingPrice,
    tradedVolume,
    volume,
    realMoneyFlow: normalizeMoneyFlowObject(
      firstDefined(source.realMoneyFlow, normalized.realMoneyFlow)
    ),
    legalMoneyFlow: normalizeMoneyFlowObject(
      firstDefined(source.legalMoneyFlow, normalized.legalMoneyFlow)
    ),
    dailySummary,
    dailyCandles,
    weeklyCandles,
    priceHistory: {
      daily: dailyCandles,
      weekly: weeklyCandles,
    },
    _meta: isObject(source._meta) ? source._meta : {},
  };
}

function normalizeOutput(output) {
  if (!isObject(output)) {
    const error = new Error("AI_OUTPUT_INVALID_TYPE");
    error.code = "AI_OUTPUT_INVALID_TYPE";
    throw error;
  }

  const ontologyVersion = toText(
    output.ontology_version ||
      (isObject(output.meta) ? output.meta.ontology_version : ""),
    ONTOLOGY_VERSION
  );

  const recommendation = normalizeRecommendation(output.recommendation);
  const riskLevel = normalizeRiskLevelFa(output.riskLevel || output.risk_level);
  const risk_level = normalizeRiskLevelEn(output.risk_level || output.riskLevel);

  const entryPoints = normalizePricePoints(output.entryPoints);
  const exitPoints = normalizePricePoints(output.exitPoints);
  const targets = normalizeTargets(output.targets);
  const stopLoss = toNumber(output.stopLoss, 0);

  const { detailedFundamentalExplanation, detailedTechnicalExplanation, explanations } =
    normalizeExplanations(output);

  const normalized = {
    symbol: toText(output.symbol, "UNKNOWN"),
    summary: toText(
      output.summary,
      "خروجی مدل معتبر نبود و نیاز به fallback دارد."
    ),
    recommendation,
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

    realMoneyFlow: normalizeMoneyFlowTopLevel(output.realMoneyFlow),
    legalMoneyFlow: normalizeMoneyFlowTopLevel(output.legalMoneyFlow),
    realMoneyFlowBuy: toNumber(output.realMoneyFlowBuy, 0),
    realMoneyFlowSell: toNumber(output.realMoneyFlowSell, 0),
    legalMoneyFlowBuy: toNumber(output.legalMoneyFlowBuy, 0),
    legalMoneyFlowSell: toNumber(output.legalMoneyFlowSell, 0),

    fundamentalScore: clamp(
      output.fundamentalScore ||
        (isObject(output.scores) ? output.scores.fundamentalScore : 0),
      0,
      100,
      0
    ),
    technicalScore: clamp(
      output.technicalScore ||
        (isObject(output.scores) ? output.scores.technicalScore : 0),
      0,
      100,
      0
    ),

    entryPoints,
    exitPoints,
    stopLoss,

    detailedFundamentalExplanation,
    detailedTechnicalExplanation,
    explanations,

    analysisDate: toText(output.analysisDate, new Date().toISOString()),
    model: toText(output.model, "unknown"),
    usage: isObject(output.usage) ? output.usage : {},
    rawData: Array.isArray(output.rawData) ? output.rawData : [],

    ontology_version: ontologyVersion,
    fallback: Boolean(output.fallback),
    fallback_reason:
      output.fallback_reason == null
        ? null
        : toText(output.fallback_reason, "validation_failed"),

    meta: {
      ...(isObject(output.meta) ? output.meta : {}),
      ontology_version: ontologyVersion,
    },
  };

  if (targets) {
    normalized.targets = targets;
  }

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
  };

  const dailySummary = buildDailySummary(
    output,
    dailyCandles,
    normalizedMarketDataSeed
  );

  normalized.dailyCandles = dailyCandles;
  normalized.weeklyCandles = weeklyCandles;
  normalized.dailySummary = dailySummary;

  normalized.priceHistory = {
    daily: dailyCandles,
    weekly: weeklyCandles,
  };

  normalized.marketData = buildNormalizedMarketData(
    output,
    normalized,
    dailyCandles,
    weeklyCandles,
    dailySummary
  );

  normalized.closingPrice = toNumber(
    firstDefined(normalized.closingPrice, normalized.marketData.closingPrice, dailySummary.close),
    0
  );

  normalized.tradedVolume = toNumber(
    firstDefined(normalized.tradedVolume, normalized.marketData.tradedVolume, dailySummary.volume),
    0
  );

  normalized.volume = toNumber(
    firstDefined(normalized.volume, normalized.marketData.volume, normalized.tradedVolume),
    0
  );

  normalized.realMoneyFlow = isObject(normalized.realMoneyFlow)
    ? normalized.realMoneyFlow
    : normalizeMoneyFlowObject(
        isObject(normalized.marketData.realMoneyFlow)
          ? normalized.marketData.realMoneyFlow
          : {}
      );

  normalized.legalMoneyFlow = isObject(normalized.legalMoneyFlow)
    ? normalized.legalMoneyFlow
    : normalizeMoneyFlowObject(
        isObject(normalized.marketData.legalMoneyFlow)
          ? normalized.marketData.legalMoneyFlow
          : {}
      );

  normalized.realMoneyFlowBuy = toNumber(
    firstDefined(normalized.realMoneyFlowBuy, normalized.realMoneyFlow.buy),
    0
  );
  normalized.realMoneyFlowSell = toNumber(
    firstDefined(normalized.realMoneyFlowSell, normalized.realMoneyFlow.sell),
    0
  );
  normalized.legalMoneyFlowBuy = toNumber(
    firstDefined(normalized.legalMoneyFlowBuy, normalized.legalMoneyFlow.buy),
    0
  );
  normalized.legalMoneyFlowSell = toNumber(
    firstDefined(normalized.legalMoneyFlowSell, normalized.legalMoneyFlow.sell),
    0
  );

  if (isObject(output.scores)) {
    normalized.scores = {
      fundamentalScore: clamp(
        output.scores.fundamentalScore,
        0,
        100,
        normalized.fundamentalScore
      ),
      technicalScore: clamp(
        output.scores.technicalScore,
        0,
        100,
        normalized.technicalScore
      ),
    };
  } else {
    normalized.scores = {
      fundamentalScore: normalized.fundamentalScore,
      technicalScore: normalized.technicalScore,
    };
  }

  return normalized;
}

function validateAIOutput(output) {
  const normalized = normalizeOutput(output);
  const valid = validateSchema(normalized);

  if (!valid) {
    const error = new Error("AI_OUTPUT_SCHEMA_VALIDATION_FAILED");
    error.code = "AI_OUTPUT_SCHEMA_VALIDATION_FAILED";
    error.validationErrors = validateSchema.errors || [];
    error.output = normalized;
    throw error;
  }

  return normalized;
}

module.exports = {
  validateAIOutput,
  normalizeOutput,
};
