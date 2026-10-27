'use strict';

const express = require('express');
const authenticate = require('../middlewares/auth.middleware.cjs');
const market = require('../services/sharedMarket.service.cjs');
const { refreshValuableSymbolPrices } = require('../services/valuableSymbols.priceRefresh.cjs');
const { getStoredValuableSymbols, getMarketSession } = require('../services/valuableSymbols.engine.cjs');

const router = express.Router();
let running = false;

function cacheIsStale(evaluatedAt) {
  const timestamp = evaluatedAt ? new Date(evaluatedAt).getTime() : NaN;
  return !Number.isFinite(timestamp) || Date.now() - timestamp > 60 * 60 * 1000;
}

router.get('/status', authenticate, async (_req, res) => {
  const cached = await getStoredValuableSymbols();
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

router.get('/signals', authenticate, async (_req, res) => {
  const session = getMarketSession();
  let cached = { results: [], evaluatedAt: null };
  try {
    cached = await getStoredValuableSymbols();
    // Recommendation fundamentals may be cached, but the displayed price and
    // derived entry/target levels must come from the latest shared market row.
    const marketRows = await market.getSymbols({ limit: 1200 });
    const filteredReasons = {};
    const refreshedResults = refreshValuableSymbolPrices(
      cached.results,
      marketRows,
      new Date(),
      session.isOpen,
      reason => { filteredReasons[reason] = (filteredReasons[reason] || 0) + 1; }
    );
    const stale = cacheIsStale(cached.evaluatedAt);
    return res.json({
      success: true,
      data: refreshedResults,
      meta: {
        stale,
        source: 'shared-market-db+codal',
        lastEvaluatedAt: cached.evaluatedAt,
        marketStatus: session.status,
        maxPriceAgeHours: Number(process.env.VALUABLE_SYMBOLS_MAX_PRICE_AGE_HOURS) || 72,
        cachedCount: cached.results.length,
        displayedCount: refreshedResults.length,
        filteredCount: Math.max(0, cached.results.length - refreshedResults.length),
        filteredReasons,
        available: refreshedResults.length > 0,
        pricesRefreshedFromSharedMarket: true
      }
    });
  } catch (error) {
    // Do not fall back to old cached prices when the shared market cannot be read.
    return res.status(503).json({
      success: false,
      data: [],
      meta: {
        stale: true,
        source: 'shared-market-db+codal',
        lastEvaluatedAt: cached.evaluatedAt,
        marketStatus: session.status,
        available: false,
        pricesRefreshedFromSharedMarket: false
      },
      message: 'قیمت به‌روز بازار در دسترس نیست؛ پیشنهادها موقتاً نمایش داده نمی‌شوند.'
    });
  }
});

module.exports = router;
