"use strict";

const pricePointSchema = {
  type: "object",
  additionalProperties: false,
  required: ["price", "reason"],
  properties: {
    price: { type: "number" },
    reason: { type: "string", minLength: 3 },
  },
};

const moneyFlowSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    inflow: { type: "number" },
    outflow: { type: "number" },
    net: { type: "number" },
    buy: { type: "number" },
    sell: { type: "number" },
  },
};

module.exports = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "BRS AI Analysis Output",
  type: "object",
  additionalProperties: false,

  required: [
    "symbol",
    "summary",
    "recommendation",
    "confidence",
  ],

  anyOf: [
    { required: ["riskLevel"] },
    { required: ["risk_level"] },
  ],

  properties: {
    meta: {
      type: "object",
      additionalProperties: false,
      required: ["ontology_version"],
      properties: {
        ontology_version: {
          type: "string",
          minLength: 1,
        },
      },
    },

    ontology_version: {
      type: "string",
      minLength: 1,
    },

    symbol: {
      type: "string",
      minLength: 1,
    },

    summary: {
      type: "string",
      minLength: 10,
    },

    recommendation: {
      type: "string",
      enum: ["خرید", "فروش", "نگهداری"],
    },

    riskLevel: {
      type: "string",
      enum: ["کم", "متوسط", "زیاد"],
    },

    risk_level: {
      type: "string",
      enum: ["low", "medium", "high"],
    },

    shortTermTrend: {
      type: "string",
      minLength: 2,
    },

    mediumTermTrend: {
      type: "string",
      minLength: 2,
    },

    sentiment: {
      type: "string",
      enum: ["مثبت", "منفی", "خنثی"],
    },

    confidence: {
      type: "number",
      minimum: 0,
      maximum: 100,
    },

    closingPrice: {
      type: "number",
    },

    tradedVolume: {
      type: "number",
    },

    volume: {
      type: "number",
    },

    realMoneyFlow: {
      anyOf: [
        { type: "number" },
        moneyFlowSchema,
      ],
    },

    legalMoneyFlow: {
      anyOf: [
        { type: "number" },
        moneyFlowSchema,
      ],
    },

    realMoneyFlowBuy: {
      type: "number",
    },

    realMoneyFlowSell: {
      type: "number",
    },

    legalMoneyFlowBuy: {
      type: "number",
    },

    legalMoneyFlowSell: {
      type: "number",
    },

    fundamentalScore: {
      type: "number",
      minimum: 0,
      maximum: 100,
    },

    technicalScore: {
      type: "number",
      minimum: 0,
      maximum: 100,
    },

    entryPoints: {
      anyOf: [
        {
          type: "array",
          items: { type: "number" },
        },
        {
          type: "array",
          items: pricePointSchema,
        },
      ],
    },

    exitPoints: {
      anyOf: [
        {
          type: "array",
          items: { type: "number" },
        },
        {
          type: "array",
          items: pricePointSchema,
        },
      ],
    },

    targets: {
      type: "object",
      minProperties: 1,
      additionalProperties: {
        type: "number",
      },
    },

    stopLoss: {
      type: "number",
    },

    signals: {
      type: "object",
      additionalProperties: false,
      properties: {
        entryPoints: {
          anyOf: [
            {
              type: "array",
              items: { type: "number" },
            },
            {
              type: "array",
              items: pricePointSchema,
            },
          ],
        },
        exitPoints: {
          anyOf: [
            {
              type: "array",
              items: { type: "number" },
            },
            {
              type: "array",
              items: pricePointSchema,
            },
          ],
        },
        stopLoss: {
          type: "number",
        },
        targets: {
          type: "object",
          minProperties: 1,
          additionalProperties: {
            type: "number",
          },
        },
        timeframe: {
          type: "string",
          minLength: 1,
        },
      },
    },

    detailedFundamentalExplanation: {
      type: "string",
      minLength: 10,
    },

    detailedTechnicalExplanation: {
      type: "string",
      minLength: 10,
    },

    explanations: {
      type: "object",
      additionalProperties: false,
      properties: {
        fundamental: {
          type: "string",
          minLength: 10,
        },
        technical: {
          type: "string",
          minLength: 10,
        },
        additional: {
          type: "string",
          minLength: 1,
        },
      },
    },

    marketData: {
      type: "object",
      additionalProperties: false,
      properties: {
        lastClosePrice: {
          type: "number",
        },
        closingPrice: {
          type: "number",
        },
        tradedVolume: {
          type: "number",
        },
        volume: {
          type: "number",
        },
        realMoneyFlow: moneyFlowSchema,
        legalMoneyFlow: moneyFlowSchema,
      },
    },

    scores: {
      type: "object",
      additionalProperties: false,
      properties: {
        fundamentalScore: {
          type: "number",
          minimum: 0,
          maximum: 100,
        },
        technicalScore: {
          type: "number",
          minimum: 0,
          maximum: 100,
        },
      },
    },

    analysisDate: {
      type: "string",
      minLength: 1,
    },

    model: {
      type: "string",
      minLength: 1,
    },

    usage: {
      type: "object",
      additionalProperties: true,
    },

    rawData: {
      type: "array",
      items: {},
    },

    priceHistory: {
      type: "object",
      additionalProperties: false,
      properties: {
        daily: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["date", "close"],
            properties: {
              date: { type: "string", minLength: 1 },
              close: { type: "number" },
            },
          },
        },
        weekly: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["date", "close"],
            properties: {
              date: { type: "string", minLength: 1 },
              close: { type: "number" },
            },
          },
        },
      },
    },
  },

  allOf: [
    {
      anyOf: [
        { required: ["detailedFundamentalExplanation"] },
        {
          required: ["explanations"],
          properties: {
            explanations: {
              required: ["fundamental"],
            },
          },
        },
      ],
    },
    {
      anyOf: [
        { required: ["detailedTechnicalExplanation"] },
        {
          required: ["explanations"],
          properties: {
            explanations: {
              required: ["technical"],
            },
          },
        },
      ],
    },
  ],
};
