"use strict";

/**
 * ???? 1.1: ????? ????? ? ??????? ???????
 */
module.exports = (ctx) => {
  const findings = [];

  const vr = ctx.indicators?.volume_ratio ?? 1;

  if (vr < 0.4) {
    findings.push({
      rule: "CRITICAL_LIQUIDITY_DROP",
      penalty: -0.35,
      reason: "Severe liquidity shortage",
    });
  } else if (vr < 0.8) {
    findings.push({
      rule: "LOW_LIQUIDITY_WARN",
      penalty: -0.15,
      reason: "Below average liquidity",
    });
  }

  if (vr > 3) {
    findings.push({
      rule: "ACCUMULATION_ACTIVITY",
      penalty: +0.08,
      reason: "Strong accumulation volume",
    });
  }

  return findings;
};
