'use strict';

const prisma = require('../config/prisma.cjs');
const centralCache = require('./centralMarketCache.service.cjs');
const { sendTelegramMessage, getTelegramConfig } = require('./telegramBotApi.service.cjs');
const { getTelegramPublisherSettings, tehranDateKey, isAllowedWeekday, getDueIntervalSlot, isBeforeEndTime, recordTelegramPublisherMessage } = require('./telegramPublisherSettings.service.cjs');

const STATE_KEY = 'telegram.publisher.state.v1';
const COMMODITY_CACHE_KEY = 'commodity:snapshot:active';
const NERKH_CACHE_KEY = 'nerkh:prices:active';
const MAX_CACHE_AGE_MS = 15 * 60 * 1000;
const GROUPS = [
  {
    key: 'preciousMetals', title: 'فلزات گران‌بهای جهانی', historyType: 'preciousMetals',
    source: 'commodity'
  },
  {
    key: 'goldPrice', title: 'قیمت طلا', historyType: 'goldPrice',
    source: 'nerkh'
  },
  {
    key: 'silverPrice', title: 'قیمت نقره', historyType: 'silverPrice',
    source: 'nerkh'
  },
  {
    key: 'coinPrice', title: 'قیمت سکه', historyType: 'coinPrice',
    source: 'nerkh'
  },
  {
    key: 'currencyPrice', title: 'قیمت ارز', historyType: 'currencyPrice',
    source: 'nerkh'
  }
];

const SYMBOL_LABELS = {
  GOLD18K: 'طلای ۱۸ عیار', GOLD24K: 'طلای ۲۴ عیار', MESGHAL: 'مثقال طلا', MAZANEH: 'مظنه طلا',
  OUNCE: 'انس جهانی طلا', MILLI_GOLD18K: 'طلای ۱۸ عیار (میلی)',
  SEKE_EMAMI: 'سکه امامی', SEKE_BAHAR: 'سکه بهار آزادی', SEKE_NIM: 'نیم‌سکه',
  SEKE_ROB: 'ربع‌سکه', SEKE_1G: 'سکه یک گرمی', OUNCE_SILVER: 'انس جهانی نقره',
  USD: 'دلار آمریکا', EUR: 'یورو', GBP: 'پوند انگلیس', AED: 'درهم امارات',
  TRY: 'لیر ترکیه', CAD: 'دلار کانادا', CHF: 'فرانک سوئیس', CNY: 'یوآن چین', QAR: 'ریال قطر'
};

let publishingRunning = false;

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function number(value, digits = 2) {
  const n = toNumber(value);
  return n === null ? '—' : n.toLocaleString('fa-IR', { maximumFractionDigits: digits });
}

function signed(value, digits = 2) {
  const n = toNumber(value);
  return n === null ? '—' : (n > 0 ? '+' : '') + number(n, digits);
}

function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

function freshSnapshot(snapshot, now = new Date()) {
  const fetchedAt = new Date(snapshot?.fetchedAt || '').getTime();
  return Number.isFinite(fetchedAt) && fetchedAt <= now.getTime() + 60_000 && now.getTime() - fetchedAt <= MAX_CACHE_AGE_MS;
}

function getNerkhItems(snapshot, groupKey) {
  const all = Array.isArray(snapshot?.groups?.gold) ? snapshot.groups.gold : [];
  if (groupKey === 'goldPrice') {
    return all.filter(item => !String(item.symbol).startsWith('SEKE_') &&
      !['OUNCE_SILVER', 'OUNCE_PLATINUM', 'XAGUSD', 'XPTUSD'].includes(String(item.symbol).toUpperCase()));
  }
  if (groupKey === 'silverPrice') {
    return all.filter(item => ['OUNCE_SILVER', 'XAGUSD'].includes(String(item.symbol).toUpperCase()));
  }
  if (groupKey === 'coinPrice') return all.filter(item => String(item.symbol).startsWith('SEKE_'));
  if (groupKey === 'currencyPrice') return Array.isArray(snapshot?.groups?.currency) ? snapshot.groups.currency : [];
  return [];
}

