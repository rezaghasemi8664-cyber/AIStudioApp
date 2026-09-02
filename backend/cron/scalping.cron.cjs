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
  const enabled = String(process.env.ENABLE_SCALPING_CRON || '').toLowerCase();

  // Explicit configuration always wins. The cron must not be disabled merely
  // because NODE_ENV is "development" on the production VPS.
  if (enabled === 'true' || enabled === '1') return true;
  if (enabled === 'false' || enabled === '0') return false;

  // No explicit flag: enable by default. This keeps the VPS cron operational
  // regardless of NODE_ENV while still allowing an explicit opt-out.
  return true;
}

async function executeScalpingJob() {
  console.log('[CRON] Scalping job triggered');

  try {
    // brs.service.cjs already owns the Tehran schedule calculation and exposes
    // the normalized market status through getMarketStatus(). Using that
    // public service API avoids depending on an internal/non-exported helper.
    const marketStatus = await brsService.getMarketStatus();
    const marketIsOpen = marketStatus && marketStatus.isOpen === true;
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
    console.log('[CRON] Scalping cron disabled explicitly by ENABLE_SCALPING_CRON.');
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
