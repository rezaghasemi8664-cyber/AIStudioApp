const cron = require('node-cron');
const {
  fetchIndex,
  saveMarketSnapshot,
} = require('../services/marketHistory.service.cjs');

const MARKET_TZ = 'Asia/Tehran';
const MARKET_OPEN_MINUTE = 9 * 60;
const MARKET_CLOSE_MINUTE = 12 * 60 + 30;

let marketCronRunning = false;

function getTehranMarketWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const values = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }

  const weekday = values.weekday;
  const hour = Number(values.hour || 0);
  const minute = Number(values.minute || 0);

  return {
    isTradingDay: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'].includes(weekday),
    minutesOfDay: hour * 60 + minute,
  };
}

function isMarketOpenBySchedule(now = new Date()) {
  const window = getTehranMarketWindow(now);
  return (
    window.isTradingDay &&
    window.minutesOfDay >= MARKET_OPEN_MINUTE &&
    window.minutesOfDay < MARKET_CLOSE_MINUTE
  );
}

function registerMarketCron() {
  cron.schedule('*/2 * * * *', async () => {
    // The cron itself is the single owner of the BRS index fetch.
    // Do not call brsService.isMarketOpen()/getMarketStatus() here because
    // that path can trigger another BRS Index request.
    if (!isMarketOpenBySchedule()) return;

    // Prevent overlapping runs if a BRS request/retry takes longer than
    // the two-minute cron interval.
    if (marketCronRunning) {
      console.warn('[CRON] Previous market snapshot run is still active; skip tick');
      return;
    }

    marketCronRunning = true;

    try {
      const data = await fetchIndex();

      if (!data || data._fallback) {
        console.warn('[CRON] Skip snapshot: empty or fallback index');
        return;
      }

      // The scheduler is authoritative for the regular session.
    // A snapshot fetched at/after 12:30 must never be persisted as OPEN.
    // The cron itself stops before 12:30, so this also protects against
    // accidental boundary execution.
    const saved = await saveMarketSnapshot(data);
      if (saved) {
        console.log(
          `[CRON] Market snapshot saved at ${new Date().toISOString()}`
        );
      }
    } catch (error) {
      console.error('[CRON] Market snapshot failed:', error.message);
    } finally {
      marketCronRunning = false;
    }
  });
}

module.exports = { registerMarketCron };
