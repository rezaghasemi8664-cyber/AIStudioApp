// backend/routes/analyze.routes.cjs
// Analyze Routes - connects to analyze.controller.cjs
'use strict';

var express = require('express');
var router = express.Router();

// Load auth middleware
var authMiddleware;
try { authMiddleware = require('../middlewares/auth.middleware.cjs'); }
catch (e1) {
  try { authMiddleware = require('../middleware/auth.middleware.cjs'); }
  catch (e2) {
    try { authMiddleware = require('../middleware/auth.cjs'); }
    catch (e3) { authMiddleware = function(req, res, next) { next(); }; }
  }
}

// Load controller
var ctrl;
try {
  ctrl = require('../controllers/analyze.controller.cjs');
} catch (e) {
  console.warn('[ANALYZE-ROUTES] Controller not found:', e.message);
  ctrl = {};
}

// POST /api/analyze - Main analyze endpoint
router.post('/', authMiddleware, function(req, res) {
  if (ctrl.analyze) return ctrl.analyze(req, res);
  if (ctrl.analyzeStock) return ctrl.analyzeStock(req, res);
  res.status(503).json({ success: false, message: 'Analyze service not available' });
});

// POST /api/analyze/stock - Analyze specific stock
router.post('/stock', authMiddleware, function(req, res) {
  if (ctrl.analyzeStock) return ctrl.analyzeStock(req, res);
  if (ctrl.analyze) return ctrl.analyze(req, res);
  res.status(503).json({ success: false, message: 'Stock analysis not available' });
});

// POST /api/analyze/compare - Compare stocks
router.post('/compare', authMiddleware, function(req, res) {
  if (ctrl.compareStocks) return ctrl.compareStocks(req, res);
  res.status(503).json({ success: false, message: 'Compare service not available' });
});

// POST /api/analyze/chat - AI Chat
router.post('/chat', authMiddleware, function(req, res) {
  if (ctrl.chat) return ctrl.chat(req, res);
  res.status(503).json({ success: false, message: 'Chat service not available' });
});

// POST /api/analyze/ask - AI Ask (alias for chat)
router.post('/ask', authMiddleware, function(req, res) {
  if (ctrl.ask) return ctrl.ask(req, res);
  if (ctrl.chat) return ctrl.chat(req, res);
  res.status(503).json({ success: false, message: 'Ask service not available' });
});

// GET /api/analyze/models - Available AI models
router.get('/models', function(req, res) {
  if (ctrl.getModels) return ctrl.getModels(req, res);
  res.json({
    success: true,
    data: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4o', name: 'GPT-4o' }
    ]
  });
});

// GET /api/analyze/history - Analysis history
router.get('/history', authMiddleware, function(req, res) {
  if (ctrl.getAnalysisHistory) return ctrl.getAnalysisHistory(req, res);
  res.json({ success: true, data: [] });
});

// GET /api/analyze/status - Service status
router.get('/status', function(req, res) {
  var hasKey = !!(process.env.GAPGPT_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
  res.json({
    success: true,
    data: {
      available: hasKey,
      provider: hasKey ? 'GapGPT' : 'none',
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = router;
console.log('[ANALYZE-ROUTES] Loaded successfully');
