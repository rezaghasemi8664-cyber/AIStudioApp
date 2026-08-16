exports.apply = (ctx) => {
  const findings = [];

  if (ctx.indicators.rsi14 >= 70) {
    findings.push({
      type: "RISK_FLOOR",
      min: "medium",
      reason: "RSI_OVERBOUGHT",
      penalty: 0.2,
    });
  }

  return findings;
};
