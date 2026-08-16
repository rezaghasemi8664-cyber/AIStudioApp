'use strict';

const cron = require('node-cron');
const marketSummaryService = require('../services/marketSummary.service.cjs');

let openCleanupTask = null;
let eodSummaryTask = null;

let cleanupRunning = false;
let eodRunning = false;

/**
 * Job 1) پاکسازی ابتدای روز معاملاتی:
 * - هدف: حذف فیزیکی خلاصه‌های روزهای قبل برای کاهش حجم دیتابیس
 * - schedule: 09:00 تهران | شنبه تا چهارشنبه
 */
async function runOpenCleanupJob() {
  if (cleanupRunning) {
    console.log('[Cron][MarketSummary][OPEN_CLEANUP] Previous cleanup is still running. Skipping this tick.');
    return;
  }

  cleanupRunning = true;
  const startedAt = new Date();

  try {
    console.log(
      `[Cron][MarketSummary][OPEN_CLEANUP] Triggered at ${startedAt.toISOString()} (Asia/Tehran schedule)`
    );

    // این متد باید در marketSummary.service.cjs پیاده‌سازی و export شده باشد:
    // deletePreviousDaysSummaries({ tx = null } = {})
    const result = await marketSummaryService.deletePreviousDaysSummaries();

    if (!result || result.success !== true) {
      console.log(
        `[Cron][MarketSummary][OPEN_CLEANUP] Skipped/Failed: ${result?.message || 'Unknown reason'}`
      );
      return;
    }

    console.log(
      `[Cron][MarketSummary][OPEN_CLEANUP] Success: deleted=${result?.deletedCount ?? 0} | today=${result?.date ?? 'N/A'}`
    );
  } catch (error) {
    console.error('[Cron][MarketSummary][OPEN_CLEANUP] Unhandled error:', error);
  } finally {
    cleanupRunning = false;
  }
}

/**
 * Job 2) تولید خلاصه پایان روز:
 * - schedule: 12:35 تهران | شنبه تا چهارشنبه
 */
async function runEndOfDaySummaryJob() {
  if (eodRunning) {
    console.log('[Cron][MarketSummary][EOD] Previous run is still in progress. Skipping this tick.');
    return;
  }

  eodRunning = true;
  const startedAt = new Date();

  try {
    console.log(
      `[Cron][MarketSummary][EOD] Triggered at ${startedAt.toISOString()} (Asia/Tehran schedule)`
    );

    // سرویس باید خودش trading-day / market-close و one-per-day را validate کند
    const result = await marketSummaryService.generateEndOfDaySummary({
      force: false,
      generatedBy: null
    });

    if (!result || result.success !== true) {
      console.log(
        `[Cron][MarketSummary][EOD] Skipped/Failed: ${result?.message || 'Unknown reason'}`
      );
      return;
    }

    const id = result?.data?.id ?? 'N/A';
    const summaryDate = result?.data?.summaryDate ?? result?.data?.date ?? 'N/A';
    const cached = result?.cached ? ' (cached)' : '';

    console.log(
      `[Cron][MarketSummary][EOD] Success: #${id} | summaryDate=${summaryDate}${cached}`
    );
  } catch (error) {
    console.error('[Cron][MarketSummary][EOD] Unhandled error:', error);
  } finally {
    eodRunning = false;
  }
}

/**
 * شروع Cron ها:
 * - OPEN CLEANUP: 09:00 شنبه تا چهارشنبه
 * - EOD SUMMARY : 12:35 شنبه تا چهارشنبه
 */
function startMarketSummaryCron() {
  // 09:00 - پاکسازی ابتدای روز
  if (!openCleanupTask) {
    openCleanupTask = cron.schedule(
      '0 9 * * 6,0,1,2,3',
      runOpenCleanupJob,
      { timezone: 'Asia/Tehran' }
    );
    console.log('[Cron][MarketSummary] ✅ OPEN_CLEANUP Started (09:00, Sat-Wed, Asia/Tehran)');
  } else {
    console.log('[Cron][MarketSummary] OPEN_CLEANUP already started. Skipping re-initialization.');
  }

  // 12:35 - تولید خلاصه پایان روز
  if (!eodSummaryTask) {
    eodSummaryTask = cron.schedule(
      '35 12 * * 6,0,1,2,3',
      runEndOfDaySummaryJob,
      { timezone: 'Asia/Tehran' }
    );
    console.log('[Cron][MarketSummary] ✅ EOD_SUMMARY Started (12:35, Sat-Wed, Asia/Tehran)');
  } else {
    console.log('[Cron][MarketSummary] EOD_SUMMARY already started. Skipping re-initialization.');
  }

  return {
    openCleanupTask,
    eodSummaryTask
  };
}

/**
 * توقف Cron ها (برای shutdown graceful)
 */
function stopMarketSummaryCron() {
  if (openCleanupTask) {
    openCleanupTask.stop();
    openCleanupTask.destroy();
    openCleanupTask = null;
    console.log('[Cron][MarketSummary] 🛑 OPEN_CLEANUP Stopped.');
  } else {
    console.log('[Cron][MarketSummary] No active OPEN_CLEANUP task to stop.');
  }

  if (eodSummaryTask) {
    eodSummaryTask.stop();
    eodSummaryTask.destroy();
    eodSummaryTask = null;
    console.log('[Cron][MarketSummary] 🛑 EOD_SUMMARY Stopped.');
  } else {
    console.log('[Cron][MarketSummary] No active EOD_SUMMARY task to stop.');
  }
}

/**
 * اجرای دستی برای تست
 */
async function runMarketSummaryNow() {
  await runEndOfDaySummaryJob();
}

/**
 * اجرای دستی پاکسازی برای تست
 */
async function runOpenCleanupNow() {
  await runOpenCleanupJob();
}

module.exports = {
  startMarketSummaryCron,
  stopMarketSummaryCron,
  runMarketSummaryNow,
  runOpenCleanupNow
};
