"use strict";

const Ajv = require("ajv");
const { finalize } = require("../finalizer.cjs");
const schema = require("../../schemas/analysisOutput.schema.cjs");
const { RISK } = require("../rule.types.cjs");

/* =========================
   AJV (match production)
========================= */
const ajv = new Ajv({
  allErrors: true,
  strict: true,
  removeAdditional: false,
});

const validate = ajv.compile(schema);

describe("Rule Engine Finalizer", () => {
  const baseAI = {
    summary: "AI base summary for TSE stock",
    trend: "neutral",
    risk_level: RISK.LOW,
    confidence: 0.7,
    meta: {
      ontology_version: "1.0.0",
      rule_engine: "IRAN_V1", // ? REQUIRED BY SCHEMA
    },
  };

  test("applies penalties and clamps confidence", () => {
    const findings = [
      { rule: "LOW_VOLUME", penalty: -0.3, reason: "volume < avg" },
      { rule: "HIGH_SPREAD", penalty: -0.3, reason: "spread abnormal" },
    ];

    const result = finalize({}, findings, baseAI);

    expect(result.confidence).toBe(0.1); // 0.7 - 0.6
    expect(result.explanation.penalties.length).toBe(2);
  });

  test("risk override has priority over AI", () => {
    const findings = [
      {
        rule: "RSI_OVERBOUGHT",
        type: "RISK_OVERRIDE",
        severe: true,
        value: RISK.HIGH,
      },
    ];

    const result = finalize({}, findings, baseAI);

    expect(result.risk_level).toBe("HIGH");
    expect(result.explanation.overrides).toContain("RSI_OVERBOUGHT");
  });

  test("confidence never exceeds [0,1]", () => {
    const findings = [{ rule: "STRONG_TREND", penalty: 0.5 }];

    const result = finalize({}, findings, {
      ...baseAI,
      confidence: 0.9,
    });

    expect(result.confidence).toBe(1);
  });

  test("final output passes schema validation", () => {
    const result = finalize({}, [], baseAI);
    const valid = validate(result);

    if (!valid) {
      console.error("Schema validation errors:", validate.errors);
    }

    expect(valid).toBe(true);
  });
});
