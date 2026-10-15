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

async function refreshIfRequired() {
  if (running) {
    console.warn('[ALL-SYMBOLS-SNAPSHOT] Refresh already running; skipping overlapping attempt');
    return;
  }

  running = true;
  try {
    const hasSnapshot = await snapshotService.hasSnapshot();
    if (!hasSnapshot) {
      console.warn('[ALL-SYMBOLS-SNAPSHOT] No valid database snapshot exists; bootstrapping from BRSAPI AllSymbols regardless of market hours');
      await snapshotService.refreshSnapshot();
      return;
    }

    if (!isMarketOpen()) return;
    await snapshotService.refreshSnapshot();
  } catch (error) {
    console.error('[ALL-SYMBOLS-SNAPSHOT] Refresh failed; previous valid snapshot retained and next attempt will retry:', error.message);
  } finally {
    running = false;
  }
}

function registerAllSymbolsSnapshotCron() {
  // Run immediately at startup so an empty database is populated even on holidays
  // or outside the Tehran market session.
  refreshIfRequired().catch((error) => {
    console.error('[ALL-SYMBOLS-SNAPSHOT] Startup bootstrap failed:', error.message);
  });

  // Every minute: always check for a missing snapshot; refresh existing snapshots
  // only during market hours.
  cron.schedule('* * * * *', refreshIfRequired, { timezone: MARKET_TZ });
}

module.exports = { registerAllSymbolsSnapshotCron, isMarketOpen, refreshIfRequired };
