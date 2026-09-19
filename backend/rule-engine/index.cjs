"use strict";

const regimeRules = require("./rules/regime.rules.cjs");
const trendRules = require("./rules/trend.rules.cjs");
const riskRules = require("./rules/risk.rules.cjs");
const liquidityRules = require("./rules/liquidity.rules.cjs");

const contextBuilder = require("./context.builder.cjs");
const { finalize } = require("./finalizer.cjs");

/* =========================
   Rule Engine – IRAN V1
========================= */

module.exports.run = ({ raw, ai, options = {} }) => {
  /* =========================
     1. Build Deterministic Context (NaN-Safe)
  ========================= */
  const context = contextBuilder.build({
    raw,
    ai,
    options,
  });

  const findings = [];

  /* =========================
     2. Execute Rule Sets (Fail-Soft)
  ========================= */
  const ruleSets = [
    regimeRules,
    trendRules,
    riskRules,
    liquidityRules,
  ];

  for (const ruleSet of ruleSets) {
    if (typeof ruleSet !== "function") continue;

    let result;
    try {
      result = ruleSet(context);
    } catch (err) {
      findings.push({
        type: "RULE_ERROR",
        rule: ruleSet.name || "anonymous_rule",
        reason: err?.message || "rule_execution_failed",
        penalty: -0.15,
      });
      continue;
    }

    /* ---- Contract enforcement ---- */
    if (Array.isArray(result)) {
      findings.push(...result);
    } else {
      // Rule returned invalid shape ? deterministic penalty
      findings.push({
        type: "RULE_ERROR",
        rule: ruleSet.name || "anonymous_rule",
        reason: "invalid_rule_return",
        penalty: -0.05,
      });
    }
  }

  /* =========================
     3. Final Decision (Pure)
  ========================= */
  const finalized = finalize(context, findings, ai);

  /* =========================
     4. Engine-Level Meta Injection (Versioned)
  ========================= */
  finalized.meta = {
    ...(finalized.meta || {}),
    rule_engine: "IRAN_V1",
  };

  return finalized;
};
