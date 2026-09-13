'use strict';

const smsConfig = require('../config/sms.config.cjs');
const farazProvider = require('./sms/providers/farazsms.provider.cjs');

const BASE_URL = 'https://api.iranpayamak.com/ws/v1';

function configured() {
  return Boolean(String(process.env.FARAZSMS_API_KEY || '').trim());
}

function normalizeRecipient(value) {
  const raw = String(value || '').trim().replace(/[\s-]/g, '');
  if (/^09\d{9}$/.test(raw)) return raw;
  if (/^989\d{9}$/.test(raw)) return `0${raw.slice(2)}`;
  if (/^\+989\d{9}$/.test(raw)) return `0${raw.slice(3)}`;
  throw new Error('شماره گیرنده نامعتبر است.');
}

async function sendSimple({ recipients, text, sender } = {}) {
  if (!configured()) throw new Error('کلید API فراز اس‌ام‌اس تنظیم نشده است.');
  const list = (Array.isArray(recipients) ? recipients : [recipients]).filter(Boolean).map(normalizeRecipient);
  if (!list.length) throw new Error('حداقل یک گیرنده لازم است.');
  if (!String(text || '').trim()) throw new Error('متن پیامک الزامی است.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), smsConfig.timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}/sms/simple`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Api-Key': process.env.FARAZSMS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipients: list,
        text: String(text).trim(),
        line_number: sender || smsConfig.sender,
        number_format: 'english',
      }),
      signal: controller.signal,
    });
    const rawText = await response.text();
    let data;
    try { data = rawText ? JSON.parse(rawText) : null; } catch { data = { raw: rawText }; }
    if (!response.ok || data?.status !== 'success') {
      const error = new Error(String(data?.messages || data?.message || `FarazSMS HTTP ${response.status}`));
      error.statusCode = response.status;
      error.providerResponse = data;
      throw error;
    }
    return { provider: 'farazsms', status: 'accepted', providerId: data?.data != null ? String(data.data) : null, message: data?.messages || null, raw: data };
  } finally {
    clearTimeout(timer);
  }
}

async function sendPattern(payload) {
  return farazProvider.sendPattern(payload);
}

module.exports = { sendSimple, sendPattern };
