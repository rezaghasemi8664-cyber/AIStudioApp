'use strict';

const cron = require('node-cron');
const scalpingService = require('../services/scalping.service.cjs');
const brsService = require('../services/brs.service.cjs');

const DEFAULT_SCHEDULE = '*/10 * * * *';
const DEFAULT_TIMEZONE = 'Asia/Tehran';

let scalpingTask = null;

function resolveSchedule() {
  const value = process.env.SCALPING_CRON_SCHEDULE;
  return value && String(value).trim() ? String(value).trim() : DEFAULT_SCHEDULE;
}

function shouldRunCron() {
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  const enabled = String(process.env.ENABLE_SCALPING_CRON || '').toLowerCase();

  if (enabled === 'true' || enabled === '1') return true;
  if (enabled === 'false' || enabled === '0') return false;

  return env === 'production';
}

/*
 * Market-status compatibility bridge.
 *
 * brs.service.cjs returns the schedule result as `isOpenBySchedule`, while
 * the scalping service and cron consume `isOpen`/`available`.
 * Keep the BRS service contract explicit here so the cron and the scalping
 * engine cannot silently interpret a valid open market as closed/unavailable.
 */
function installMarketStatusCompatibility() {
  if (
    !brsService ||
    typeof brsService.getLocalMarketWindowStatus !== 'function' ||
    brsService.getLocalMarketWindowStatus.__scalpingCompatibilityPatched
  ) {
    return;
  }

  const originalGetLocalMarketWindowStatus = brsService.getLocalMarketWindowStatus.bind(brsService);

  const patchedGetLocalMarketWindowStatus = function patchedGetLocalMarketWindowStatus(now) {
    const status = originalGetLocalMarketWindowStatus(now);

    if (!status || typeof status !== 'object') {
      return {
        isOpen: false,
        isOpenBySchedule: false,
        available: false,
        source: 'brs.getLocalMarketWindowStatus',
        reason: 'invalid-market-window-status'
      };
    }

    return {
      ...status,
      isOpen: status.isOpenBySchedule === true,
      available: true,
      source: 'brs.getLocalMarketWindowStatus',
      reason: status.isOpenBySchedule === true ? 'market-open' : 'market-closed'
    };
  };

  patchedGetLocalMarketWindowStatus.__scalpingCompatibilityPatched = true;
  brsService.getLocalMarketWindowStatus = patchedGetLocalMarketWindowStatus;
}

installMarketStatusCompatibility();

async function executeScalpingJob() {
  console.log('[CRON] Scalping job triggered');

  try {
    const marketStatus = await brsService.getLocalMarketWindowStatus();
    const marketIsOpen =
      marketStatus &&
      (marketStatus.isOpen === true || marketStatus.isOpenBySchedule === true);
    const statusAvailable =
      marketStatus &&
      (marketStatus.available === undefined ? true : marketStatus.available === true);

    if (!statusAvailable) {
      console.log(
        `[CRON] Scalping skipped: market status unavailable${
          marketStatus && marketStatus.reason ? ` - ${marketStatus.reason}` : ''
        }`
      );
      return;
    }

    if (!marketIsOpen) {
      console.log(
        `[CRON] Market is closed. Scalping skipped${
          marketStatus && marketStatus.reason ? ` - ${marketStatus.reason}` : ''
        }`
      );
      return;
    }

    console.log('[CRON] Market is open. Running scalping engine...');
    await scalpingService.runScalping();
    console.log('[CRON] Scalping engine completed successfully.');
  } catch (error) {
    console.error(
      '[CRON] Scalping job failed:',
      error && error.stack ? error.stack : error
    );
  }
}

function initScalpingCron() {
  if (!shouldRunCron()) {
    console.log('[CRON] Scalping cron is disabled for current environment.');
    return null;
  }

  if (scalpingTask) {
    console.log('[CRON] Scalping cron already initialized.');
    return scalpingTask;
  }

  const schedule = resolveSchedule();

  scalpingTask = cron.schedule(schedule, executeScalpingJob, {
    timezone: DEFAULT_TIMEZONE
  });

  console.log(
    `[CRON] Scalping service cron started. schedule=${schedule}, timezone=${DEFAULT_TIMEZONE}`
  );

  return scalpingTask;
}

module.exports = {
  initScalpingCron,
  // Current cron/index.cjs imports this legacy name.
  registerScalpingCron: initScalpingCron,
  executeScalpingJob
};
