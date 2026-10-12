'use strict';

const cron = require('node-cron');
const { evaluateValuableSymbols } = require('../services/valuableSymbols.engine.cjs');

function isTehranMarketOpen(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const minuteOfDay = Number(values.hour || 0) * 60 + Number(values.minute || 0);
  return ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'].includes(values.weekday) &&
    minuteOfDay >= 540 && minuteOfDay < 750;
}

let running = false;

function registerValuableSymbolsCron() {
  cron.schedule('*/2 * * * *', async () => {
    if (!isTehranMarketOpen()) return;
    if (running) {
      console.warn('[CRON][ValuableSymbols] Previous run still active; skipping tick');
      return;
    }
    running = true;
    try {
      const results = await evaluateValuableSymbols({ limit: 20 });
      console.log('[CRON][ValuableSymbols] Evaluation completed; eligible symbols:', results.length);
    } catch (error) {
      console.error('[CRON][ValuableSymbols] Evaluation failed:', error.message);
    } finally {
      running = false;
    }
  }, { timezone: 'Asia/Tehran' });
}

module.exports = { registerValuableSymbolsCron, isTehranMarketOpen };
