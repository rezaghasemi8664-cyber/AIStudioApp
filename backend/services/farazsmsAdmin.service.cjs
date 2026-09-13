'use strict';

const smsConfig = require('../config/sms.config.cjs');
const BASE_URL = 'https://api.iranpayamak.com/ws/v1';

function configured() {
  return Boolean(String(process.env.FARAZSMS_API_KEY || '').trim());
}

async function request(path, options = {}) {
  if (!configured()) throw new Error('FARAZSMS_API_KEY تنظیم نشده است.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), smsConfig.timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Api-Key': process.env.FARAZSMS_API_KEY,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!response.ok || data?.status !== 'success') {
      const error = new Error(String(data?.messages || data?.message || `FarazSMS HTTP ${response.status}`));
      error.statusCode = response.status;
      error.providerResponse = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function getBalance() {
  const result = await request('/account/balance');
  return { amount: result?.data?.balance_amount ?? null, raw: result };
}

async function getProfile() {
  const result = await request('/account/profile');
  const data = result?.data || {};
  return {
    displayName: data.displayName || data.display_name || null,
    mobile: data.mobile || null,
    raw: result,
  };
}

async function getStatus() {
  const startedAt = Date.now();
  if (!configured()) return { configured: false, reachable: false, latencyMs: null, message: 'کلید API تنظیم نشده است.' };
  try {
    await getBalance();
    return { configured: true, reachable: true, latencyMs: Date.now() - startedAt, sender: smsConfig.sender };
  } catch (error) {
    return { configured: true, reachable: false, latencyMs: Date.now() - startedAt, sender: smsConfig.sender, message: error.message };
  }
}

module.exports = { getBalance, getProfile, getStatus };
