// backend/routes/brs.routes.cjs - v4.2 Complete
'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const sharedBrsService = require('../services/brs.service.cjs');

let authenticate;
try {
  const authMw = require('../middlewares/auth.middleware.cjs');
  authenticate = authMw.authenticate || authMw;
} catch (_e) {
  try {
    const authMw = require('../middlewares/authenticate.middleware.cjs');
    authenticate = authMw.authenticate || authMw;
  } catch (_e2) {
    authenticate = function (req, res, next) {
      if (!req.headers.authorization) return res.status(401).json({ success: false, message: 'Authentication required' });
      next();
    };
  }
}

const brsBaseUrl = process.env.BRS_API_URL || process.env.BRS_BASE_URL || 'http://localhost:8080';
const brsApiKey = process.env.BRS_API_KEY || '';
const brsTimeout = parseInt(process.env.BRS_TIMEOUT) || 15000;

async function checkBRSHealth() {
  try {
    const response = await axios.get(`${brsBaseUrl}/health`, { timeout: 5000 });
    return { available: true, status: response.status, data: response.data };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

async function callBRS(endpoint, params, method) {
  method = method || 'GET';
  try {
    const url = `${brsBaseUrl}${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };
    if (brsApiKey) headers['X-API-Key'] = brsApiKey;
    const config = { method, url, headers, timeout: brsTimeout };
    if (method === 'GET') config.params = params;
    else config.data = params;
    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.message, status: error.response ? error.response.status : null };
  }
}

router.get('/status', authenticate, async function (req, res) {
  try {
    const health = await checkBRSHealth();
    return res.json({ success: true, data: { service: 'BRS (سرویس بازار)', baseUrl: brsBaseUrl, available: health.available, status: health.available ? 'connected' : 'disconnected', details: health.available ? health.data : null, error: health.available ? null : health.error, hasApiKey: !!brsApiKey, timeout: brsTimeout, timestamp: new Date().toISOString() } });
  } catch (error) {
    console.error('[BRS] GET /status error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در بررسی وضعیت سرویس BRS', error: error.message });
  }
});

router.get('/symbols', authenticate, async function (req, res) {
  try {
    const search = req.query.search || req.query.q || '';
    const market = req.query.market || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const result = await callBRS('/api/symbols', { search, market, page, limit });
    if (result.success) return res.json({ success: true, data: result.data.data || result.data, source: 'brs' });
    return res.json({ success: true, data: [], pagination: { page, limit, total: 0 }, message: 'سرویس BRS در دسترس نیست', source: 'fallback' });
  } catch (error) {
    console.error('[BRS] GET /symbols error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در دریافت نمادها از BRS' });
  }
});

router.get('/symbol/:symbol', authenticate, async function (req, res) {
  try {
    const symbol = String(req.params.symbol || '').trim();
    if (!symbol) return res.status(400).json({ success: false, message: 'نام نماد الزامی است.' });
    if (!sharedBrsService || typeof sharedBrsService.getSymbolData !== 'function') return res.status(503).json({ success: false, message: 'سرویس بازار برای دریافت اطلاعات نماد در دسترس نیست.' });
    const result = await sharedBrsService.getSymbolData(symbol);
    const data = result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result;
    return res.json({ success: true, data: data || { symbol, available: false }, source: 'brs-service', cached: !!(result && result._cached) });
  } catch (error) {
    console.error('[BRS] GET /symbol/:symbol error:', error.message);
    return res.status(502).json({ success: false, message: `خطا در دریافت اطلاعات نماد «${req.params.symbol || ''}».` });
  }
});

router.get('/symbol/:symbol/history', authenticate, async function (req, res) {
  try {
    const symbol = String(req.params.symbol || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 60, 10), 365);
    if (!symbol) return res.status(400).json({ success: false, message: 'نام نماد الزامی است.' });
    const result = await sharedBrsService.getSymbolHistory(symbol, limit);
    return res.json({ success: true, data: Array.isArray(result?.data) ? result.data : [], meta: result?._meta || null, cached: !!result?._cached, source: 'brs-history' });
  } catch (error) {
    console.error('[BRS] GET /symbol/:symbol/history error:', error.message);
    return res.status(502).json({ success: false, message: `خطا در دریافت تاریخچه نماد «${req.params.symbol || ''}».` });
  }
});

router.get('/symbol/:symbol/candles', authenticate, async function (req, res) {
  try {
    const symbol = String(req.params.symbol || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 60, 10), 365);
    if (!symbol) return res.status(400).json({ success: false, message: 'نام نماد الزامی است.' });
    const result = await sharedBrsService.getAdjustedDailyCandlestick(symbol, limit);
    return res.json({ success: true, data: Array.isArray(result?.data) ? result.data : [], meta: result?._meta || null, cached: !!result?._cached, source: 'brs-candlestick' });
  } catch (error) {
    console.error('[BRS] GET /symbol/:symbol/candles error:', error.message);
    return res.status(502).json({ success: false, message: `خطا در دریافت نمودار نماد «${req.params.symbol || ''}».` });
  }
});

router.get('/market-data', authenticate, async function (req, res) {
  try {
    const result = await callBRS('/api/market-data', req.query);
    if (result.success) return res.json({ success: true, data: result.data, source: 'brs' });
    return res.json({ success: true, data: { available: false }, message: 'داده‌های بازار در دسترس نیست', source: 'fallback' });
  } catch (error) {
    console.error('[BRS] GET /market-data error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در دریافت داده‌های بازار' });
  }
});

router.post('/proxy', authenticate, async function (req, res) {
  try {
    const { endpoint, method, params } = req.body;
    if (!endpoint) return res.status(400).json({ success: false, message: 'endpoint الزامی است' });
    const result = await callBRS(endpoint, params || {}, method || 'GET');
    return res.json({ success: result.success, data: result.success ? result.data : null, error: result.success ? null : result.error, source: 'brs-proxy' });
  } catch (error) {
    console.error('[BRS] POST /proxy error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در ارتباط با BRS' });
  }
});

module.exports = router;
