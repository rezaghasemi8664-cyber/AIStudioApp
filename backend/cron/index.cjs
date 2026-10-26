'use strict';

const { startMarketWorker } = require('../workers/market.worker.cjs');
const { registerMarketCron } = require('./market.cron.cjs');
const { registerAllSymbolsSnapshotCron } = require('./allSymbolsSnapshot.cron.cjs');
const { registerUsageCron } = require('./usage.cron.cjs');
const { registerMarketTechnicalDailyCron } = require('./marketTechnicalDaily.cron.cjs');
const { registerValuableSymbolsCron } = require('./valuableSymbols.cron.cjs');
const { registerOptionsMarketCron } = require('./optionsMarket.cron.cjs');
const { registerTelegramPublisherCron } = require('./telegramPublisher.cron.cjs');
const { startCodalSnapshotCron } = require('../services/codalSnapshot.service.cjs');
const { startFinancialDocumentCacheCron } = require('../services/codal-document.service.cjs');

let cronStarted = false;

function safeStart(name, fn) {
  try {
    if (typeof fn !== 'function') {
      console.warn('[CRON] Skipped ' + name + ': start function unavailable');
      return false;
    }
    fn();
    console.log('[CRON] ' + name + ' started');
    return true;
  } catch (error) {
    console.error('[CRON] Failed to start ' + name + ':', error.message);
    return false;
  }
}

function safeRegister(name, fn) {
  try {
    if (typeof fn !== 'function') return false;
    fn();
    console.log('[CRON] ' + name + ' registered');
    return true;
  } catch (error) {
    console.error('[CRON] Failed to register ' + name + ':', error.message);
    return false;
  }
}

function startCronJobs(io) {
  if (cronStarted) {
    console.log('[CRON] Cron jobs already started, skipping duplicate registration');
    return;
  }

  console.log('[CRON] Starting centralized cron jobs...');

  const results = [
    safeStart('market-worker', () => startMarketWorker(io)),
    safeRegister('market-history', () => registerMarketCron(io)),
    safeRegister('all-symbols-one-minute-snapshot', () => registerAllSymbolsSnapshotCron(io)),
    safeRegister('usage', registerUsageCron),
    safeRegister('market-technical-daily', registerMarketTechnicalDailyCron),
    safeRegister('valuable-symbols-independent', () => registerValuableSymbolsCron(io)),
    safeRegister('options-market-auto-refresh', () => registerOptionsMarketCron(io)),
    safeRegister('telegram-channel-publisher', registerTelegramPublisherCron),
    safeStart('codal-database-snapshot-08:00-13:30', startCodalSnapshotCron),
    safeStart('codal-financial-document-cache-08:20-13:50', startFinancialDocumentCacheCron)
  ];

  cronStarted = true;
  console.log('[CRON] Cron registration completed: ' + results.filter(Boolean).length + '/' + results.length + ' successful');
}

module.exports = { startCronJobs };
