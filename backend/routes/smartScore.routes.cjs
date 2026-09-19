'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const sharedBrsService = require('../services/sharedBrs.service.cjs');
const { calculateSmartScore } = require('../services/smartScore.service.cjs');

const router = express.Router();

router.get('/symbol/:symbol', authenticate, async (req, res) => {
  try {
    const symbol = String(req.params.symbol || '').trim().toUpperCase();
    if (!symbol) return res.status(400).json({ success: false, message: 'نماد الزامی است.' });

    const [currentResult, historyResult] = await Promise.all([
      sharedBrsService.getSymbolData(symbol),
      sharedBrsService.getSymbolHistory(symbol, 365)
    ]);

    const data = currentResult?.data || currentResult || {};
    const history = Array.isArray(historyResult?.data) ? historyResult.data : [];
    return res.json({ success: true, data: calculateSmartScore(data, history), symbol, source: 'brs', historyRecords: history.length });
  } catch (error) {
    return res.status(502).json({ success: false, message: error?.message || 'دریافت امتیاز هوشمند ناموفق بود.' });
  }
});

module.exports = router;
