'use strict';

const cron = require('node-cron');
const optionsMarketService = require('../services/optionsMarketSnapshot.service.cjs');

let registered = false;
const TEHRAN_TIME_ZONE = 'Asia/Tehran';
const TRADING_DAYS = new Set(['Sat', 'Sun', 'Mon', 'Tue', 'Wed']);
const MARKET_OPEN_MINUTE = 9 * 60;
const MARKET_CLOSE_MINUTE = 12 * 60 + 30;

function isOptionsMarketTradingWindow(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TEHRAN_TIME_ZONE,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const minutesOfDay = Number(values.hour) * 60 + Number(values.minute);
    return TRADING_DAYS.has(values.weekday) &&
      minutesOfDay >= MARKET_OPEN_MINUTE &&
      minutesOfDay < MARKET_CLOSE_MINUTE;
  } catch (error) {
    console.error('[CRON][OptionsMarket] Could not determine Tehran trading window:', error.message);
    return false;
  }
}

function registerOptionsMarketCron(io) {
  if (registered) return;
  registered = true;

  cron.schedule('* * * * *', async () => {
    // Never call BRS outside the Tehran exchange's regular trading days/hours.
    if (!isOptionsMarketTradingWindow()) return;

    try {
      // The scheduler is the sole writer. User requests only read the stored snapshot.
      await optionsMarketService.refreshOptionsMarketSnapshot(io || null);
    } catch (error) {
      console.error('[CRON][OptionsMarket] Tick failed:', error.message);
    }
  }, { timezone: TEHRAN_TIME_ZONE });

  console.log('[CRON] options-market-refresh registered (every minute; BRS refresh only Sat-Wed, 09:00-12:30 Asia/Tehran)');
}

module.exports = { registerOptionsMarketCron, isOptionsMarketTradingWindow };
