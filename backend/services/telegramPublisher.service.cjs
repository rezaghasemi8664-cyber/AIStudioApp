'use strict';

const prisma = require('../config/prisma.cjs');
const { getStoredValuableSymbols } = require('./valuableSymbols.engine.cjs');
const { sendTelegramMessage, getTelegramConfig } = require('./telegramBotApi.service.cjs');
const telegramAdMessageService = require('./telegramAdMessage.service.cjs');
const { getTelegramPublisherSettings, getTelegramPublisherHistory, isAllowedWeekday, isIntervalDue, getDueIntervalSlot, isBeforeEndTime, recordTelegramPublisherMessage } = require('./telegramPublisherSettings.service.cjs');

const STATE_KEY = 'telegram.publisher.state.v1';
const TEHRAN_TIMEZONE = 'Asia/Tehran';
const MAX_INDEX_AGE_MS = 5 * 60 * 1000;
const MAX_SYMBOL_PRICE_AGE_MS = 5 * 60 * 1000;
const MAX_VALUABLE_EVALUATION_AGE_MS = 10 * 60 * 1000;
const IMPORTANT_SCORE_DELTA = 10;

function tehranParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TEHRAN_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}

function tehranDateKey(date = new Date()) {
  const p = tehranParts(date);
  return p.year + '-' + p.month + '-' + p.day;
}

function tehranSlot(date = new Date()) {
  const p = tehranParts(date);
  return p.hour + ':' + p.minute;
}

function isTradingWeekday(date = new Date()) {
  return ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'].includes(tehranParts(date).weekday);
}

function isTradingSession(date = new Date()) {
  const p = tehranParts(date);
  const minute = Number(p.hour) * 60 + Number(p.minute);
  return isTradingWeekday(date) && minute >= 540 && minute < 750;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function ageMs(value, now = Date.now()) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value || '').getTime();
  return Number.isFinite(timestamp) ? now - timestamp : Infinity;
}

function isFresh(value, maxAgeMs, now = Date.now()) {
  const age = ageMs(value, now);
  return age >= -60 * 1000 && age <= maxAgeMs;
}

function formatNumber(value, maximumFractionDigits = 2) {
  const number = toNumber(value);
  return number === null ? 'ناموجود' : number.toLocaleString('fa-IR', { maximumFractionDigits });
}

function formatPercent(change, current) {
  const delta = toNumber(change);
  const index = toNumber(current);
  if (delta === null || !(index > 0) || !(index - delta > 0)) return null;
  return (delta / (index - delta)) * 100;
}

function getCurrentMarketDateUtc(date = new Date()) {
  const p = tehranParts(date);
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
}

function parseState(row) {
  try {
    const parsed = JSON.parse(row?.value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

async function loadState() {
  const row = await prisma.appConfig.findUnique({ where: { key: STATE_KEY } });
  return parseState(row);
}

async function saveState(state) {
  await prisma.appConfig.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value: JSON.stringify(state) },
    update: { value: JSON.stringify(state), updatedAt: new Date() }
  });
}

function normalizeValuableResults(results) {
  if (!Array.isArray(results)) return [];
  return results.filter(item =>
    item && item.symbol && toNumber(item.currentPrice) > 0 &&
    item.marketUpdatedAt && Number.isFinite(new Date(item.marketUpdatedAt).getTime())
  ).slice(0, 20);
}

function getImportantSymbolChanges(currentResults, previousMap = {}) {
  const changes = [];
  for (const item of currentResults) {
    const symbol = String(item.symbol || '').trim();
    if (!symbol) continue;
    const score = toNumber(item.score);
    const previous = previousMap[symbol];
    if (!previous) {
      changes.push({ type: 'new', item });
      continue;
    }
    const oldScore = toNumber(previous.score);
    if (score !== null && oldScore !== null && score - oldScore >= IMPORTANT_SCORE_DELTA) {
      changes.push({ type: 'score', item, previousScore: oldScore });
    }
  }
  return changes;
}

