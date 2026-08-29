/**
 * Market Summary Cron Job
 * Path: cron/marketSummaryCron.cjs
 * Updated: 2026-08-19 (final aligned)
 *
 * Goal:
 * - Automate market summary generation (Sat-Wed, Tehran TZ)
 * - Use findOrGenerateLatest as canonical path (with service fallback logic)
 * - No morning cleanup job (retention handled inside service: keep last N)
 * - Support manual run
 */
'use strict';

const cron = require('node-cron');
const marketSummaryService = require('../services/marketSummary.service.cjs');

let eodSummaryTask = null;
let eodRunning = false;

/** ---------- Utils ---------- */
function nowTehranString() {
  return new Date().toLocaleString('en-CA', {
    timeZone: 'Asia/Tehran',
    hour12: false
  });
}

function isMarketDayTehran(date = new Date()) {
  const d = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'Asia/Tehran'
  }).format(date);
  return ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'].includes(d);
}

/**
 * Canonical generator:
 * سرویس خودش تصمیم می‌گیرد از cache بخواند یا تولید کند یا fallback بدهد.
 */
async function runEndOfDaySummaryJob() {
  if (eodRunning) {
    console.log('[Cron][MarketSummary] EOD skipped: already running.');
    return { success: false, skipped: true, reason: 'ALREADY_RUNNING' };
  }

  eodRunning = true;

  try {
    console.log(`[Cron][MarketSummary] 📊 EOD started | Tehran: ${nowTehranString()}`);

    if (!isMarketDayTehran()) {
      // ⚠️ به‌جای رد شدن کامل: چک کن ببین آخرین روز معاملاتیِ اخیر
      // (مثلاً دیروز) تحلیل نهایی دارد یا نه. اگر نداشت (مثلاً چون
      // کرون آن روز به هر دلیلی اجرا/موفق نشده بود)، همین الان با
      // داده و تاریخ همان روز بسازش تا در تب نمایش داده شود.
      console.log('[Cron][MarketSummary] ℹ️ Not a market day in Tehran — running catch-up check instead.');

      if (typeof marketSummaryService.runCatchUpForMissingSummary !== 'function') {
        console.log('[Cron][MarketSummary] ℹ️ Catch-up not available, skipping.');
        return { success: false, skipped: true, reason: 'NOT_MARKET_DAY' };
      }

      const catchUpResult = await marketSummaryService.runCatchUpForMissingSummary();
      if (catchUpResult?.data) {
        console.log(
          `[Cron][MarketSummary] ✅ Catch-up generated for a previously missing trading day | reason=${catchUpResult.reason}`
        );
      } else {
        console.log(
          `[Cron][MarketSummary] ℹ️ Catch-up found nothing to backfill | reason=${catchUpResult?.reason || 'NONE'}`
        );
      }
      return catchUpResult;
    }

    if (typeof marketSummaryService.findOrGenerateLatest !== 'function') {
      throw new TypeError(
        '[Cron][MarketSummary] findOrGenerateLatest is not implemented in marketSummary.service.cjs'
      );
    }

    const result = await marketSummaryService.findOrGenerateLatest();

    const data = result?.data || null;
    const generated = Boolean(result?.generated);
    const cached = Boolean(result?.cached);
    const sourceType = result?.sourceType || 'unknown';
    const reason = result?.reason || null;
    const id = data?.id || result?.id || null;

    const status = generated ? '🆕 Generated' : cached ? '📦 Cached' : '✅ OK';

    console.log(
      `[Cron][MarketSummary] ✅ Success [${status}] source=${sourceType} id=${id ?? 'N/A'} reason=${reason ?? '-'}`
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
    console.error('[Cron][MarketSummary] ❌ EOD Job Error:', error?.message || error);
    return {
      success: false,
      error: error?.message || String(error)
    };
  } finally {
    eodRunning = false;
  }
}

/** ---------- Scheduler ---------- */
function startMarketSummaryCron() {
  const tehranOptions = { timezone: 'Asia/Tehran' };

  // هر روز ساعت ۱۲:۳۵: شنبه تا چهارشنبه تحلیل امروز را می‌سازد؛
  // پنجشنبه/جمعه (یا هر روز غیرمعاملاتی) به‌جای بیکاری، چک catch-up
  // را اجرا می‌کند تا اگر روز معاملاتیِ قبلی تحلیل نداشت، همان‌جا پر شود.
  if (!eodSummaryTask) {
    eodSummaryTask = cron.schedule('35 12 * * *', runEndOfDaySummaryJob, tehranOptions);
    console.log('[Cron] ✅ Market Summary scheduled: هر روز ۱۲:۳۵ (تولید در روز باز، catch-up در روز بسته) TZ=Asia/Tehran');
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

/** ---------- Manual mode ---------- */
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
