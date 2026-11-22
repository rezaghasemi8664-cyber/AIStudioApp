'use strict';

const prisma = require('../config/prisma.cjs');
const centralCache = require('./centralMarketCache.service.cjs');
const { decryptPassword } = require('./passwordVault.service.cjs');

const API_URL = 'https://api.nerkh.io/v2/prices/json/all';
const TOKEN_CATEGORY = 'services';
const TOKEN_KEY = 'nerkh-api-token';
const SNAPSHOT_KEY = 'nerkh-price-snapshot';
const CACHE_KEY = 'nerkh:prices:active';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let task = null;
let refreshRunning = false;
let ioRef = null;

async function getToken() {
  const setting = await prisma.globalSetting.findUnique({ where: { key: TOKEN_KEY } });
  if (!setting || setting.category !== TOKEN_CATEGORY || !setting.value) return null;
  try {
    return decryptPassword(setting.value);
  } catch (error) {
    console.error('[NERKH] Stored token decryption failed:', error?.name || 'DECRYPTION_ERROR');
    throw new Error('توکن ذخیره‌شده Nerkh قابل رمزگشایی نیست؛ کلید رمزنگاری سرور را بررسی کنید.');
  }
}

async function requestPrices(token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        401: 'توکن Nerkh نامعتبر است.',
        403: 'توکن Nerkh غیرفعال شده است.',
        460: 'سهمیه درخواست‌های Nerkh به پایان رسیده است.',
        404: 'نسخه یا مسیر API سرویس Nerkh پیدا نشد.',
        500: 'سرویس Nerkh با خطای داخلی مواجه است.'
      };
      const error = new Error(messages[response.status] || ('خطای HTTP ' + response.status + ' از Nerkh'));
      error.statusCode = response.status;
      throw error;
    }
    const root = body?.data?.prices || body?.data || body?.prices;
    if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('ساختار پاسخ Nerkh معتبر نیست.');
    return root;
  } finally {
    clearTimeout(timeout);
  }
}

const TOMAN_TO_RIAL = 10;

function getPriceMultiplier(symbol, group, item) {
  const unit = String(item.unit ?? item.currency ?? item.quote_currency ?? '').trim().toLowerCase();
  if (/(rial|irr|ریال)/i.test(unit)) return 1;
  if (/(usd|\$|دلار)/i.test(unit)) return 1;
  // International ounce quotes are denominated in USD, not Toman.
  if (group === 'gold' && /^(OUNCE|XAUUSD|XAGUSD|XAU|XAG)$/i.test(String(symbol))) return 1;
  // Nerkh's domestic gold, currency and crypto quotes are in Toman.
  return TOMAN_TO_RIAL;
}

function normalizeItem(symbol, item, group) {
  if (!item || typeof item !== 'object') return null;
  const multiplier = getPriceMultiplier(symbol, group, item);
  const current = Number(item.current ?? item.price) * multiplier;
  if (!Number.isFinite(current)) return null;
  // Nerkh v2 returns the 24-hour range under min/max["24hour"].
  // Keep aliases for compatibility with older or alternate response shapes.
  const rawMin = Number(item.min?.['24hour'] ?? item.min?.['24h'] ?? item.min_24h ?? item.min24h);
  const rawMax = Number(item.max?.['24hour'] ?? item.max?.['24h'] ?? item.max_24h ?? item.max24h);
  const change = Number(item.ch_24h_percent ?? item.change_24h_percent ?? item.changePercent);
  return {
    symbol: String(symbol),
    group,
    current,
    change24hPercent: Number.isFinite(change) ? change : null,
    min24h: Number.isFinite(rawMin) ? rawMin * multiplier : null,
    max24h: Number.isFinite(rawMax) ? rawMax * multiplier : null,
    update: item.update || item.updated_at || null
  };
}

function normalizePayload(payload) {
  const groups = { gold: [], currency: [], crypto: [] };
  for (const group of Object.keys(groups)) {
    const source = payload[group];
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      groups[group] = Object.entries(source).map(([symbol, item]) => normalizeItem(symbol, item, group)).filter(Boolean);
    }
  }
  const count = groups.gold.length + groups.currency.length + groups.crypto.length;
  if (count < 1) throw new Error('پاسخ Nerkh فاقد قیمت معتبر است.');
  return { groups, fetchedAt: new Date().toISOString(), source: 'NERKH' };
}

async function restoreCache() {
  const cached = centralCache.get(CACHE_KEY);
  if (cached) return cached;
  const setting = await prisma.globalSetting.findUnique({ where: { key: SNAPSHOT_KEY } });
  if (!setting || setting.category !== 'market-cache') return null;
  try {
    const snapshot = JSON.parse(setting.value);
    if (snapshot?.groups) centralCache.set(CACHE_KEY, snapshot);
    return snapshot;
  } catch (_) { return null; }
}

async function refreshPrices({ reason = 'scheduled' } = {}) {
  if (refreshRunning) return { success: false, skipped: true, reason: 'ALREADY_RUNNING' };
  refreshRunning = true;
  try {
    const token = await getToken();
    if (!token) throw new Error('توکن Nerkh در پنل مدیریت ثبت نشده است.');
    const raw = await requestPrices(token);
    const snapshot = normalizePayload(raw);
    await prisma.globalSetting.upsert({
      where: { key: SNAPSHOT_KEY },
      update: { value: JSON.stringify(snapshot), updatedAt: new Date() },
      create: { category: 'market-cache', key: SNAPSHOT_KEY, value: JSON.stringify(snapshot), isPublic: false }
    });
    centralCache.set(CACHE_KEY, snapshot);
    const io = ioRef || global.io;
    if (io && typeof io.emit === 'function') io.emit('nerkh:prices:updated', { snapshot });
    console.log('[NERKH] Price snapshot refreshed; rows=' +
      (snapshot.groups.gold.length + snapshot.groups.currency.length + snapshot.groups.crypto.length) +
      '; reason=' + reason);
    return { success: true, snapshot };
  } catch (error) {
    console.error('[NERKH] Refresh failed; retaining previous snapshot/cache:', error?.message || error);
    return { success: false, error: error.message };
  } finally {
    refreshRunning = false;
  }
}

function getCachedPrices() { return centralCache.get(CACHE_KEY); }

function startNerkhPriceCron(io) {
  ioRef = io || ioRef;
  if (task) return task;
  restoreCache()
    .catch(error => console.error('[NERKH] Cache restore failed:', error.message))
    .finally(() => refreshPrices({ reason: 'startup' }));
  const cron = require('node-cron');
  task = cron.schedule('*/5 * * * *', () => { void refreshPrices({ reason: 'scheduled' }); }, { timezone: 'Asia/Tehran' });
  return task;
}

function stopNerkhPriceCron() {
  if (task) task.stop();
  task = null;
}

module.exports = {
  API_URL, TOKEN_CATEGORY, TOKEN_KEY, getToken, requestPrices, normalizePayload,
  refreshPrices, getCachedPrices, restoreCache, startNerkhPriceCron, stopNerkhPriceCron
};
