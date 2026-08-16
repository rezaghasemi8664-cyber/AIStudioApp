"use strict";

const { resolveEngine } = require("./resolveEngine.cjs");

module.exports.runRuleEngine = (ctx, aiResult) => {
  const version = resolveEngine(ctx.rule_engine);

  const engine = require(`./versions/${version}`);
  const findings = engine.run(ctx, aiResult);

  return { findings, version };
};