function renderNerkhItem(item, groupKey, usdRate) {
  const symbol = String(item.symbol || '');
  const current = toNumber(item.current);
  const percent = toNumber(item.change24hPercent);
  const isOunce = ['OUNCE', 'OUNCE_SILVER', 'XAGUSD'].includes(symbol.toUpperCase());
  const currency = isOunce ? 'دلار / اونس' : 'ریال';
  const delta = current !== null && percent !== null && percent > -100
    ? current * percent / (100 + percent) : null;
  const lines = ['🔸 ' + (item.name || SYMBOL_LABELS[symbol] || symbol) + (symbol ? ' (' + symbol + ')' : '')];
  if (isOunce) {
    lines.push('قیمت جهانی: ' + number(current, 4) + ' دلار / اونس');
    if (usdRate > 0) lines.push('معادل ریالی: ' + number(current * usdRate) + ' ریال');
  } else {
    lines.push('قیمت: ' + number(current) + ' ' + currency);
  }
  if (delta !== null || percent !== null) {
    lines.push('تغییر ۲۴ ساعته: ' + signed(delta) + (isOunce ? ' دلار' : ' ریال') +
      ' (' + (percent === null ? '—' : signed(percent) + '٪') + ')');
  }
  if (item.min24h != null || item.max24h != null) {
    lines.push('کمینه / بیشینه ۲۴ساعت: ' + number(item.min24h) + ' / ' + number(item.max24h) + (isOunce ? ' دلار' : ' ریال'));
  }
  if (item.update) lines.push('آخرین بروزرسانی منبع: ' + String(item.update));
  return lines.join('\n');
}

function renderCommodityItem(item) {
  const name = String(item.name || item.symbol || 'فلز');
  const unit = String(item.unit || 'دلار');
  const change = toNumber(item.change_value);
  const percent = toNumber(item.change_percent);
  const lines = ['🔸 ' + name + (item.symbol ? ' (' + item.symbol + ')' : '')];
  lines.push('قیمت: ' + number(item.price, 4) + ' ' + unit);
  lines.push('تغییر قیمت: ' + signed(change, 4) + ' ' + unit +
    (percent === null ? '' : ' (' + signed(percent, 2) + '٪)'));
  if (item.date || item.time) lines.push('زمان ثبت: ' + [item.date, item.time].filter(Boolean).join(' '));
  return lines.join('\n');
}

function renderCommodityCaption(group, snapshot, now = new Date()) {
  let items = [];
  if (group.source === 'commodity') {
    items = Array.isArray(snapshot?.groups?.metal_precious) ? snapshot.groups.metal_precious : [];
    items = items.filter(item => toNumber(item.price) > 0);
  } else {
    items = getNerkhItems(snapshot, group.key).filter(item => toNumber(item.current) > 0);
  }
  if (!items.length) return null;

  const usdRate = toNumber(snapshot?.groups?.currency?.find(item => item.symbol === 'USD')?.current) || 0;
  const formatted = items.slice(0, 14).map(item => group.source === 'commodity'
    ? renderCommodityItem(item) : renderNerkhItem(item, group.key, usdRate));
  const header = [
    '📊 رونیا | ' + group.title,
    '━━━━━━━━━━━━━━━━━━',
    ''
  ];
  const footer = [
    '',
    '━━━━━━━━━━━━━━━━━━',
    'زمان انتشار: ' + dateTime(now),
    'اطلاعات بر اساس آخرین داده ذخیره‌شده منبع است.'
  ];
  let selected = [];
  let caption = [...header, ...footer].join('\n');
  for (const row of formatted) {
    const candidate = [...header, ...selected, row, ...footer].join('\n');
    if (candidate.length > 1024) break;
    selected.push(row);
    caption = candidate;
  }
  if (selected.length < formatted.length) {
    const omitted = '… موارد بیشتر در تب کامودیتی نرم‌افزار رونیا';
    const candidate = [...header, ...selected, omitted, ...footer].join('\n');
    if (candidate.length <= 1024) caption = candidate;
  }
  return caption;
}

async function readState() {
  const row = await prisma.appConfig.findUnique({ where: { key: STATE_KEY } });
  try {
    const state = JSON.parse(row?.value || '{}');
    return state && typeof state === 'object' ? state : {};
  } catch (_) { return {}; }
}

async function saveState(state) {
  await prisma.appConfig.upsert({
    where: { key: STATE_KEY },
    create: { key: STATE_KEY, value: JSON.stringify(state) },
    update: { value: JSON.stringify(state), updatedAt: new Date() }
  });
}

