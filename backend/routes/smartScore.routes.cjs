'use strict';

const express = require('express');
const authenticate = require('../middlewares/authenticate.middleware.cjs');
const sharedMarketService = require('../services/sharedMarket.service.cjs');
const { calculateSmartScore } = require('../services/smartScore.service.cjs');

const router = express.Router();

router.get('/symbol/:symbol', authenticate, async (req, res) => {
  try {
    const symbol = String(req.params.symbol || '').trim().toUpperCase();
    if (!symbol) return res.status(400).json({ success: false, message: 'نماد الزامی است.' });

    const [current, history] = await Promise.all([
      sharedMarketService.getSymbols({ symbol, limit: 1 }),
      sharedMarketService.getSymbolHistory(symbol, 365)
    ]);

    const currentRow = Array.isArray(current) ? current[0] : null;
    if (!currentRow) {
      return res.status(404).json({ success: false, message: 'اطلاعات نماد ' + symbol + ' در بازار موجود نیست.' });
    }

    let raw = {};
    if (currentRow.dataJson) {
      try { raw = JSON.parse(currentRow.dataJson) || {}; } catch (_) { raw = {}; }
    }

    const data = {
      ...raw,
      ...currentRow,
      lastPrice: currentRow.lastPrice,
      closePrice: currentRow.closePrice,
      lastChangePercent: currentRow.lastChangePercent,
      closeChangePercent: currentRow.closeChangePercent,
      volume: currentRow.volume,
      value: currentRow.value,
      high: raw.high ?? currentRow.high,
      low: raw.low ?? currentRow.low,
      realBuyVolume: currentRow.realBuyVolume,
      realSellVolume: currentRow.realSellVolume,
      realNetValue: Number(currentRow.realBuyVolume || 0) - Number(currentRow.realSellVolume || 0),
      realMoneyFlow: Number(currentRow.realBuyVolume || 0) - Number(currentRow.realSellVolume || 0)
    };

    const result = calculateSmartScore(data, Array.isArray(history) ? history : []);
    return res.json({
      success: true,
      data: result,
      symbol,
      source: 'shared-market-db',
      historyRecords: Array.isArray(history) ? history.length : 0
    });
  } catch (error) {
    console.error('[SMART SCORE] Failed for ' + req.params.symbol + ':', error);
    return res.status(502).json({
      success: false,
      message: error?.message || 'دریافت امتیاز هوشمند ناموفق بود.'
    });
  }
});

module.exports = router;
