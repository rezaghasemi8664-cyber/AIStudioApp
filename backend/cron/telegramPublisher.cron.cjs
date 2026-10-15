'use strict';
const cron = require('node-cron');
const { getTelegramConfig } = require('../services/telegramBotApi.service.cjs');
const { runTelegramPublisherTick } = require('../services/telegramPublisher.service.cjs');

let task = null;
let running = false;

function registerTelegramPublisherCron() {
  if (task) return false;

  // Always register the scheduler. Credentials can be added/fixed after the
  // process starts, and manual publishing may work while this cron would
  // otherwise remain permanently disabled until another restart.
  const config = getTelegramConfig();
  if (!config.token || !config.chatId) {
    console.warn('[CRON][TelegramPublisher] Credentials/channel target are missing at startup; scheduler will keep checking and retry when configured.');
  }

  task = cron.schedule('*/1 * * * *', async () => {
    if (running) return;
    running = true;
    try {
      const currentConfig = getTelegramConfig();
      if (!currentConfig.token || !currentConfig.chatId) {
        console.warn('[CRON][TelegramPublisher] Skipping tick: credentials or channel target are not configured.');
        return;
      }
      const result = await runTelegramPublisherTick();
      const outcomes = Array.isArray(result?.outcomes) ? result.outcomes : [];
      const summary = outcomes.map(item => {
        if (item.error) return item.name + '=ERROR(' + item.error + ')';
        if (item.published || item.success === true) return item.name + '=PUBLISHED';
        return item.name + '=SKIPPED(' + String(item.reason || 'NO_CHANGE') + ')';
      }).join(' | ');
      console.log('[CRON][TelegramPublisher] Tick completed at ' + new Date().toISOString() + ': ' + (summary || 'no outcomes'));
    } catch (error) {
      console.error('[CRON][TelegramPublisher] Tick failed:', error?.message || error);
    } finally {
      running = false;
    }
  }, { timezone: 'Asia/Tehran' });

  console.log('[CRON][TelegramPublisher] Registered; schedule timezone is Asia/Tehran.');
  return true;
}

function stopTelegramPublisherCron() {
  if (task) task.stop();
  task = null;
}

module.exports = { registerTelegramPublisherCron, stopTelegramPublisherCron };
