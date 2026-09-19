'use strict';

module.exports = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'BRS Market Analysis Output',
  type: 'object',
  additionalProperties: false,

  // فیلدهای واقعاً ضروری برای خروجی AI
  required: ['summary', 'signals', 'risk_level', 'confidence', 'ontology_version'],

  properties: {
    summary: {
      type: 'string',
      minLength: 10
    },

    signals: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'strength', 'description'],
        properties: {
          type: {
            type: 'string',
            enum: ['trend', 'volume', 'money_flow', 'order_book', 'index']
          },
          strength: {
            type: 'number',
            minimum: 0,
            maximum: 100
          },
          description: {
            type: 'string',
            minLength: 5
          }
        }
      }
    },

    risk_level: {
      type: 'string',
      enum: ['low', 'medium', 'high']
    },

    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 100
    },

    // هم نسخه قدیمی را بپذیر، هم نسخه جدید سیستم
    ontology_version: {
      type: 'string',
      enum: ['1.0.0', 'IRAN_V1', 'IRAN_V1.1']
    },

    // -------- اختیاری‌ها (برای سازگاری با خروجی‌های متنوع مدل) --------
    recommendation: {
      type: 'string',
      enum: ['BUY', 'SELL', 'HOLD']
    },

    fallback: {
      type: 'boolean'
    },

    fallback_reason: {
      anyOf: [
        { type: 'string', minLength: 3 },
        { type: 'null' }
      ]
    },

    closingPrice: {
      type: 'number'
    },

    realMoneyFlow: {
      type: 'number'
    },

    legalMoneyFlow: {
      type: 'number'
    },

    tradedVolume: {
      type: 'number'
    },

    marketMetrics: {
      type: 'object',
      additionalProperties: true,
      properties: {
        pe: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        eps: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        marketCap: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        priceChangePercent: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        tradedValue: { anyOf: [{ type: 'number' }, { type: 'null' }] }
      }
    },

    fundamentalScore: {
      type: 'number',
      minimum: 0,
      maximum: 100
    },

    technicalScore: {
      type: 'number',
      minimum: 0,
      maximum: 100
    },

    entryPoints: {
      type: 'array',
      minItems: 1,
      items: { type: 'number' }
    },

    exitPoints: {
      type: 'array',
      minItems: 1,
      items: { type: 'number' }
    },

    detailedFundamentalExplanation: {
      type: 'string',
      minLength: 10
    },

    detailedTechnicalExplanation: {
      type: 'string',
      minLength: 10
    },

    // برای سازگاری با marketSummary/service‌هایی که scores می‌خواهند
    scores: {
      type: 'object',
      additionalProperties: true,
      properties: {
        fundamentalScore: {
          type: 'number',
          minimum: 0,
          maximum: 100
        },
        technicalScore: {
          type: 'number',
          minimum: 0,
          maximum: 100
        }
      }
    },

    meta: {
      type: 'object',
      additionalProperties: true
    }
  }
};
