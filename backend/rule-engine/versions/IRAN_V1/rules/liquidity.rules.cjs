"use strict";

/**
 * ???? 1: ???? ?????????????
 */
module.exports = (ctx) => {
  const findings = [];

  const vr = ctx.indicators?.volume_ratio ?? 1;

  if (vr < 0.5) {
    findings.push({
      rule: "LOW_LIQUIDITY",
      penalty: -0.25,
      reason: "Volume ratio below 0.5",
    });
  }

  if (vr > 2.5) {
    findings.push({
      rule: "VOLUME_SPIKE",
      penalty: +0.05,
      reason: "Unusual high trading volume",
    });
  }

  return findings;
};
