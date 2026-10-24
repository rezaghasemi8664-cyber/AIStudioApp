'use strict';

const axios = require('axios');

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function getTelegramApiBase() {
  const raw = String(process.env.TELEGRAM_API_BASE_URL || '').trim();
  if (!raw) return TELEGRAM_API_BASE;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    const error = new Error('TELEGRAM_API_BASE_URL_INVALID');
    error.code = 'TELEGRAM_API_BASE_URL_INVALID';
    throw error;
  }

  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    const error = new Error('TELEGRAM_API_BASE_URL_INVALID');
    error.code = 'TELEGRAM_API_BASE_URL_INVALID';
    throw error;
  }

  return parsed.origin;
}

function getTelegramConfig() {
  const tokenKey = 'TELEGRAM_' + 'BOT_TOKEN';
  return {
    token: String(process.env[tokenKey] || '').trim(),
    chatId: String(process.env.TELEGRAM_CHANNEL_ID || process.env.TELEGRAM_CHANNEL_USERNAME || '').trim()
  };
}

// This proxy setting is intentionally scoped to Telegram API requests only.
// Supported formats: http://[user:pass@]host:port and https://[user:pass@]host:port.
// The proxy must allow CONNECT tunnelling to api.telegram.org:443.
function getTelegramProxyConfig() {
  const raw = String(process.env.TELEGRAM_PROXY_URL || '').trim();
  if (!raw) return false;

  let proxyUrl;
  try {
    proxyUrl = new URL(raw);
  } catch (_) {
    const error = new Error('TELEGRAM_PROXY_URL_INVALID');
    error.code = 'TELEGRAM_PROXY_URL_INVALID';
    throw error;
  }

  if (!['http:', 'https:'].includes(proxyUrl.protocol) || !proxyUrl.hostname) {
    const error = new Error('TELEGRAM_PROXY_URL_INVALID');
    error.code = 'TELEGRAM_PROXY_URL_INVALID';
    throw error;
  }

  let auth;
  if (proxyUrl.username || proxyUrl.password) {
    try {
      auth = {
        username: decodeURIComponent(proxyUrl.username),
        password: decodeURIComponent(proxyUrl.password)
      };
    } catch (_) {
      const error = new Error('TELEGRAM_PROXY_URL_INVALID');
      error.code = 'TELEGRAM_PROXY_URL_INVALID';
      throw error;
    }
  }

  return {
    protocol: proxyUrl.protocol.slice(0, -1),
    host: proxyUrl.hostname,
    port: Number(proxyUrl.port || (proxyUrl.protocol === 'https:' ? 443 : 80)),
    ...(auth ? { auth } : {})
  };
}

async function requestTelegram(endpoint, data, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 15000;
  const proxy = getTelegramProxyConfig();
  const apiBase = getTelegramApiBase();
  const headers = { ...(options.headers || {}) };
  if (apiBase !== TELEGRAM_API_BASE) {
    const proxySecret = String(process.env.TELEGRAM_PROXY_SECRET || '').trim();
    if (!proxySecret) {
      const error = new Error('TELEGRAM_PROXY_SECRET_MISSING');
      error.code = 'TELEGRAM_PROXY_SECRET_MISSING';
      throw error;
    }
    headers['X-Roniya-Proxy-Key'] = proxySecret;
  }

  let response;
  try {
    response = await axios.request({
      url: endpoint.replace(TELEGRAM_API_BASE, apiBase),
      method: 'POST',
      data,
      headers,
      timeout: timeoutMs,
      proxy,
      maxRedirects: 0,
      validateStatus: () => true
    });
  } catch (_) {
    // Do not rethrow Axios's raw error: it can contain the bot-token URL.
    const error = new Error('TELEGRAM_CONNECTION_FAILED');
    error.code = 'TELEGRAM_CONNECTION_FAILED';
    throw error;
  }

  let payload = response.data;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (_) { payload = null; }
  }

  if (response.status < 200 || response.status >= 300 || !payload || payload.ok !== true) {
    const description = String(payload?.description || ('HTTP_' + response.status));
    const error = new Error('TELEGRAM_SEND_FAILED: ' + description);
    error.code = 'TELEGRAM_SEND_FAILED';
    error.status = response.status;
    throw error;
  }

  return payload.result;
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
  return requestTelegram(endpoint, {
    chat_id: chatId,
    text: message.slice(0, 4096),
    disable_web_page_preview: true,
    disable_notification: options.disableNotification === true
  }, {
    timeoutMs: Number(process.env.TELEGRAM_TIMEOUT_MS) || 15000,
    headers: { 'content-type': 'application/json' }
  });
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

  return requestTelegram(endpoint, form, {
    timeoutMs: Number(process.env.TELEGRAM_TIMEOUT_MS) || 20000
  });
}

module.exports = { getTelegramConfig, sendTelegramMessage, sendTelegramPhoto };
