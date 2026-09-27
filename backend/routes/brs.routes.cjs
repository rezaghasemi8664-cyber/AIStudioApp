// backend/routes/brs.routes.cjs
'use strict';

const express = require('express');
const router = express.Router();
const sharedBrsService = require('../services/brs.service.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');

function userAuth(req, res, next) {
  return typeof authMiddleware === 'function'
    ? authMiddleware(req, res, next)
    : next();
}

router.get('/status', userAuth, async function (req, res) {
  try {
    const available = !!process.env.BRS_API_KEY;
    return res.json({ success: true, data: { service: 'BRS', available, status: available ? 'configured' : 'disconnected', hasApiKey: available, timestamp: new Date().toISOString() } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'خطا در بررسی وضعیت سرویس BRS', error: error.message });
  }
});

router.get('/symbol/:symbol', userAuth, async function (req, res) {
  try {
    const symbol = String(req.params.symbol || '').trim();
    if (!symbol) return res.status(400).json({ success: false, message: 'نام نماد الزامی است.' });
    const result = await sharedBrsService.getSymbolData(symbol);
    const data = result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result;
    return res.json({ success: true, data: data || { symbol, available: false }, source: 'brs-service', cached: !!(result && result._cached) });
  } catch (error) {
    console.error('[BRS] GET /symbol/:symbol error:', error.message);
    return res.status(502).json({ success: false, message: `خطا در دریافت اطلاعات نماد «${req.params.symbol || ''}».` });
  }
});

router.get('/symbol/:symbol/history', userAuth, async function (req, res) {
  try {
    const symbol = String(req.params.symbol || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 10), 365);
    if (!symbol) return res.status(400).json({ success: false, message: 'نام نماد الزامی است.' });
    // Portfolio analytics needs real per-symbol daily history. Do not depend on MarketDaily;
    // the shared DB is not guaranteed to contain history for every portfolio symbol.
    const result = await sharedBrsService.getSymbolHistory(symbol, limit);
    const data = Array.isArray(result && result.data) ? result.data : [];
    return res.json({ success: true, data, total: data.length, meta: result && result._meta ? result._meta : null, cached: !!(result && result._cached), source: result && result._meta && result._meta.source ? result._meta.source : 'brs-history' });
  } catch (error) {
    console.error('[BRS] GET /symbol/:symbol/history error:', error.message);
    return res.status(502).json({ success: false, message: `خطا در دریافت تاریخچه نماد «${req.params.symbol || ''}».` });
  }
});

router.get('/symbol/:symbol/candles', userAuth, async function (req, res) {
  try {
    const symbol = String(req.params.symbol || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 10), 365);
    if (!symbol) return res.status(400).json({ success: false, message: 'نام نماد الزامی است.' });
    const result = await sharedBrsService.getAdjustedDailyCandlestick(symbol, limit);
    return res.json({ success: true, data: Array.isArray(result && result.data) ? result.data : [], meta: result && result._meta ? result._meta : null, cached: !!(result && result._cached), source: 'brs-candlestick' });
  } catch (error) {
    console.error('[BRS] GET /symbol/:symbol/candles error:', error.message);
    return res.status(502).json({ success: false, message: `خطا در دریافت کندل نماد «${req.params.symbol || ''}».` });
  }
});

module.exports = router;
