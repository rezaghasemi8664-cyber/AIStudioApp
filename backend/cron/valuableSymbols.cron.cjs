'use strict';

const cron = require('node-cron');
const { evaluateValuableSymbols, getMarketSession } = require('../services/valuableSymbols.engine.cjs');

function isTehranMarketOpen(now = new Date()) {
  return getMarketSession(now).isOpen;
}

let running = false;
let lastClosedEvaluationAt = 0;
const CLOSED_MARKET_REFRESH_MS = 30 * 60 * 1000;

function registerValuableSymbolsCron() {
  // During the session, refresh every two minutes. Outside the session, use
  // the latest still-fresh central snapshot at most every 30 minutes.
  cron.schedule('*/2 * * * *', async () => {
    const marketOpen = isTehranMarketOpen();
    const now = Date.now();
    if (!marketOpen && now - lastClosedEvaluationAt < CLOSED_MARKET_REFRESH_MS) return;
    if (running) {
      console.warn('[CRON][ValuableSymbols] Previous run still active; skipping tick');
      return;
    }
    if (!marketOpen) lastClosedEvaluationAt = now;
    running = true;
    try {
      const results = await evaluateValuableSymbols({ limit: 20 });
      console.log('[CRON][ValuableSymbols] Evaluation completed; market:', marketOpen ? 'OPEN' : 'CLOSED', 'eligible symbols:', results.length);
    } catch (error) {
      console.error('[CRON][ValuableSymbols] Evaluation failed:', error.message);
    } finally {
      running = false;
    }
  }, { timezone: 'Asia/Tehran' });
}

module.exports = { registerValuableSymbolsCron, isTehranMarketOpen };
