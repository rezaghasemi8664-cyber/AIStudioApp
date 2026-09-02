/**
 * Market Summary Cron Job
 * Path: cron/marketSummaryCron.cjs
 *
 * EOD rule:
 * - Check every day at 12:35 Tehran time.
 * - Generate only on actual trading days.
 * - Never catch up/backfill on closed days.
 */
'use strict';

const cron = require('node-cron');
const marketSummaryService = require('../services/marketSummary.service.cjs');

let eodSummaryTask = null;
let eodRunning = false;

function nowTehranString() {
  return new Date().toLocaleString('en-CA', {
    timeZone: 'Asia/Tehran',
    hour12: false
  });
}

function isMarketDayTehran(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Tehran'
  }).format(date);
  return ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'].includes(weekday);
}

async function runEndOfDaySummaryJob() {
  if (eodRunning) {
    console.log('[Cron][MarketSummary] EOD skipped: already running.');
    return { success: false, skipped: true, reason: 'ALREADY_RUNNING' };
  }

  eodRunning = true;
  try {
    console.log(`[Cron][MarketSummary] EOD started | Tehran: ${nowTehranString()}`);

    // Weekends and non-trading calendar days must never trigger catch-up.
    if (!isMarketDayTehran()) {
      console.log('[Cron][MarketSummary] Non-trading calendar day — no summary generation.');
      return { success: false, skipped: true, reason: 'NON_TRADING_DAY' };
    }

    if (typeof marketSummaryService.findOrGenerateLatest !== 'function') {
      throw new TypeError('[Cron][MarketSummary] findOrGenerateLatest is not implemented.');
    }

    const result = await marketSummaryService.findOrGenerateLatest();
    const data = result?.data || null;
    const generated = Boolean(result?.generated);
    const cached = Boolean(result?.cached);
    const sourceType = result?.sourceType || 'unknown';
    const reason = result?.reason || null;
    const id = data?.id || result?.id || null;

    console.log(
      `[Cron][MarketSummary] ${generated ? '🆕 Generated' : cached ? '📦 Existing' : '✅ OK'} | source=${sourceType} id=${id ?? 'N/A'} reason=${reason ?? '-'}`
    );

    return {
      success: true,
      data,
      meta: {
        generated,
        cached,
        sourceType,
        reason,
        diagnostics: result?.diagnostics || null
      }
    };
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

  // The job is evaluated at 12:35 Tehran every day. The service is called only
  // on trading calendar days; there is deliberately no closed-day catch-up.
  if (!eodSummaryTask) {
    eodSummaryTask = cron.schedule('35 12 * * *', runEndOfDaySummaryJob, tehranOptions);
    console.log('[Cron] ✅ Market Summary scheduled: EOD 12:35 Tehran; trading days only; no catch-up.');
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

  runEndOfDaySummaryJob()
    .then(() => {
      console.log('[Cron][MarketSummary] Manual EOD run finished.');
    })
    .catch((err) => {
      console.error('[Cron][MarketSummary] Manual run fatal error:', err?.message || err);
    });
}

module.exports = {
  startMarketSummaryCron,
  stopMarketSummaryCron,
  runMarketSummaryNow: runEndOfDaySummaryJob
};
