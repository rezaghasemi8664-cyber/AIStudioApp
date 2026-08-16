"use strict";

/**
 * ???? 1.1: ????? ???? ??????? false positive ????
 */
module.exports = (ctx, aiResult) => {
  const findings = [];

  const { ma20, ma50, close_price } = ctx.indicators || {};

  if (!ma20 || !ma50 || !close_price) return findings;

  const distance = Math.abs(ma20 - ma50) / ma50;

  if (close_price > ma20 && ma20 > ma50 && distance > 0.01) {
    findings.push({
      rule: "UPTREND_STRONG",
      confirmation: "trend",
      weight: 0.15,
      reason: "Stable bullish MA separation",
    });
  }

  if (close_price < ma50) {
    findings.push({
      rule: "STRUCTURAL_WEAKNESS",
      penalty: -0.25,
      reason: "Price below MA50 (trend invalidated)",
    });
  }

  return findings;
};
