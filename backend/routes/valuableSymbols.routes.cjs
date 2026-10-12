'use strict';

const express = require('express');
const authenticate = require('../middlewares/auth.middleware.cjs');
const { evaluateValuableSymbols, getCachedValuableSymbols } = require('../services/valuableSymbols.engine.cjs');

const router = express.Router();
let running = false;

router.get('/status', authenticate, (_req, res) => {
  const cached = getCachedValuableSymbols();
  return res.json({
    success: true,
    data: { running, lastEvaluatedAt: cached.evaluatedAt, count: cached.results.length, engine: 'valuable-symbols-independent' }
  });
});

router.get('/signals', authenticate, async (_req, res) => {
  let cached = getCachedValuableSymbols();
  if (running) {
    return res.json({ success: true, data: cached.results, meta: { stale: true, reason: 'evaluation-in-progress', lastEvaluatedAt: cached.evaluatedAt } });
  }
  if (cached.evaluatedAt) {
    return res.json({ success: true, data: cached.results, meta: { stale: false, source: 'shared-market-db+codal', lastEvaluatedAt: cached.evaluatedAt } });
  }
  running = true;
  try {
    const result = await evaluateValuableSymbols({ limit: 20 });
    cached = getCachedValuableSymbols();
    return res.json({ success: true, data: result, meta: { stale: false, source: 'shared-market-db+codal', lastEvaluatedAt: cached.evaluatedAt } });
  } catch (error) {
    console.error('[VALUABLE-SYMBOLS] evaluation failed:', error.message);
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
