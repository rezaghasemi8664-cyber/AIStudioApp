'use strict';

const ONTOLOGY_VERSION = '1.0.0';

function semanticFallback(reason = 'validation_failed', overrides = {}) {
  return {
    summary:
      'به دلیل نقص در اعتبارسنجی یا کیفیت داده، تحلیل در حالت fallback تولید شده و برای تصمیم معاملاتی قطعی مناسب نیست.',
    signals: [],
    risk_level: 'high',
    confidence: 0,
    ontology_version: ONTOLOGY_VERSION,

    fundamentalScore: 0,
    technicalScore: 0,

    moneyFlow: {
      inflow: 0,
      outflow: 0,
      net: 0,
      buy: 0,
      sell: 0
    },

    tradedVolume: 0,
    closingPrice: 0,

    entryPoints: [],
    exitPoints: [],

    detailedFundamentalExplanation:
      'داده بنیادی معتبر برای تولید توضیح تحلیلی کامل در دسترس نبود.',
    detailedTechnicalExplanation:
      'داده تکنیکال معتبر برای تولید توضیح تحلیلی کامل در دسترس نبود.',

    longTermTrend: 'sideways',
    shortTermTrend: 'sideways',
    sentiment: 'neutral',
    recommendation: 'HOLD',

    fallback: true,
    fallback_reason: reason,
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'ai_fallback_factory'
    },

    ...overrides
  };
}

module.exports = {
  ONTOLOGY_VERSION,
  semanticFallback
};
