"use strict";

const riskRules = require("./rules/risk.rules.cjs");
const trendRules = require("./rules/trend.rules.cjs");
const liquidityRules = require("./rules/liquidity.rules.cjs");

module.exports.run = (ctx, aiResult) => {
  const findings = [];

  try {
    // ????? ???? ????? ??? (false positive ????)
    findings.push(...liquidityRules(ctx, aiResult));
    findings.push(...riskRules(ctx, aiResult));
    findings.push(...trendRules(ctx, aiResult));
  } catch (err) {
    findings.push({
      rule: "ENGINE_ERROR",
      penalty: -0.1, // ? Penalty ???? ???? ?? V1
      reason: err.message,
    });
  }

  return findings;
};
