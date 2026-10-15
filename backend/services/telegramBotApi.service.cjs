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


async function sendTelegramPhoto(buffer, mimeType, caption, options = {}) {
  const { token, chatId } = getTelegramConfig();
  if (!token || !chatId) {
    const error = new Error('TELEGRAM_NOT_CONFIGURED');
    error.code = 'TELEGRAM_NOT_CONFIGURED';
    throw error;
  }
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('IMAGE_REQUIRED');
  const endpoint = [TELEGRAM_API_BASE, '/bot', token, '/sendPhoto'].join('');
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', String(caption || '').trim().slice(0, 1024));
  form.append('disable_notification', options.disableNotification === true ? 'true' : 'false');
  const type = String(mimeType || 'image/jpeg');
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  form.append('photo', new Blob([buffer], { type }), 'roniya-ad.' + extension);
  const response = await fetch(endpoint, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(Number(process.env.TELEGRAM_TIMEOUT_MS) || 20000)
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

module.exports = { getTelegramConfig, sendTelegramMessage, sendTelegramPhoto };
