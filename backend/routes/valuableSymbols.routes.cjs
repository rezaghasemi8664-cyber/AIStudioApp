'use strict';

const express = require('express');
const authenticate = require('../middlewares/auth.middleware.cjs');
const { getCachedValuableSymbols } = require('../services/valuableSymbols.engine.cjs');

const router = express.Router();
let running = false;

router.get('/status', authenticate, (_req, res) => {
  const cached = getCachedValuableSymbols();
  return res.json({
    success: true,
    data: { running, lastEvaluatedAt: cached.evaluatedAt, count: cached.results.length, engine: 'valuable-symbols-independent' }
  });
});

router.get('/signals', authenticate, (_req, res) => {
  const cached = getCachedValuableSymbols();
  return res.json({
    success: true,
    data: cached.results,
    meta: {
      stale: !cached.evaluatedAt,
      source: 'shared-market-db+codal',
      lastEvaluatedAt: cached.evaluatedAt,
      available: Boolean(cached.evaluatedAt)
    }
  });
});

module.exports = router;
