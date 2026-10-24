'use strict';

const { startMarketWorker } = require('../workers/market.worker.cjs');
const { registerMarketCron } = require('./market.cron.cjs');
const { registerAllSymbolsSnapshotCron } = require('./allSymbolsSnapshot.cron.cjs');
const { registerUsageCron } = require('./usage.cron.cjs');
const { registerMarketTechnicalDailyCron } = require('./marketTechnicalDaily.cron.cjs');
const { registerValuableSymbolsCron } = require('./valuableSymbols.cron.cjs');
const { registerOptionsMarketCron } = require('./optionsMarket.cron.cjs');
const { registerTelegramPublisherCron } = require('./telegramPublisher.cron.cjs');

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
    safeRegister('telegram-channel-publisher', registerTelegramPublisherCron)
  ];

  cronStarted = true;
  console.log('[CRON] Cron registration completed: ' + results.filter(Boolean).length + '/' + results.length + ' successful');
}

module.exports = { startCronJobs };
