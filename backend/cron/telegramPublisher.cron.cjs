'use strict';
const cron = require('node-cron');
const { getTelegramConfig } = require('../services/telegramBotApi.service.cjs');
const { runTelegramPublisherTick } = require('../services/telegramPublisher.service.cjs');
let task = null;
let running = false;
function registerTelegramPublisherCron() {
  if (task) return false;
  const config = getTelegramConfig();
  if (!config.token || !config.chatId) {
    console.log('[CRON][TelegramPublisher] Disabled: secure credentials or channel target are missing.');
    return false;
  }
  task = cron.schedule('*/1 * * * *', async () => {
    if (running) return;
    running = true;
    try { await runTelegramPublisherTick(); }
    catch (error) { console.error('[CRON][TelegramPublisher] Tick failed:', error?.message || error); }
    finally { running = false; }
  }, { timezone: 'Asia/Tehran' });
  console.log('[CRON][TelegramPublisher] Registered; credentials are not logged.');
  return true;
}
function stopTelegramPublisherCron() { if (task) task.stop(); task = null; }
module.exports = { registerTelegramPublisherCron, stopTelegramPublisherCron };
