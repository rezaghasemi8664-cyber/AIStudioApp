"use strict";

module.exports = (ctx, aiResult) => {
  const findings = [];

  const { ma20, ma50, close_price } = ctx.indicators || {};

  if (!ma20 || !ma50 || !close_price) return findings;

  if (close_price > ma20 && ma20 > ma50) {
    findings.push({
      rule: "UPTREND_CONFIRMED",
      confirmation: "trend",
      reason: "Price > MA20 > MA50",
    });
  }

  if (close_price < ma20 && ma20 < ma50) {
    findings.push({
      rule: "DOWNTREND_CONFIRMED",
      penalty: -0.2,
      reason: "Price < MA20 < MA50",
    });
  }

  return findings;
};
