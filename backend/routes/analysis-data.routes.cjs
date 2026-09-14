'use strict';

var express = require('express');
var provider = require('../services/analysis-data.provider.cjs');

var router = express.Router();

// Read-only diagnostic endpoint. It does not replace existing analysis routes.
router.get('/status', function (req, res) {
  res.json({ success: true, data: provider.getProviderStatus() });
});

router.get('/symbol/:symbol', async function (req, res) {
  try {
    var symbol = String(req.params.symbol || '').trim();
    var historyCount = req.query.historyCount;
    var data = await provider.getMarketData(symbol, { historyCount: historyCount });

    res.json({ success: true, data: data });
  } catch (error) {
    console.error('[ANALYSIS-DATA] provider error:', error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Analysis data provider failed'
    });
  }
});

module.exports = router;
