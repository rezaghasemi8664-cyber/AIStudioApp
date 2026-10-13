'use strict';

const cron = require('node-cron');
const { evaluateValuableSymbols, getStoredValuableSymbols, getMarketSession } = require('../services/valuableSymbols.engine.cjs');
const marketSnapshotService = require('../services/marketSnapshot.service.cjs');

function isTehranMarketOpen(now = new Date()) {
  return getMarketSession(now).isOpen;
}

let running = false;
let lastClosedEvaluationAt = 0;
let lastSuccessfullyAnalyzedSnapshotId = null;
let lastAttemptedSnapshotId = null;
let lastAttemptedAt = 0;
const CLOSED_MARKET_RETRY_MS = 30 * 60 * 1000;
const EMPTY_RESULT_RETRY_MS = 10 * 60 * 1000;
const MAX_SNAPSHOT_AGE_MS = 5 * 60 * 1000;
const SNAPSHOT_SETTLE_MS = 45 * 1000;

function registerValuableSymbolsCron() {
  cron.schedule('*/2 * * * *', async () => {
    const marketOpen = isTehranMarketOpen();
    const now = Date.now();
    if (running) {
      console.warn('[CRON][ValuableSymbols] Previous run still active; skipping tick');
      return;
    }

    let stored;
    try {
      stored = await getStoredValuableSymbols({ force: true });
    } catch (error) {
      console.error('[CRON][ValuableSymbols] Could not read persisted list:', error.message);
      return;
    }

    let activeSnapshot;
    try {
      activeSnapshot = await marketSnapshotService.getActiveSnapshot();
    } catch (error) {
      console.error('[CRON][ValuableSymbols] Could not read active market snapshot:', error.message);
      return;
    }

    if (marketOpen) {
      if (!activeSnapshot || !activeSnapshot.activatedAt) return;
      const activatedAt = new Date(activeSnapshot.activatedAt).getTime();
      if (!Number.isFinite(activatedAt) || now - activatedAt > MAX_SNAPSHOT_AGE_MS) {
        console.log('[CRON][ValuableSymbols] Waiting for a recently activated verified market snapshot');
        return;
      }
      if (now - activatedAt < SNAPSHOT_SETTLE_MS) return;
      const activeId = Number(activeSnapshot.id);
      if (stored.snapshotId !== null && Number(stored.snapshotId) === activeId) {
        lastSuccessfullyAnalyzedSnapshotId = activeId;
        return;
      }
      if (lastSuccessfullyAnalyzedSnapshotId === activeId) return;
      // Empty/failed runs must not permanently block the same verified snapshot.
      // Retry at a controlled interval so late-arriving history/Codal data can recover.
      if (lastAttemptedSnapshotId === activeId && now - lastAttemptedAt < EMPTY_RESULT_RETRY_MS) return;
    } else {
      // Outside market hours, retain a valid persisted list. Only try recovery
      // from the last verified snapshot when the persisted list is empty.
      if (stored.results.length) return;
      if (now - lastClosedEvaluationAt < CLOSED_MARKET_RETRY_MS) return;
      lastClosedEvaluationAt = now;
      if (!activeSnapshot) {
        console.warn('[CRON][ValuableSymbols] Recovery skipped: no verified market snapshot exists');
        return;
      }
    }

    running = true;
    try {
      const results = await evaluateValuableSymbols({ limit: 20, allowClosedRecovery: !marketOpen });
      if (marketOpen && activeSnapshot) {
        const currentSnapshot = await marketSnapshotService.getActiveSnapshot();
        if (currentSnapshot && Number(currentSnapshot.id) === Number(activeSnapshot.id)) {
          lastAttemptedSnapshotId = Number(activeSnapshot.id);
          lastAttemptedAt = Date.now();
          if (results.some(item => Number(item.marketSnapshotId) === Number(activeSnapshot.id))) {
            lastSuccessfullyAnalyzedSnapshotId = Number(activeSnapshot.id);
          }
        }
      }
      console.log('[CRON][ValuableSymbols] Evaluation completed; market:', marketOpen ? 'OPEN' : 'CLOSED', 'snapshot:', activeSnapshot?.id || 'none', 'eligible symbols:', results.length);
    } catch (error) {
      console.error('[CRON][ValuableSymbols] Evaluation failed:', error.message);
    } finally {
      running = false;
    }
  }, { timezone: 'Asia/Tehran' });
}

module.exports = { registerValuableSymbolsCron, isTehranMarketOpen };
