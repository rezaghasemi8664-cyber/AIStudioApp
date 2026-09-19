"use strict";

/* =========================
   Rule Sets (IDENTICAL to V1)
========================= */
const regimeRules = require("./rules/regime.rules.cjs");
const trendRules = require("./rules/trend.rules.cjs");
const riskRules = require("./rules/risk.rules.cjs");
const liquidityRules = require("./rules/liquidity.rules.cjs");

/* =========================
   Core Helpers (IDENTICAL to V1)
========================= */
const contextBuilder = require("./context.builder.cjs");
const { finalize } = require("./finalizer.cjs");

/* =========================
   IRAN V1.1 Parameters
========================= */
const CALIBRATION_FACTOR = 0.95; // non-inflationary
const FAILURE_PENALTY = -0.15;
const INVALID_RETURN_PENALTY = -0.05;

/* =========================
   Rule Engine – IRAN V1.1
========================= */

module.exports.run = ({ raw, ai, options = {} }) => {
  /* =========================
     1. Build Deterministic Context
  ========================= */
  const context = contextBuilder.build({
    raw,
    ai,
    options,
  });

  const findings = [];

  /* =========================
     2. Execute Rule Sets (Fail-Soft)
     (same order & wiring as V1)
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
        penalty: FAILURE_PENALTY,
      });
      continue;
    }

    /* ---- Contract enforcement ---- */
    if (Array.isArray(result)) {
      findings.push(...result);
    } else {
      findings.push({
        type: "RULE_ERROR",
        rule: ruleSet.name || "anonymous_rule",
        reason: "invalid_rule_return",
        penalty: INVALID_RETURN_PENALTY,
      });
    }
  }

  /* =========================
     3. Finalization (Pure)
  ========================= */
  const finalized = finalize(context, findings, ai);

  /* =========================
     4. V1.1 Confidence Calibration
     (AFTER finalizer – critical)
  ========================= */
  if (typeof finalized.confidence === "number") {
    finalized.confidence = Math.min(
      Math.max(finalized.confidence * CALIBRATION_FACTOR, 0),
      1
    );
  }

  /* =========================
     5. Engine Meta Injection
  ========================= */
  finalized.meta = {
    ...(finalized.meta || {}),
    rule_engine: "IRAN_V1.1",
  };

  return finalized;
};
