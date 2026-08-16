"use strict";

module.exports = {
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
       RISK (Canonical – Engine)
    ========================= */
    risk_level: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH"],
    },

    /* =========================
       CONFIDENCE
    ========================= */
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
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
          items: { type: "string", minLength: 1 },
        },
        confirmations: {
          type: "array",
          default: [],
          items: { type: "string", minLength: 1 },
        },
        penalties: {
          type: "array",
          default: [],
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
      type: "object",
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
