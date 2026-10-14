'use strict';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function getTelegramConfig() {
  const tokenKey = 'TELEGRAM_' + 'BOT_TOKEN';
  return {
    token: String(process.env[tokenKey] || '').trim(),
    chatId: String(process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHANNEL_USERNAME || '').trim()
  };
}

async function sendTelegramMessage(text, options = {}) {
  const { token, chatId } = getTelegramConfig();
  if (!token || !chatId) {
    const error = new Error('TELEGRAM_NOT_CONFIGURED');
    error.code = 'TELEGRAM_NOT_CONFIGURED';
    throw error;
  }
  const message = String(text || '').trim();
  if (!message) throw new Error('TELEGRAM_MESSAGE_EMPTY');

  const endpoint = [TELEGRAM_API_BASE, '/bot', token, '/sendMessage'].join('');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message.slice(0, 4096),
      disable_web_page_preview: true,
      disable_notification: options.disableNotification === true
    }),
    signal: AbortSignal.timeout(Number(process.env.TELEGRAM_TIMEOUT_MS) || 15000)
  });

  let payload;
  try { payload = await response.json(); } catch (_) { payload = null; }
  if (!response.ok || !payload || payload.ok !== true) {
    const description = String(payload?.description || ('HTTP_' + response.status));
    const error = new Error('TELEGRAM_SEND_FAILED: ' + description);
    error.code = 'TELEGRAM_SEND_FAILED';
    error.status = response.status;
    throw error;
  }
  return payload.result;
}

module.exports = { getTelegramConfig, sendTelegramMessage };
