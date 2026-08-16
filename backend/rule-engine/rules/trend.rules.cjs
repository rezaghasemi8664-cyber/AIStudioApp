const { TREND } = require("../rule.types.cjs");

exports.apply = (ctx) => {
  const findings = [];

  if (
    ctx.price.close < ctx.indicators.ema50 &&
    ctx.indicators.ema50 < ctx.indicators.ema200
  ) {
    findings.push({
      type: "TREND_OVERRIDE",
      value: TREND.BEARISH,
      reason: "BEARISH_EMA_STRUCTURE",
      severe: true,
    });
  }

  return findings;
};
