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
      await runTelegramPublisherTick();
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
