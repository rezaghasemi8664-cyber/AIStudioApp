'use strict';

/*
 * Legacy scalping cron intentionally disabled.
 *
 * Central Market Worker (backend/workers/market.worker.cjs) is now the single
 * producer of shared scalping opportunities. Keeping the old cron executable
 * could trigger a second BRS-based user-scoped scan and violate the
 * shared-market architecture.
 *
 * The file remains as a compatibility module so any legacy import is harmless.
 */

function initScalpingCron() {
  console.log('[CRON] Legacy scalping cron disabled: central market worker is authoritative.');
  return null;
}

module.exports = {
  initScalpingCron,
  registerScalpingCron: initScalpingCron,
  executeScalpingJob: async function executeScalpingJob() {
    console.log('[CRON] Legacy scalping job ignored: central market worker is authoritative.');
    return { status: 'disabled', source: 'central-market-worker' };
  }
};
