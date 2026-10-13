'use strict';

const cron = require('node-cron');
const { evaluateValuableSymbols, getStoredValuableSymbols, getMarketSession } = require('../services/valuableSymbols.engine.cjs');

function isTehranMarketOpen(now = new Date()) {
  return getMarketSession(now).isOpen;
}

let running = false;
let lastClosedEvaluationAt = 0;
const CLOSED_MARKET_RETRY_MS = 30 * 60 * 1000;

function registerValuableSymbolsCron() {
  // Refresh every two minutes during market hours. After hours, only recover
  // an empty database-backed list from the last valid shared-market snapshot.
  cron.schedule('*/2 * * * *', async () => {
    const marketOpen = isTehranMarketOpen();
    const now = Date.now();
    if (running) {
      console.warn('[CRON][ValuableSymbols] Previous run still active; skipping tick');
      return;
    }
    if (!marketOpen) {
      let stored;
      try { stored = await getStoredValuableSymbols({ force: true }); }
      catch (error) {
        console.error('[CRON][ValuableSymbols] Could not read persisted list:', error.message);
        return;
      }
      if (stored.results.length) return;
      if (now - lastClosedEvaluationAt < CLOSED_MARKET_RETRY_MS) return;
      lastClosedEvaluationAt = now;
    }
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
