"use strict";

const { RISK } = require("./rule.types.cjs");

/* =========================
   Canonical Schema Enums
========================= */
const VALID_RISKS = ["LOW", "MEDIUM", "HIGH"];
const VALID_TRENDS = ["bullish", "bearish", "neutral"];

/* =========================
   Rule ? Schema Mapping
========================= */
const RISK_MAP = {
  [RISK.LOW]: "LOW",
  [RISK.MEDIUM]: "MEDIUM",
  [RISK.HIGH]: "HIGH",
};

const normalizeRisk = (value) => {
  if (VALID_RISKS.includes(value)) return value;
  if (RISK_MAP[value]) return RISK_MAP[value];
  return null;
};

module.exports.finalize = (ctx, findings, aiResult) => {
  /* =========================
     1. Base AI State
  ========================= */
  let confidence = Number(aiResult.confidence ?? 0);

  let risk = normalizeRisk(aiResult.risk_level) ?? "MEDIUM";

  let trend = VALID_TRENDS.includes(aiResult.trend)
    ? aiResult.trend
    : "neutral";

  const explanation = {
    overrides: [],
    penalties: [],
    confirmations: [],
  };

  /* =========================
     2. Apply Rule Findings
  ========================= */
  for (const f of findings) {
    /* ---- Penalties ---- */
    if (typeof f.penalty === "number") {
      confidence += f.penalty;
      explanation.penalties.push({
        rule: f.rule,
        effect: f.penalty,
        reason: f.reason || "rule_penalty",
      });
    }

    /* ---- Risk Override (Hard) ---- */
    if (f.type === "RISK_OVERRIDE" && f.severe === true) {
      const mapped = normalizeRisk(f.value);
      if (mapped) {
        risk = mapped;
        explanation.overrides.push(f.rule);
      }
    }

    /* ---- Trend Override ---- */
    if (f.type === "TREND_OVERRIDE" && f.severe === true) {
      if (VALID_TRENDS.includes(f.value)) {
        trend = f.value;
        explanation.overrides.push(f.rule);
      }
    }

    /* ---- Risk Floor ---- */
    if (f.type === "RISK_FLOOR") {
      if (
        normalizeRisk(f.min) === "MEDIUM" &&
        risk === "LOW"
      ) {
        risk = "MEDIUM";
        explanation.overrides.push(f.rule);
      }
    }

    /* ---- Confirmations ---- */
    if (f.confirm === true) {
      explanation.confirmations.push(f.rule);
    }
  }

  /* =========================
     3. Confidence Clamp
  ========================= */
  confidence = Math.min(Math.max(confidence, 0), 1);
  confidence = Math.round(confidence * 1000) / 1000;

  /* =========================
     4. Final Output
  ========================= */
  return {
    ...aiResult,
    risk_level: risk,
    trend,
    confidence,
    explanation,
    meta: {
      ...(aiResult.meta || {}),
      findings_count: findings.length,
    },
  };
};
