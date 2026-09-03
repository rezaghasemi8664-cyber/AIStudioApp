/**
 * Market Summary Cron Job
 *
 * Rule:
 * - Run exactly at 12:35 Tehran time.
 * - Generate one summary from the same 14-section live analysis used by the UI.
 * - Persist only when the live market snapshot belongs to today and contains real trading activity.
 * - Never catch up/backfill on closed or holiday days.
 */
'use strict';

const cron = require('node-cron');
const dailyMarketSummaryService = require('../services/dailyMarketSummary.service.cjs');

let eodSummaryTask = null;
let eodRunning = false;

function nowTehranString() {
  return new Date().toLocaleString('en-CA', {
    timeZone: 'Asia/Tehran',
    hour12: false
  });
}

async function runEndOfDaySummaryJob() {
  if (eodRunning) {
    console.log('[Cron][MarketSummary] EOD skipped: already running.');
    return { success: false, skipped: true, reason: 'ALREADY_RUNNING' };
  }

  eodRunning = true;
  try {
    console.log(`[Cron][MarketSummary] EOD started | Tehran: ${nowTehranString()}`);

    const result = await dailyMarketSummaryService.generateDailyMarketSummary();
    const id = result?.id || result?.data?.id || null;

    console.log(
      `[Cron][MarketSummary] ${result?.generated ? '🆕 Generated' : result?.updated ? '♻️ Updated' : result?.skipped ? '⏭️ Skipped' : '✅ OK'} | id=${id ?? 'N/A'} reason=${result?.reason || '-'}`
    );

    return result;
  } catch (error) {
    console.error('[Cron][MarketSummary] EOD Job Error:', error?.message || error);
    return {
      success: false,
      error: error?.message || String(error)
    };
  } finally {
    eodRunning = false;
  }
}

function startMarketSummaryCron() {
  const tehranOptions = { timezone: 'Asia/Tehran' };

  if (!eodSummaryTask) {
    eodSummaryTask = cron.schedule('35 12 * * *', runEndOfDaySummaryJob, tehranOptions);
    console.log('[Cron] ✅ Market Summary scheduled: exactly 12:35 Tehran; trading days/data validation only; no catch-up.');
  } else {
    console.log('[Cron] ℹ️ Market Summary cron already started. Skipping duplicate start.');
  }

  return { eodSummaryTask };
}

function stopMarketSummaryCron() {
  if (eodSummaryTask) {
    eodSummaryTask.stop();
    eodSummaryTask = null;
  }
  console.log('[Cron] 🛑 Market Summary task stopped.');
}

if (require.main === module) {
  console.log('[Cron][MarketSummary] 🛠 Manual mode detected.');
  startMarketSummaryCron();
}

module.exports = {
  startMarketSummaryCron,
  stopMarketSummaryCron,
  runMarketSummaryNow: runEndOfDaySummaryJob
};
