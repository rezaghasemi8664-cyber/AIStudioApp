"use strict";

const { RISK } = require("../../rule.types.cjs");

module.exports = (ctx, aiResult) => {
  const findings = [];

  if (ctx.indicators?.rsi > 70) {
    findings.push({
      rule: "RSI_OVERBOUGHT",
      type: "RISK_OVERRIDE",
      value: RISK.HIGH,
      severe: true,
      reason: "RSI above 70",
    });
  }

  if (aiResult.confidence < 0.3) {
    findings.push({
      rule: "LOW_AI_CONFIDENCE",
      penalty: -0.15,
      reason: "AI confidence below threshold",
    });
  }

  return findings;
};