function renderValuableChanges(changes, date = new Date(), maxSymbols = 20) {
  const lines = [
    '📊 رونیا | تغییرات مهم نمادهای ارزنده',
    'تاریخ: ' + new Intl.DateTimeFormat('fa-IR', { timeZone: TEHRAN_TIMEZONE, dateStyle: 'short' }).format(date),
    ''
  ];
  for (const change of changes.slice(0, maxSymbols)) {
    const item = change.item;
    lines.push((change.type === 'new' ? '🆕 ورود به فهرست' : '⬆️ افزایش امتیاز مهم') + ': ' + (item.name || item.symbol) + ' (' + item.symbol + ')');
    lines.push('امتیاز: ' + formatNumber(item.score, 0) + (change.type === 'score' ? '؛ قبلی: ' + formatNumber(change.previousScore, 0) : ''));
    lines.push('قیمت آخر ثبت‌شده: ' + formatNumber(item.currentPrice));
    if (toNumber(item.targetPrice) > 0) lines.push('هدف محاسباتی: ' + formatNumber(item.targetPrice));
    if (toNumber(item.stopLoss) > 0) lines.push('سطح ابطال/حمایت: ' + formatNumber(item.stopLoss));
    lines.push('');
  }
  lines.push('اطلاعات بر پایه داده‌های ثبت‌شده سامانه است؛ سیگنال قطعی یا تضمین سود نیست.');
  return lines.join('\n').trim().slice(0, 3900);
}

