'use strict';

const { registerScalpingCron } = require('./scalping.cron.cjs');
const { registerMarketCron } = require('./market.cron.cjs');
const { registerUsageCron } = require('./usage.cron.cjs');

let cronStarted = false;

function safeRegister(name, registerFn) {
  try {
    if (typeof registerFn !== 'function') {
      console.warn(`[CRON] Skipped ${name}: register function is not available`);
      return false;
    }

    registerFn();
    console.log(`[CRON] ${name} registered`);
    return true;
  } catch (error) {
    console.error(`[CRON] Failed to register ${name}:`, error.message);
    return false;
  }
}

function startCronJobs() {
  if (cronStarted) {
    console.log('[CRON] Cron jobs already started, skipping duplicate registration');
    return;
  }

  console.log('[CRON] Starting cron jobs...');

  const results = [
    safeRegister('scalping', registerScalpingCron),
    safeRegister('market', registerMarketCron),
    safeRegister('usage', registerUsageCron)
  ];

  cronStarted = true;

  const successCount = results.filter(Boolean).length;
  console.log(`[CRON] Cron registration completed: ${successCount}/${results.length} successful`);
}

module.exports = { startCronJobs };
