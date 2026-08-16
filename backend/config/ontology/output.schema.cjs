'use strict';

module.exports = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'BRS Market Analysis Output',
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'signals',
    'risk_level',
    'confidence',
    'ontology_version',
    'recommendation',
    'closingPrice',
    'realMoneyFlow',
    'legalMoneyFlow',
    'tradedVolume',
    'fundamentalScore',
    'technicalScore',
    'entryPoints',
    'exitPoints',
    'detailedFundamentalExplanation',
    'detailedTechnicalExplanation'
  ],
  properties: {
    summary: {
      type: 'string',
      minLength: 10
    },
    signals: {
      type: 'array',
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
    ontology_version: {
      type: 'string',
      enum: ['1.0.0']
    },
    recommendation: {
      type: 'string',
      enum: ['BUY', 'SELL', 'HOLD']
    },
    fallback: {
      type: 'boolean'
    },
    fallback_reason: {
      type: ['string', 'null'],
      minLength: 3
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
    // اضافه شده برای پشتیبانی از متریک‌های جدید
    marketMetrics: {
      type: 'object',
      additionalProperties: true,
      properties: {
        pe: { type: ['number', 'null'] },
        eps: { type: ['number', 'null'] },
        marketCap: { type: ['number', 'null'] },
        priceChangePercent: { type: ['number', 'null'] },
        tradedValue: { type: ['number', 'null'] }
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
      items: {
        type: 'number'
      }
    },
    exitPoints: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'number'
      }
    },
    detailedFundamentalExplanation: {
      type: 'string',
      minLength: 10
    },
    detailedTechnicalExplanation: {
      type: 'string',
      minLength: 10
    },
    meta: {
      type: 'object',
      additionalProperties: true
    }
  }
};
