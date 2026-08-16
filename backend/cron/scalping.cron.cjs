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

async function executeScalpingJob() {
  console.log('[CRON] Scalping job triggered');

  try {
    const marketStatus = await brsService.getLocalMarketWindowStatus();

    if (!marketStatus || !marketStatus.available) {
      console.log(
        `[CRON] Scalping skipped: market status unavailable${
          marketStatus && marketStatus.reason ? ` - ${marketStatus.reason}` : ''
        }`
      );
      return;
    }

    if (!marketStatus.isOpen) {
      console.log(
        `[CRON] Market is closed. Scalping skipped${
          marketStatus.reason ? ` - ${marketStatus.reason}` : ''
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
  executeScalpingJob
};
