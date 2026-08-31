'use strict';

const express = require('express');
const router = express.Router();

let authMiddleware = (req, res, next) => next();
try {
  const authModule = require('../middlewares/auth.middleware.cjs');
  authMiddleware = authModule.authenticate || authModule.authMiddleware || authModule.verifyToken || authMiddleware;
} catch (error) {
  console.warn('[ANALYZE-ROUTES] Auth middleware load warning:', error.message);
}

let ctrl = {};
try {
  ctrl = require('../controllers/analyze.controller.cjs');
} catch (error) {
  console.error('[ANALYZE-ROUTES] Controller load failed:', error.message);
}

router.post('/', authMiddleware, function (req, res) {
  if (typeof ctrl.analyze === 'function') return ctrl.analyze(req, res);
  if (typeof ctrl.analyzeStock === 'function') return ctrl.analyzeStock(req, res);
  return res.status(503).json({ success: false, message: 'سرویس تحلیل در دسترس نیست.', code: 'ANALYZE_SERVICE_UNAVAILABLE', requestId: req.requestId });
});

router.post('/stock', authMiddleware, function (req, res) {
  if (typeof ctrl.analyzeStock === 'function') return ctrl.analyzeStock(req, res);
  if (typeof ctrl.analyze === 'function') return ctrl.analyze(req, res);
  return res.status(503).json({ success: false, message: 'سرویس تحلیل سهم در دسترس نیست.', code: 'STOCK_ANALYSIS_UNAVAILABLE', requestId: req.requestId });
});

router.post('/compare', authMiddleware, function (req, res) {
  if (typeof ctrl.compareStocks === 'function') return ctrl.compareStocks(req, res);
  if (typeof ctrl.compare === 'function') return ctrl.compare(req, res);
  return res.status(503).json({ success: false, message: 'سرویس مقایسه در دسترس نیست.', messageEn: 'Compare service is not available.', code: 'COMPARE_SERVICE_UNAVAILABLE', requestId: req.requestId });
});

router.post('/chat', authMiddleware, function (req, res) {
  if (typeof ctrl.chat === 'function') return ctrl.chat(req, res);
  return res.status(503).json({ success: false, message: 'سرویس چت در دسترس نیست.', code: 'CHAT_SERVICE_UNAVAILABLE' });
});

router.post('/ask', authMiddleware, function (req, res) {
  if (typeof ctrl.ask === 'function') return ctrl.ask(req, res);
  if (typeof ctrl.chat === 'function') return ctrl.chat(req, res);
  return res.status(503).json({ success: false, message: 'سرویس پرسش در دسترس نیست.', code: 'ASK_SERVICE_UNAVAILABLE' });
});

router.get('/models', function (_req, res) {
  if (typeof ctrl.getModels === 'function') return ctrl.getModels(_req, res);
  return res.json({ success: true, data: [{ id: 'gpt-4o-mini', name: 'GPT-4o Mini' }, { id: 'gpt-4o', name: 'GPT-4o' }] });
});

router.get('/history', authMiddleware, function (req, res) {
  if (typeof ctrl.getAnalysisHistory === 'function') return ctrl.getAnalysisHistory(req, res);
  return res.json({ success: true, data: [] });
});

router.get('/status', function (_req, res) {
  const hasKey = !!(process.env.GAPGPT_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
  return res.json({ success: true, data: { available: hasKey, provider: hasKey ? 'GapGPT' : 'none', timestamp: new Date().toISOString() } });
});

module.exports = router;
console.log('[ANALYZE-ROUTES] Loaded successfully');