async function publishCommodityPricesIfScheduled(now = new Date(), suppliedSettings) {
  if (publishingRunning) return [{ name: 'commodity-prices', skipped: true, reason: 'ALREADY_RUNNING' }];
  publishingRunning = true;
  try {
    const config = getTelegramConfig();
    if (!config.token || !config.chatId) return [{ name: 'commodity-prices', skipped: true, reason: 'TELEGRAM_NOT_CONFIGURED' }];
    const settings = suppliedSettings || await getTelegramPublisherSettings();
    const state = await readState();
    const outcomes = [];

    for (const group of GROUPS) {
      const schedule = settings[group.key];
      if (!schedule?.enabled) { outcomes.push({ name: group.key, skipped: true, reason: 'DISABLED_BY_ADMIN' }); continue; }
      if (!isAllowedWeekday(now, schedule.days)) { outcomes.push({ name: group.key, skipped: true, reason: 'WEEKDAY_NOT_ENABLED' }); continue; }
      if (!isBeforeEndTime(now, schedule.endTime)) { outcomes.push({ name: group.key, skipped: true, reason: 'PUBLISHING_END_TIME_REACHED' }); continue; }
      const slotTime = getDueIntervalSlot(now, schedule.startTime, schedule.intervalMinutes, 2);
      if (!slotTime) { outcomes.push({ name: group.key, skipped: true, reason: 'NOT_IN_PUBLISH_CYCLE' }); continue; }
      const slot = tehranDateKey(now) + '@' + slotTime;
      if (state.lastCommodityTelegramSlots?.[group.key] === slot) { outcomes.push({ name: group.key, skipped: true, reason: 'ALREADY_PUBLISHED_THIS_SLOT' }); continue; }

      const snapshot = centralCache.get(group.source === 'commodity' ? COMMODITY_CACHE_KEY : NERKH_CACHE_KEY);
      if (!snapshot || !freshSnapshot(snapshot, now)) { outcomes.push({ name: group.key, skipped: true, reason: 'CACHE_MISSING_OR_STALE' }); continue; }
      const caption = renderCommodityCaption(group, snapshot, now);
      if (!caption) { outcomes.push({ name: group.key, skipped: true, reason: 'NO_VALID_PRICE_ROWS' }); continue; }

      try {
        await sendTelegramMessage(caption);
        try { await recordTelegramPublisherMessage(group.historyType, 'success', { messageTitle: caption.split('\n')[0] }, now); }
        catch (historyError) { console.error('[CRON][TelegramPublisher] Commodity history write failed:', historyError?.message || historyError); }
        state.lastCommodityTelegramSlots = { ...(state.lastCommodityTelegramSlots || {}), [group.key]: slot };
        state.lastCommodityTelegramPublishedAt = now.toISOString();
        await saveState(state);
        outcomes.push({ name: group.key, published: true, slot, rows: group.source === 'commodity' ? snapshot.groups.metal_precious.length : getNerkhItems(snapshot, group.key).length });
      } catch (error) {
        try { await recordTelegramPublisherMessage(group.historyType, 'failure', { messageTitle: caption.split('\n')[0], error: error?.message || 'PUBLISH_FAILED' }, now); }
        catch (historyError) { console.error('[CRON][TelegramPublisher] Commodity failure history write failed:', historyError?.message || historyError); }
        outcomes.push({ name: group.key, error: error?.code || error?.message || 'PUBLISH_FAILED' });
      }
    }
    return outcomes;
  } finally {
    publishingRunning = false;
  }
}


async function publishCommodityGroupNow(groupKey, now = new Date()) {
  if (publishingRunning) throw new Error('ALREADY_RUNNING');
  const group = GROUPS.find(item => item.key === groupKey);
  if (!group) throw new Error('UNSUPPORTED_COMMODITY_GROUP');
  publishingRunning = true;
  try {
    const config = getTelegramConfig();
    if (!config.token || !config.chatId) throw new Error('TELEGRAM_NOT_CONFIGURED');
    const snapshot = centralCache.get(group.source === 'commodity' ? COMMODITY_CACHE_KEY : NERKH_CACHE_KEY);
    if (!snapshot || !freshSnapshot(snapshot, now)) throw new Error('CACHE_MISSING_OR_STALE');
    const caption = renderCommodityCaption(group, snapshot, now);
    if (!caption) throw new Error('NO_VALID_PRICE_ROWS');
    try {
      await sendTelegramMessage(caption);
      try { await recordTelegramPublisherMessage(group.historyType, 'success', { messageTitle: caption.split('\n')[0] }, now); }
      catch (historyError) { console.error('[TelegramPublisherAdmin] Manual commodity history write failed:', historyError?.message || historyError); }
      return { published: true, type: groupKey, rows: group.source === 'commodity' ? snapshot.groups.metal_precious.length : getNerkhItems(snapshot, group.key).length };
    } catch (error) {
      try { await recordTelegramPublisherMessage(group.historyType, 'failure', { messageTitle: caption.split('\n')[0], error: error?.message || 'PUBLISH_FAILED' }, now); }
      catch (historyError) { console.error('[TelegramPublisherAdmin] Manual commodity failure history write failed:', historyError?.message || historyError); }
      throw error;
    }
  } finally { publishingRunning = false; }
}

module.exports = { GROUPS, renderCommodityCaption, publishCommodityPricesIfScheduled, publishCommodityGroupNow };
