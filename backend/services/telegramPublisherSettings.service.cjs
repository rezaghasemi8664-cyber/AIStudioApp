'use strict';

const prisma = require('../config/prisma.cjs');

const SETTINGS_KEY = 'telegram.publisher.settings.v1';
const HISTORY_KEY = 'telegram.publisher.history.v1';
const TIMEZONE = 'Asia/Tehran';
const WEEKDAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const TRADING_DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'];

const DEFAULT_SETTINGS = Object.freeze({
  timezone: TIMEZONE,
  valuable: { enabled: true, intervalMinutes: 15, startTime: '09:00', endTime: '12:30', days: TRADING_DAYS, maxSymbolsPerMessage: 10 },
  scalping: { enabled: true, intervalMinutes: 5, startTime: '09:00', endTime: '12:30', days: TRADING_DAYS, maxSymbolsPerMessage: 10 },
  index: { enabled: true, intervalMinutes: 60, startTime: '09:15', endTime: '12:30', days: TRADING_DAYS },
  summary: { enabled: true, publishTime: '13:30', days: TRADING_DAYS }
});

function tehranParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function tehranDateKey(date = new Date()) {
  const p = tehranParts(date);
  return p.year + '-' + p.month + '-' + p.day;
}

function tehranTime(date = new Date()) {
  const p = tehranParts(date);
  return p.hour + ':' + p.minute;
}

function allowedDays(value, fallback = TRADING_DAYS) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.map(day => String(day)))].filter(day => WEEKDAYS.includes(day));
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalizeGroup = (name, defaults) => {
    const input = source[name] && typeof source[name] === 'object' && !Array.isArray(source[name]) ? source[name] : {};
    return {
      ...defaults,
      ...input,
      enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled,
      days: allowedDays(input.days, defaults.days)
    };
  };
  const valuable = normalizeGroup('valuable', DEFAULT_SETTINGS.valuable);
  valuable.startTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(valuable.startTime)) ? String(valuable.startTime) : DEFAULT_SETTINGS.valuable.startTime;
  valuable.endTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(valuable.endTime)) ? String(valuable.endTime) : DEFAULT_SETTINGS.valuable.endTime;
  valuable.intervalMinutes = boundedInteger(valuable.intervalMinutes, DEFAULT_SETTINGS.valuable.intervalMinutes, 1, 720);
  valuable.maxSymbolsPerMessage = boundedInteger(valuable.maxSymbolsPerMessage, DEFAULT_SETTINGS.valuable.maxSymbolsPerMessage, 1, 20);
  const scalping = normalizeGroup('scalping', DEFAULT_SETTINGS.scalping);
  scalping.startTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(scalping.startTime)) ? String(scalping.startTime) : DEFAULT_SETTINGS.scalping.startTime;
  scalping.endTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(scalping.endTime)) ? String(scalping.endTime) : DEFAULT_SETTINGS.scalping.endTime;
  scalping.intervalMinutes = boundedInteger(scalping.intervalMinutes, DEFAULT_SETTINGS.scalping.intervalMinutes, 1, 720);
  scalping.maxSymbolsPerMessage = boundedInteger(scalping.maxSymbolsPerMessage, DEFAULT_SETTINGS.scalping.maxSymbolsPerMessage, 1, 20);
  const index = normalizeGroup('index', DEFAULT_SETTINGS.index);
  index.intervalMinutes = boundedInteger(index.intervalMinutes, DEFAULT_SETTINGS.index.intervalMinutes, 1, 720);
  index.startTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(index.startTime)) ? String(index.startTime) : DEFAULT_SETTINGS.index.startTime;
  index.endTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(index.endTime)) ? String(index.endTime) : DEFAULT_SETTINGS.index.endTime;
  const summary = normalizeGroup('summary', DEFAULT_SETTINGS.summary);
  summary.publishTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(summary.publishTime)) ? String(summary.publishTime) : DEFAULT_SETTINGS.summary.publishTime;
  return { timezone: TIMEZONE, valuable, scalping, index, summary };
}

