'use strict';

const cron = require('node-cron');
const snapshotService = require('../services/allSymbolsSnapshot.service.cjs');
const MARKET_TZ = 'Asia/Tehran';
const OPEN_MINUTE = 9 * 60;
const CLOSE_MINUTE = 12 * 60 + 30;
const TRADING_DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'];

function isMarketOpen(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: MARKET_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minute = Number(values.hour || 0) * 60 + Number(values.minute || 0);
  return TRADING_DAYS.includes(values.weekday) && minute >= OPEN_MINUTE && minute < CLOSE_MINUTE;
}
let running = false;
function registerAllSymbolsSnapshotCron() {
  snapshotService.ensureTable().catch((error) => console.error('[ALL-SYMBOLS-SNAPSHOT] Table initialization failed:', error.message));
  cron.schedule('* * * * *', async () => {
    if (!isMarketOpen()) return;
    if (running) {
      console.warn('[ALL-SYMBOLS-SNAPSHOT] Previous refresh is still running; skipping this minute');
      return;
    }
    running = true;
    try {
      await snapshotService.refreshSnapshot();
    } catch (error) {
      console.error('[ALL-SYMBOLS-SNAPSHOT] Refresh failed; previous snapshot retained:', error.message);
    } finally { running = false; }
  }, { timezone: MARKET_TZ });
}
module.exports = { registerAllSymbolsSnapshotCron, isMarketOpen };
