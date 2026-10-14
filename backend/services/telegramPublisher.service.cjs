'use strict';

const prisma = require('../config/prisma.cjs');
const { getStoredValuableSymbols } = require('./valuableSymbols.engine.cjs');
const { sendTelegramMessage, getTelegramConfig } = require('./telegramBotApi.service.cjs');

const STATE_KEY = 'telegram.publisher.state.v1';
const TEHRAN_TIMEZONE = 'Asia/Tehran';
const INDEX_SLOTS = new Set(['09:15', '10:00', '11:00', '12:15']);
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

function normalizeValuableResults(results, now = Date.now()) {
  if (!Array.isArray(results)) return [];
  return results.filter(item =>
    item && item.symbol &&
    String(item.marketStatus || '').toUpperCase() === 'OPEN' &&
    toNumber(item.currentPrice) > 0 &&
    isFresh(item.marketUpdatedAt, MAX_SYMBOL_PRICE_AGE_MS, now)
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

function renderValuableChanges(changes, date = new Date()) {
  const lines = [
    '📊 رونیا | تغییرات مهم نمادهای ارزنده',
    'تاریخ: ' + new Intl.DateTimeFormat('fa-IR', { timeZone: TEHRAN_TIMEZONE, dateStyle: 'short' }).format(date),
    ''
  ];
  for (const change of changes.slice(0, 20)) {
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
    'تاریخ: ' + day + ' | ساعت تهران: ' + time,
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

function renderSummaryMessage(row, date = new Date()) {
  const content = String(row?.content || row?.summary || '').trim();
  if (!content || !/تحلیل تکنیکال و چشم‌انداز کوتاه‌مدت/.test(content)) return null;
  const day = new Intl.DateTimeFormat('fa-IR', { timeZone: TEHRAN_TIMEZONE, dateStyle: 'short' }).format(date);
  return ('🧾 رونیا | خلاصه نهایی بازار بورس\nتاریخ: ' + day + '\n\n' + content).slice(0, 3900);
}

async function publishIndexIfScheduled(now = new Date()) {
  if (!isTradingSession(now)) return { skipped: true, reason: 'OUTSIDE_TRADING_SESSION' };
  const slot = tehranSlot(now);
  if (!INDEX_SLOTS.has(slot)) return { skipped: true, reason: 'NOT_AN_INDEX_SLOT' };

  const state = await loadState();
  const daySlot = tehranDateKey(now) + '@' + slot;
  if (state.lastIndexSlot === daySlot) return { skipped: true, reason: 'ALREADY_PUBLISHED' };

  const row = await prisma.marketCurrent.findUnique({ where: { marketDate: getCurrentMarketDateUtc(now) } });
  if (!row || row.isStale || String(row.marketStatus || '').toUpperCase() !== 'OPEN' ||
      !isFresh(row.updatedAt, MAX_INDEX_AGE_MS, now.getTime()) ||
      !(toNumber(row.overallIndex) > 0) || !(toNumber(row.equalIndex) > 0)) {
    return { skipped: true, reason: 'NO_FRESH_CURRENT_MARKET_SNAPSHOT' };
  }

  await sendTelegramMessage(renderIndexMessage(row, now));
  await saveState({ ...state, lastIndexSlot: daySlot });
  return { published: true, slot: daySlot };
}

async function publishValuableChangesIfAny(now = new Date()) {
  if (!isTradingSession(now)) return { skipped: true, reason: 'OUTSIDE_TRADING_SESSION' };
  const state = await loadState();
  const marketDate = getCurrentMarketDateUtc(now);
  const currentMarket = await prisma.marketCurrent.findUnique({ where: { marketDate } });
  if (!currentMarket || currentMarket.isStale || String(currentMarket.marketStatus || '').toUpperCase() !== 'OPEN' ||
      !(toNumber(currentMarket.overallIndex) > 0) || !isFresh(currentMarket.updatedAt, MAX_INDEX_AGE_MS, now.getTime())) {
    return { skipped: true, reason: 'NO_FRESH_CURRENT_MARKET_SNAPSHOT' };
  }
  const stored = await getStoredValuableSymbols({ force: true });
  if (!stored?.evaluatedAt || !isFresh(stored.evaluatedAt, MAX_VALUABLE_EVALUATION_AGE_MS, now.getTime())) {
    return { skipped: true, reason: 'VALUABLE_RESULTS_STALE' };
  }
  const current = normalizeValuableResults(stored.results, now.getTime());
  if (!current.length) return { skipped: true, reason: 'NO_FRESH_VALUABLE_RESULTS' };

  const previousMap = state.valuableSymbols && typeof state.valuableSymbols === 'object' ? state.valuableSymbols : {};
  const changes = getImportantSymbolChanges(current, previousMap);
  const nextMap = {};
  for (const item of current) nextMap[item.symbol] = { score: toNumber(item.score) };
  if (changes.length) await sendTelegramMessage(renderValuableChanges(changes, now));
  await saveState({ ...state, valuableSymbols: nextMap, valuableEvaluatedAt: stored.evaluatedAt });
  return { published: changes.length > 0, changes: changes.length };
}

async function publishTodaySummaryIfReady(now = new Date()) {
  if (!isTradingWeekday(now)) return { skipped: true, reason: 'NON_TRADING_WEEKDAY' };
  const state = await loadState();
  const summaryDate = getCurrentMarketDateUtc(now);
  const marketSnapshot = await prisma.marketCurrent.findUnique({ where: { marketDate: summaryDate } });
  if (!marketSnapshot || marketSnapshot.isStale || !(toNumber(marketSnapshot.overallIndex) > 0)) {
    return { skipped: true, reason: 'NO_TODAY_MARKET_SNAPSHOT' };
  }
  const row = await prisma.marketSummary.findUnique({ where: { summaryDate } });
  if (!row) return { skipped: true, reason: 'NO_TODAY_SUMMARY' };
  const createdAt = row.createdAt || row.date;
  if (!createdAt || !isFresh(createdAt, 24 * 60 * 60 * 1000, now.getTime())) {
    return { skipped: true, reason: 'SUMMARY_NOT_CREATED_TODAY' };
  }
  const identity = tehranDateKey(now) + '#' + String(row.id);
  if (state.lastSummaryIdentity === identity) return { skipped: true, reason: 'ALREADY_PUBLISHED' };
  const message = renderSummaryMessage(row, now);
  if (!message) return { skipped: true, reason: 'SUMMARY_INCOMPLETE' };
  await sendTelegramMessage(message);
  await saveState({ ...state, lastSummaryIdentity: identity });
  return { published: true, identity };
}

async function runTelegramPublisherTick(now = new Date()) {
  const config = getTelegramConfig();
  if (!config.token || !config.chatId) return { skipped: true, reason: 'TELEGRAM_NOT_CONFIGURED' };
  const outcomes = [];
  for (const [name, fn] of [
    ['index', publishIndexIfScheduled],
    ['valuable', publishValuableChangesIfAny],
    ['summary', publishTodaySummaryIfReady]
  ]) {
    try { outcomes.push({ name, ...(await fn(now)) }); }
    catch (error) {
      console.error('[CRON][TelegramPublisher] ' + name + ' failed:', error?.message || error);
      outcomes.push({ name, error: error?.code || 'PUBLISH_FAILED' });
    }
  }
  return { skipped: false, outcomes };
}

module.exports = {
  STATE_KEY, INDEX_SLOTS, isTradingWeekday, isTradingSession, tehranDateKey, tehranSlot,
  isFresh, formatPercent, normalizeValuableResults, getImportantSymbolChanges,
  renderValuableChanges, renderIndexMessage, renderSummaryMessage,
  publishIndexIfScheduled, publishValuableChangesIfAny, publishTodaySummaryIfReady,
  runTelegramPublisherTick
};
