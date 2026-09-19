"use strict";

const { RISK } = require("../../rule.types.cjs");

module.exports = (ctx, aiResult) => {
  const findings = [];

  if (ctx.indicators?.rsi > 75) {
    findings.push({
      rule: "RSI_OVERBOUGHT_STRONG",
      type: "RISK_OVERRIDE",
      value: RISK.HIGH,
      severe: true,
      reason: "RSI above 75",
    });
  } else if (ctx.indicators?.rsi > 70) {
    findings.push({
      rule: "RSI_WARN",
      penalty: -0.1,
      reason: "RSI moderately high",
    });
  }

  return findings;
};
