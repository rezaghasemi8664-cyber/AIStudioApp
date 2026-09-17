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
    const result = await sharedBrsService.getSymbolData(symbol);
    const data = result?.data || result || {};
    return res.json({ success: true, data: calculateSmartScore(data), symbol, source: 'brs' });
  } catch (error) {
    return res.status(502).json({ success: false, message: error?.message || 'دریافت امتیاز هوشمند ناموفق بود.' });
  }
});

module.exports = router;
