exports.apply = (ctx) => {
  const findings = [];

  if (
    ctx.price.close > 0 &&
    ctx.volume.smartMoneyProxy < 0
  ) {
    findings.push({
      type: "WARNING",
      reason: "PRICE_UP_SMART_MONEY_OUT",
      penalty: 0.15,
    });
  }

  return findings;
};
