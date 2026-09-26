'use strict';

const { startMarketWorker } = require('../workers/market.worker.cjs');
const { registerUsageCron } = require('./usage.cron.cjs');

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

function startCronJobs() {
  if (cronStarted) {
    console.log('[CRON] Cron jobs already started, skipping duplicate registration');
    return;
  }

  console.log('[CRON] Starting centralized cron jobs...');

  const results = [
    safeStart('market-worker', startMarketWorker),
    safeRegister('usage', registerUsageCron)
  ];

  cronStarted = true;
  console.log('[CRON] Cron registration completed: ' + results.filter(Boolean).length + '/' + results.length + ' successful');
}

module.exports = { startCronJobs };
