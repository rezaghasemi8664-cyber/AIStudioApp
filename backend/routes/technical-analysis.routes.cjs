'use strict';

var express = require('express');
var provider = require('../services/analysis-data.provider.cjs');
var technical = require('../services/technical-analysis.v11.service.cjs');

var router = express.Router();

// Deterministic technical analysis endpoint.
// The core engine is now v1.1.x; the previous v1.0 engine remains available as a rollback artifact.
router.get('/symbol/:symbol', async function (req, res) {
  try {
    var symbol = String(req.params.symbol || '').trim();
    var historyCount = req.query.historyCount;
    var lookback = req.query.lookback;
    var rsiPeriod = req.query.rsiPeriod;

    var data = await provider.getMarketData(symbol, { historyCount: historyCount });
    var quality = data.dataQuality || {};

    if (!quality.deterministicReady) {
      return res.status(422).json({
        success: false,
        code: 'INSUFFICIENT_VALID_HISTORY',
        message: 'تاریخچه معتبر برای تحلیل تکنیکال کافی نیست.',
        symbol: data.symbol,
        dataQuality: quality,
        source: data.sources,
        fetchedAt: data.fetchedAt
      });
    }

    var result = technical.analyze(data.candles, {
      lookback: lookback,
      rsiPeriod: rsiPeriod
    });

    return res.json({
      success: !!result.success,
      data: {
        symbol: data.symbol,
        analysis: result,
        dataQuality: quality,
        source: data.sources,
        fetchedAt: data.fetchedAt,
        engine: {
          name: 'deterministic-technical-analysis',
          version: result.version || '1.1.1',
          deterministic: true
        }
      }
    });
  } catch (error) {
    console.error('[TECHNICAL-ANALYSIS] error:', error.message);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Deterministic technical analysis failed'
    });
  }
});

module.exports = router;
