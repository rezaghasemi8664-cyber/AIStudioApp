"use strict";

module.exports = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,

  required: [
    "meta",
    "summary",
    "risk_level",
    "confidence",
    "explanation",
    "trend",
  ],

  properties: {
    /* =========================
       META (ENGINE OWNED)
    ========================= */
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["ontology_version", "rule_engine"],
      properties: {
        ontology_version: {
          type: "string",
          const: "1.0.0",
        },
        rule_engine: {
          type: "string",
          enum: ["IRAN_V1", "IRAN_V1.1"],
        },
        findings_count: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
      },
    },

    /* =========================
       SUMMARY (Human-Readable)
    ========================= */
    summary: {
      type: "string",
      minLength: 10,
    },

    /* =========================
       TREND (Market Direction)
    ========================= */
    trend: {
      type: "string",
      enum: ["bullish", "bearish", "neutral"],
    },

    /* =========================
       RISK (Canonical Engine)
       NOTE: aligned with prompt/output contract
    ========================= */
    risk_level: {
      type: "string",
      enum: ["low", "medium", "high"],
    },

    /* =========================
       CONFIDENCE
       NOTE: aligned with prompt/output contract (0..100)
    ========================= */
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 100,
    },

    /* =========================
       EXPLAINABILITY (AUDIT CORE)
    ========================= */
    explanation: {
      type: "object",
      additionalProperties: false,
      required: ["overrides", "penalties", "confirmations"],
      properties: {
        overrides: {
          type: "array",
          default: [],
          minItems: 0,
          items: { type: "string", minLength: 1 },
        },
        confirmations: {
          type: "array",
          default: [],
          minItems: 0,
          items: { type: "string", minLength: 1 },
        },
        penalties: {
          type: "array",
          default: [],
          minItems: 0,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["rule", "effect", "reason"],
            properties: {
              rule: { type: "string", minLength: 1 },
              effect: { type: "number" },
              reason: { type: "string", minLength: 1 },
            },
          },
        },
      },
    },

    /* =========================
       OPTIONAL MARKET METRICS
       (for downstream compatibility)
    ========================= */
    marketMetrics: {
      type: ["object", "null"],
      additionalProperties: true,
      properties: {
        pe: { type: ["number", "null"] },
        eps: { type: ["number", "null"] },
        marketCap: { type: ["number", "null"] },
        priceChangePercent: { type: ["number", "null"] },
        tradedValue: { type: ["number", "null"] },

        realMoneyFlow: { type: ["number", "null"] },
        legalMoneyFlow: { type: ["number", "null"] },

        highPrice: { type: ["number", "null"] },
        lowPrice: { type: ["number", "null"] },
        averagePrice: { type: ["number", "null"] },
        lastPrice: { type: ["number", "null"] },

        realMoneyFlowBreakdown: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            inflow: { type: ["number", "null"] },
            outflow: { type: ["number", "null"] },
            net: { type: ["number", "null"] },
          },
        },

        legalMoneyFlowBreakdown: {
          type: ["object", "null"],
          additionalProperties: false,
          properties: {
            inflow: { type: ["number", "null"] },
            outflow: { type: ["number", "null"] },
            net: { type: ["number", "null"] },
          },
        },
      },
    },
  },
};
