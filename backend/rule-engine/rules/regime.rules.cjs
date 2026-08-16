const { REGIME } = require("../rule.types.cjs");

exports.apply = (ctx) => {
  const findings = [];

  if (
    ctx.indicators.atr < 0.5 &&
    ctx.volume.today < ctx.volume.avg30 * 0.7
  ) {
    findings.push({
      type: "REGIME",
      value: REGIME.LOW_LIQUIDITY,
      reason: "LOW_ATR_LOW_VOLUME",
      penalty: 0.2,
    });
  }

  return findings;
};
