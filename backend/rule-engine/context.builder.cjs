"use strict";

/**
 * Deterministic, NaN-safe, Schema-locked Context Builder
 */
module.exports.build = ({ raw = [], ai = {} }) => {
  const safeArray = Array.isArray(raw) ? raw : [];

  const get = (endpoint) =>
    safeArray.find(r => r?.endpoint === endpoint)?.data ?? {};

  const num = (v, d = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : d;

  const bool = (v) =>
    v === true ? true : v === false ? false : null; // ? tri-state

  const clamp01 = (v) =>
    Math.min(1, Math.max(0, num(v, 0)));

  const price = get("price");
  const indicators = get("indicators");
  const volume = get("volume");
  const market = get("market");

  const ctx = {
    price: {
      close: num(price.close),
    },

    indicators: {
      rsi14: num(indicators.rsi14),
      ema50: num(indicators.ema50),
      ema200: num(indicators.ema200),
      atr: num(indicators.atr),
    },

    volume: {
      today: num(volume.today),
      avg30: num(volume.avg30),
      smartMoneyProxy: num(volume.smartMoneyProxy),
      volumeRatio:
        num(volume.avg30) > 0
          ? num(volume.today) / num(volume.avg30)
          : 1,
    },

    market: {
      hasBuyQueue: bool(market.hasBuyQueue),
      hasSellQueue: bool(market.hasSellQueue),
      liquidityScore: num(market.liquidityScore),
    },

    ai: {
      trend: typeof ai.trend === "string" ? ai.trend : "unknown",
      risk_level:
        typeof ai.risk_level === "string"
          ? ai.risk_level
          : "unknown",
      confidence: clamp01(ai.confidence),
    },
  };

  return Object.freeze(ctx); // ?? ABSOLUTE LOCK
};
