'use strict';

const express = require('express');
const authenticate = require('../middlewares/auth.middleware.cjs');
const { getCachedValuableSymbols, getMarketSession } = require('../services/valuableSymbols.engine.cjs');

const router = express.Router();
let running = false;

function cacheIsStale(evaluatedAt) {
  const timestamp = evaluatedAt ? new Date(evaluatedAt).getTime() : NaN;
  return !Number.isFinite(timestamp) || Date.now() - timestamp > 60 * 60 * 1000;
}

router.get('/status', authenticate, (_req, res) => {
  const cached = getCachedValuableSymbols();
  return res.json({
    success: true,
    data: {
      running,
      lastEvaluatedAt: cached.evaluatedAt,
      count: cached.results.length,
      engine: 'valuable-symbols-independent',
      marketStatus: getMarketSession().status,
      stale: cacheIsStale(cached.evaluatedAt),
      maxPriceAgeHours: Number(process.env.VALUABLE_SYMBOLS_MAX_PRICE_AGE_HOURS) || 72
    }
  });
});

router.get('/signals', authenticate, (_req, res) => {
  const cached = getCachedValuableSymbols();
  return res.json({
    success: true,
    data: cached.results,
    meta: {
      stale: cacheIsStale(cached.evaluatedAt),
      source: 'shared-market-db+codal',
      lastEvaluatedAt: cached.evaluatedAt,
      marketStatus: getMarketSession().status,
      maxPriceAgeHours: Number(process.env.VALUABLE_SYMBOLS_MAX_PRICE_AGE_HOURS) || 72,
      available: !cacheIsStale(cached.evaluatedAt)
    }
  });
});

module.exports = router;