function renderIndexMessage(row, date = new Date()) {
  let raw = {};
  try { raw = JSON.parse(row.dataJson || '{}'); } catch (_) { raw = {}; }
  const overall = toNumber(row.overallIndex);
  const overallChange = toNumber(row.overallChange);
  const equal = toNumber(row.equalIndex);
  const equalChange = toNumber(row.equalChange);
  const overallPercent = toNumber(raw.changePercent ?? raw.indexChangePercent) ?? formatPercent(overallChange, overall);
  const equalPercent = toNumber(raw.equalWeightedChangePercent ?? raw.equalWeightChangePercent) ?? formatPercent(equalChange, equal);
  const time = new Intl.DateTimeFormat('fa-IR', { timeZone: TEHRAN_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  const day = new Intl.DateTimeFormat('fa-IR', { timeZone: TEHRAN_TIMEZONE, dateStyle: 'short' }).format(date);
  const signed = value => value === null ? 'ناموجود' : (value > 0 ? '+' : '') + formatNumber(value);
  const signedPercent = value => value === null ? 'ناموجود' : (value > 0 ? '+' : '') + formatNumber(value, 2) + '٪';
  return [
    '📈 رونیا | گزارش شاخص‌های بورس',
    'زمان ثبت آخرین داده در دیتابیس: ' + day + ' | ساعت تهران: ' + time,
    '',
    'شاخص کل: ' + formatNumber(overall, 0),
    'تغییر عددی: ' + signed(overallChange) + ' | تغییر درصدی: ' + signedPercent(overallPercent),
    '',
    'شاخص هم‌وزن: ' + formatNumber(equal, 0),
    'تغییر عددی: ' + signed(equalChange) + ' | تغییر درصدی: ' + signedPercent(equalPercent),
    '',
    'منبع: آخرین تصویر بازار تأییدشده سامانه رونیا.'
  ].join('\n');
}

function renderSummaryMessage(row) {
  const content = String(row?.content || row?.summary || '').trim();
  if (!content) return null;
  const sourceDate = row?.summaryDate || row?.date || row?.createdAt;
  if (!sourceDate || !Number.isFinite(new Date(sourceDate).getTime())) return null;
  const formatDate = value => new Intl.DateTimeFormat('fa-IR', {
    timeZone: TEHRAN_TIMEZONE, dateStyle: 'short'
  }).format(new Date(value));
  const formatDateTime = value => new Intl.DateTimeFormat('fa-IR', {
    timeZone: TEHRAN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(value));
  const created = row?.createdAt || row?.date || sourceDate;
  return ('🧾 رونیا | آخرین خلاصه ذخیره‌شده بازار بورس\nتاریخ بازار: ' + formatDate(sourceDate) +
    '\nزمان ثبت خلاصه در دیتابیس: ' + formatDateTime(created) + '\n\n' + content).slice(0, 3900);
}

async function publishIndexIfScheduled(now = new Date(), suppliedSettings) {
  const settings = suppliedSettings || await getTelegramPublisherSettings();
  const schedule = settings.index;
  if (!schedule.enabled) return { skipped: true, reason: 'DISABLED_BY_ADMIN' };
  if (!isAllowedWeekday(now, schedule.days)) return { skipped: true, reason: 'WEEKDAY_NOT_ENABLED' };
  if (!isBeforeEndTime(now, schedule.endTime)) return { skipped: true, reason: 'PUBLISHING_END_TIME_REACHED' };
  const scheduledTime = getDueIntervalSlot(now, schedule.startTime, schedule.intervalMinutes, 2);
  if (!scheduledTime) return { skipped: true, reason: 'NOT_AN_INDEX_SLOT' };

  const state = await loadState();
  const daySlot = tehranDateKey(now) + '@' + scheduledTime;
  if (state.lastIndexSlot === daySlot) return { skipped: true, reason: 'ALREADY_PUBLISHED' };

  const row = await prisma.marketCurrent.findFirst({ orderBy: [{ updatedAt: 'desc' }, { marketDate: 'desc' }] });
  if (!row || !(toNumber(row.overallIndex) > 0) || !(toNumber(row.equalIndex) > 0)) {
    return { skipped: true, reason: 'NO_VALID_STORED_MARKET_SNAPSHOT' };
  }

  await sendAndRecord('index', renderIndexMessage(row, row.updatedAt || now), now);
  await saveState({ ...state, lastIndexSlot: daySlot });
  return { published: true, slot: daySlot };
}

async function publishValuableChangesIfAny(now = new Date(), suppliedSettings) {
  const settings = suppliedSettings || await getTelegramPublisherSettings();
  const schedule = settings.valuable;
  if (!schedule.enabled) return { skipped: true, reason: 'DISABLED_BY_ADMIN' };
  if (!isAllowedWeekday(now, schedule.days)) return { skipped: true, reason: 'WEEKDAY_NOT_ENABLED' };
  if (!isBeforeEndTime(now, schedule.endTime)) return { skipped: true, reason: 'PUBLISHING_END_TIME_REACHED' };
  const scheduledTime = getDueIntervalSlot(now, schedule.startTime, schedule.intervalMinutes, 2);
  if (!scheduledTime) return { skipped: true, reason: 'NOT_IN_PUBLISH_CYCLE' };

  const slot = tehranDateKey(now) + '@' + scheduledTime;
  const state = await loadState();
  if (state.lastValuableSlot === slot) return { skipped: true, reason: 'ALREADY_PUBLISHED_THIS_SLOT' };

  const stored = await getStoredValuableSymbols({ force: true });
  if (!stored?.evaluatedAt) return { skipped: true, reason: 'NO_STORED_VALUABLE_EVALUATION' };
  const current = normalizeValuableResults(stored.results);
  if (!current.length) return { skipped: true, reason: 'NO_FRESH_VALUABLE_RESULTS' };

  const selected = current.slice(0, schedule.maxSymbolsPerMessage);
  const lines = [
    '📊 رونیا | آخرین فهرست ذخیره‌شده نمادهای ارزنده',
    'زمان ارزیابی ثبت‌شده: ' + new Intl.DateTimeFormat('fa-IR', { timeZone: TEHRAN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(stored.evaluatedAt)),
    'قیمت هر نماد همراه با زمان ثبت قیمت اصلی آن نمایش داده می‌شود.',
    ''
  ];
  for (const item of selected) {
    lines.push('🔹 ' + (item.name || item.symbol) + ' (' + item.symbol + ')');
    lines.push('امتیاز: ' + formatNumber(item.score, 0) + ' | آخرین قیمت ثبت‌شده: ' + formatNumber(item.currentPrice));
    lines.push('زمان ثبت قیمت: ' + new Intl.DateTimeFormat('fa-IR', { timeZone: TEHRAN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(item.marketUpdatedAt)));
    if (toNumber(item.targetPrice) > 0) lines.push('هدف محاسباتی: ' + formatNumber(item.targetPrice));
    if (toNumber(item.stopLoss) > 0) lines.push('سطح ابطال/حمایت: ' + formatNumber(item.stopLoss));
    lines.push('');
  }
  lines.push('این پیام بازتاب آخرین داده‌های ذخیره‌شده است؛ زمان هر قیمت را بررسی کنید. سیگنال قطعی یا تضمین سود نیست.');

  await sendAndRecord('valuable', lines.join('\n').slice(0, 3900), now);
  const nextMap = {};
  for (const item of current) nextMap[item.symbol] = { score: toNumber(item.score) };
  await saveState({
    ...state,
    valuableSymbols: nextMap,
    valuableEvaluatedAt: stored.evaluatedAt,
    lastValuableSlot: slot,
    lastValuablePublishedAt: now.toISOString()
  });
  return { published: true, symbols: selected.length, slot };
}

async function publishScalpingOpportunitiesIfAny(now = new Date(), suppliedSettings) {
  const settings = suppliedSettings || await getTelegramPublisherSettings();
  const schedule = settings.scalping;
  if (!schedule.enabled) return { skipped: true, reason: 'DISABLED_BY_ADMIN' };
  if (!isAllowedWeekday(now, schedule.days)) return { skipped: true, reason: 'WEEKDAY_NOT_ENABLED' };
  if (!isBeforeEndTime(now, schedule.endTime)) return { skipped: true, reason: 'PUBLISHING_END_TIME_REACHED' };
  const scheduledTime = getDueIntervalSlot(now, schedule.startTime, schedule.intervalMinutes, 2);
  if (!scheduledTime) return { skipped: true, reason: 'NOT_IN_PUBLISH_CYCLE' };

  const slot = tehranDateKey(now) + '@' + scheduledTime;
  const state = await loadState();
  if (state.lastScalpingSlot === slot) return { skipped: true, reason: 'ALREADY_PUBLISHED_THIS_SLOT' };

  const rows = await prisma.marketScalpingOpportunity.findMany({
    where: { status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: [{ updatedAt: 'desc' }, { marketDate: 'desc' }],
    take: 100
  });
  const latestBySymbol = new Map();
  for (const item of rows) {
    const symbol = String(item?.symbol || '').trim();
    if (!symbol || latestBySymbol.has(symbol) || !(toNumber(item.currentPrice) > 0)) continue;
    latestBySymbol.set(symbol, item);
  }
  const valid = [...latestBySymbol.values()];
  if (!valid.length) return { skipped: true, reason: 'NO_FRESH_ACTIVE_SCALPING_OPPORTUNITIES' };

  const selected = valid.slice(0, schedule.maxSymbolsPerMessage);
  const lines = [
    '⚡ رونیا | آخرین فرصت‌های ذخیره‌شده نوسان‌گیری',
    'این فهرست از رکوردهای ذخیره‌شده دیتابیس تهیه شده؛ زمان ثبت هر فرصت درج شده است.',
    ''
  ];
  for (const item of selected) {
    lines.push('🔹 ' + (item.name || item.symbol) + ' (' + item.symbol + ')');
    lines.push('نوع سیگنال: ' + (item.signal || 'نامشخص') + ' | امتیاز: ' + formatNumber(item.score, 0));
    lines.push('آخرین قیمت ثبت‌شده: ' + formatNumber(item.currentPrice));
    lines.push('تاریخ بازار: ' + new Intl.DateTimeFormat('fa-IR', { timeZone: TEHRAN_TIMEZONE, dateStyle: 'short' }).format(new Date(item.marketDate)) +
      ' | زمان ثبت فرصت: ' + new Intl.DateTimeFormat('fa-IR', { timeZone: TEHRAN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(item.updatedAt)));
    if (toNumber(item.entryPrice) > 0) lines.push('ورود محاسباتی: ' + formatNumber(item.entryPrice));
    if (toNumber(item.takeProfit) > 0) lines.push('هدف محاسباتی: ' + formatNumber(item.takeProfit));
    if (toNumber(item.stopLoss) > 0) lines.push('سطح ابطال: ' + formatNumber(item.stopLoss));
    if (item.recommendationText) lines.push(String(item.recommendationText).slice(0, 250));
    lines.push('');
  }
  lines.push('فرصت‌های منقضی‌شده حذف شده‌اند؛ داده‌های نمایش‌داده‌شده آخرین رکوردهای ذخیره‌شده هستند و تضمین سود نیستند.');

  await sendAndRecord('scalping', lines.join('\n').slice(0, 3900), now);
  const next = {};
  for (const item of valid) {
    const symbol = String(item.symbol).trim();
    if (!symbol) continue;
    next[symbol] = {
      signal: String(item.signal || '').toUpperCase(),
      entryPrice: toNumber(item.entryPrice),
      takeProfit: toNumber(item.takeProfit),
      stopLoss: toNumber(item.stopLoss),
      score: toNumber(item.score)
    };
  }
  await saveState({
    ...state,
    scalpingOpportunities: next,
    scalpingCheckedAt: now.toISOString(),
    lastScalpingSlot: slot,
    lastScalpingPublishedAt: now.toISOString()
  });
  return { published: true, symbols: selected.length, slot };
}

async function publishTodaySummaryIfReady(now = new Date(), suppliedSettings) {
  const settings = suppliedSettings || await getTelegramPublisherSettings();
  const schedule = settings.summary;
  if (!schedule.enabled) return { skipped: true, reason: 'DISABLED_BY_ADMIN' };
  if (!isAllowedWeekday(now, schedule.days)) return { skipped: true, reason: 'WEEKDAY_NOT_ENABLED' };
  if (tehranSlot(now) < schedule.publishTime) return { skipped: true, reason: 'BEFORE_SUMMARY_SLOT' };
  const state = await loadState();
  const row = await prisma.marketSummary.findFirst({ orderBy: [{ summaryDate: 'desc' }, { createdAt: 'desc' }] });
  if (!row) return { skipped: true, reason: 'NO_STORED_MARKET_SUMMARY' };
  const identity = tehranDateKey(now) + '#' + String(row.id);
  if (state.lastSummaryIdentity === identity) return { skipped: true, reason: 'ALREADY_PUBLISHED' };
  const message = renderSummaryMessage(row);
  if (!message) return { skipped: true, reason: 'SUMMARY_INCOMPLETE' };
  await sendAndRecord('summary', message, now);
  await saveState({ ...state, lastSummaryIdentity: identity });
  return { published: true, identity };
}

async function sendAndRecord(type, message, now = new Date()) {
  const messageTitle = String(message || '').split('\n')[0].slice(0, 180);
  try {
    const result = await sendTelegramMessage(message);
    try { await recordTelegramPublisherMessage(type, 'success', { messageTitle }, now); }
    catch (error) { console.error('[CRON][TelegramPublisher] History write failed:', error?.message || error); }
    return result;
  } catch (error) {
    try { await recordTelegramPublisherMessage(type, 'failure', { messageTitle, error: error?.message || 'PUBLISH_FAILED' }, now); }
    catch (historyError) { console.error('[CRON][TelegramPublisher] Failure history write failed:', historyError?.message || historyError); }
    throw error;
  }
}

async function runTelegramPublisherTick(now = new Date()) {
  const config = getTelegramConfig();
  if (!config.token || !config.chatId) return { skipped: true, reason: 'TELEGRAM_NOT_CONFIGURED' };
  await getTelegramPublisherHistory(now); // Rolls over the single-day history at Tehran midnight.
  const settings = await getTelegramPublisherSettings();
  const outcomes = [];
  try { outcomes.push({ name: 'custom-ad', ...(await telegramAdMessageService.publishScheduledIfDue(now)) }); }
  catch (error) { console.error('[CRON][TelegramPublisher] custom-ad failed:', error?.message || error); outcomes.push({ name: 'custom-ad', error: error?.code || 'PUBLISH_FAILED' }); }
  for (const [name, fn] of [
    ['index', publishIndexIfScheduled],
    ['valuable', publishValuableChangesIfAny],
    ['scalping', publishScalpingOpportunitiesIfAny],
    ['summary', publishTodaySummaryIfReady]
  ]) {
    try { outcomes.push({ name, ...(await fn(now, settings)) }); }
    catch (error) {
      console.error('[CRON][TelegramPublisher] ' + name + ' failed:', error?.message || error);
      outcomes.push({ name, error: error?.code || 'PUBLISH_FAILED' });
    }
  }
  return { skipped: false, outcomes };
}

module.exports = {
  STATE_KEY, isTradingWeekday, isTradingSession, tehranDateKey, tehranSlot,
  isFresh, formatPercent, normalizeValuableResults, getImportantSymbolChanges,
  renderValuableChanges, renderIndexMessage, renderSummaryMessage,
  publishIndexIfScheduled, publishValuableChangesIfAny, publishScalpingOpportunitiesIfAny, publishTodaySummaryIfReady,
  runTelegramPublisherTick, sendAndRecord
};