function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ساختار تنظیمات تلگرام نامعتبر است.');
  for (const groupName of ['valuable', 'scalping', 'index', 'summary']) {
    const group = value[groupName];
    if (!group || typeof group !== 'object' || Array.isArray(group)) throw new Error('تنظیمات بخش ' + groupName + ' ارسال نشده است.');
    if (typeof group.enabled !== 'boolean') throw new Error('وضعیت فعال/غیرفعال هر بخش باید بولی باشد.');
    if (!Array.isArray(group.days) || group.days.some(day => !WEEKDAYS.includes(day))) throw new Error('روزهای انتشار نامعتبر هستند.');
  }
  for (const groupName of ['valuable', 'scalping', 'index']) {
    const n = Number(value[groupName].intervalMinutes);
    if (!Number.isInteger(n) || n < 1 || n > 720) throw new Error('فاصله انتشار باید بین ۱ تا ۷۲۰ دقیقه باشد.');
  }
  for (const groupName of ['valuable', 'scalping']) {
    const n = Number(value[groupName].maxSymbolsPerMessage);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw new Error('حداکثر نماد هر پیام باید بین ۱ تا ۲۰ باشد.');
  }
  for (const groupName of ['valuable', 'scalping', 'index']) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value[groupName].endTime || ''))) throw new Error('زمان پایان انتشار بخش‌ها نامعتبر است.');
  }
  for (const groupName of ['valuable', 'scalping']) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value[groupName].startTime || ''))) throw new Error('زمان شروع چرخه انتشار نامعتبر است.');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.index.startTime || ''))) throw new Error('زمان شروع انتشار شاخص‌ها نامعتبر است.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.summary.publishTime || ''))) throw new Error('زمان انتشار خلاصه بازار نامعتبر است.');
  return normalizeSettings(value);
}

function isAllowedWeekday(date, days) {
  return allowedDays(days, []).includes(tehranParts(date).weekday);
}

function isBeforeEndTime(date, endTime) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(endTime || ''));
  if (!match) return false;
  const p = tehranParts(date);
  const current = Number(p.hour) * 60 + Number(p.minute);
  const end = Number(match[1]) * 60 + Number(match[2]);
  return current < end;
}

function isIntervalDue(date, startTime, intervalMinutes) {
  const [startHour, startMinute] = String(startTime || '09:15').split(':').map(Number);
  const p = tehranParts(date);
  const current = Number(p.hour) * 60 + Number(p.minute);
  const start = startHour * 60 + startMinute;
  const interval = boundedInteger(intervalMinutes, 60, 1, 720);
  return current >= start && (current - start) % interval === 0;
}

async function readJsonConfig(key, fallback) {
  const row = await prisma.appConfig.findUnique({ where: { key } });
  try {
    const parsed = JSON.parse(row?.value || 'null');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

async function getTelegramPublisherSettings() {
  return normalizeSettings(await readJsonConfig(SETTINGS_KEY, DEFAULT_SETTINGS));
}

async function saveTelegramPublisherSettings(value) {
  const settings = validateSettings(value);
  await prisma.appConfig.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: JSON.stringify(settings) },
    update: { value: JSON.stringify(settings), updatedAt: new Date() }
  });
  return settings;
}

async function getTelegramPublisherHistory(now = new Date()) {
  const date = tehranDateKey(now);
  const current = await readJsonConfig(HISTORY_KEY, null);
  if (current && current.date === date && Array.isArray(current.entries)) return current;
  const empty = { date, timezone: TIMEZONE, entries: [] };
  await prisma.appConfig.upsert({
    where: { key: HISTORY_KEY },
    create: { key: HISTORY_KEY, value: JSON.stringify(empty) },
    update: { value: JSON.stringify(empty), updatedAt: new Date() }
  });
  return empty;
}

async function recordTelegramPublisherMessage(type, status, details = {}, now = new Date()) {
  const date = tehranDateKey(now);
  const history = await getTelegramPublisherHistory(now);
  const entry = {
    id: String(now.getTime()) + '-' + Math.random().toString(36).slice(2, 8),
    type: String(type || 'unknown'),
    status: status === 'success' ? 'success' : 'failure',
    date,
    time: tehranTime(now),
    timestamp: now.toISOString(),
    messageTitle: String(details.messageTitle || '').slice(0, 180),
    error: status === 'success' ? null : String(details.error || 'ارسال ناموفق بود.').slice(0, 500)
  };
  const next = { date, timezone: TIMEZONE, entries: [...history.entries, entry].slice(-500) };
  await prisma.appConfig.upsert({
    where: { key: HISTORY_KEY },
    create: { key: HISTORY_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next), updatedAt: new Date() }
  });
  return entry;
}

module.exports = {
  SETTINGS_KEY, HISTORY_KEY, TIMEZONE, WEEKDAYS, TRADING_DAYS, DEFAULT_SETTINGS,
  tehranParts, tehranDateKey, tehranTime, isAllowedWeekday, isIntervalDue, isBeforeEndTime,
  normalizeSettings, validateSettings, getTelegramPublisherSettings,
  saveTelegramPublisherSettings, getTelegramPublisherHistory, recordTelegramPublisherMessage
};
