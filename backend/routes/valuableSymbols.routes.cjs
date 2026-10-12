'use strict';

const express = require('express');
const authenticate = require('../middlewares/auth.middleware.cjs');
const { evaluateValuableSymbols } = require('../services/valuableSymbols.engine.cjs');

const router = express.Router();
let lastSuccessfulResult = [];
let lastEvaluatedAt = null;
let running = false;

router.get('/status', authenticate, (_req, res) => {
  return res.json({
    success: true,
    data: { running, lastEvaluatedAt, count: lastSuccessfulResult.length, engine: 'valuable-symbols-independent' }
  });
});

router.get('/signals', authenticate, async (_req, res) => {
  if (running) {
    return res.json({ success: true, data: lastSuccessfulResult, meta: { stale: true, reason: 'evaluation-in-progress', lastEvaluatedAt } });
  }
  running = true;
  try {
    const result = await evaluateValuableSymbols({ limit: 20 });
    lastSuccessfulResult = result;
    lastEvaluatedAt = new Date().toISOString();
    return res.json({ success: true, data: result, meta: { stale: false, source: 'shared-market-db+codal', lastEvaluatedAt } });
  } catch (error) {
    console.error('[VALUABLE-SYMBOLS] evaluation failed:', error.message);
    if (lastSuccessfulResult.length) {
      return res.json({ success: true, data: lastSuccessfulResult, meta: { stale: true, lastEvaluatedAt } });
    }
    return res.status(503).json({
      success: false,
      code: 'VALUABLE_SYMBOLS_UNAVAILABLE',
      message: 'داده معتبر برای ارزیابی نمادهای ارزنده در دسترس نیست.'
    });
  } finally {
    running = false;
  }
});

module.exports = router;
