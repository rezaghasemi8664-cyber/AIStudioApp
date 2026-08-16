exports.apply = (ctx) => {
  const findings = [];

  if (ctx.market.liquidityScore < 0.4) {
    findings.push({
      type: "RISK_OVERRIDE",
      value: "high",
      reason: "LOW_LIQUIDITY_SCORE",
      severe: true,
    });
  }

  return findings;
};
