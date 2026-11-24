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

function htmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');
}

function bold(value) {
  return '<b>' + htmlEscape(value) + '</b>';
}

function trend(value, digits = 2, suffix = '') {
  const n = toNumber(value);
  if (n === null) return bold('—');
  const marker = n > 0 ? '🟢 ▲' : n < 0 ? '🔴 ▼' : '⚪ —';
  return bold(marker + ' ' + signed(n, digits) + suffix);
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

function normalizeDateDigits(value) {
  return String(value ?? '')
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function toPersianDigits(value) {
  return String(value).replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}

function parseSourceUpdate(raw) {
  const normalized = normalizeDateDigits(raw).trim();
  if (!normalized) return null;

  // Jalali years must not be passed to Date(), which treats them as Gregorian.
  const jalali = normalized.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T،]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (jalali && Number(jalali[1]) >= 1200 && Number(jalali[1]) <= 1500) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = jalali;
    const key = [year, month.padStart(2, '0'), day.padStart(2, '0'),
      hour.padStart(2, '0'), minute, second].join('');
    const display = toPersianDigits(
      year + '/' + month.padStart(2, '0') + '/' + day.padStart(2, '0') +
      (jalali[4] !== undefined ? ' ' + hour.padStart(2, '0') + ':' + minute : '')
    );
    return { key, display };
  }

  const parsed = new Date(normalized.replace(/\//g, '-'));
  if (!Number.isFinite(parsed.getTime())) return { key: null, display: String(raw).trim() };
  return { key: String(parsed.getTime()).padStart(16, '0'), display: dateTime(parsed) };
}

function latestSourceUpdate(items, source) {
  const candidates = (Array.isArray(items) ? items : []).map(item => {
    const raw = source === 'commodity'
      ? [item?.date, item?.time].filter(Boolean).join(' ').trim()
      : String(item?.update || '').trim();
    return raw ? parseSourceUpdate(raw) : null;
  }).filter(Boolean);
  if (!candidates.length) return '—';
  const parseable = candidates.filter(item => item.key !== null);
  if (!parseable.length) return candidates[0].display;
  return parseable.reduce((latest, item) => item.key > latest.key ? item : latest).display;
}
const MAX_COMMODITY_SCHEDULE_GRACE_MINUTES = 10;

function getCommodityScheduleSlot(now, schedule) {
  const interval = Number(schedule?.intervalMinutes);
  // Cron ticks once per minute. Keep a missed slot eligible for retry when
  // the event loop or another scheduled task delays the tick, without
  // allowing one interval's grace window to overlap the next interval.
  const graceMinutes = Math.min(MAX_COMMODITY_SCHEDULE_GRACE_MINUTES, Math.max(0, interval - 1));
  return getDueIntervalSlot(now, schedule?.startTime, interval, graceMinutes);
}

function freshSnapshot(snapshot, now = new Date()) {
  const fetchedAt = new Date(snapshot?.fetchedAt || '').getTime();
  return Number.isFinite(fetchedAt) && fetchedAt <= now.getTime() + 60_000 && now.getTime() - fetchedAt <= MAX_CACHE_AGE_MS;
}

function getNerkhItems(snapshot, groupKey) {
  const all = Array.isArray(snapshot?.groups?.gold) ? snapshot.groups.gold : [];
  if (groupKey === 'goldPrice') {
    const symbols = ['GOLD18K', 'GOLD24K', 'MESGHAL', 'OUNCE'];
    return all
      .filter(item => symbols.includes(String(item?.symbol || '').trim().toUpperCase()))
      .sort((a, b) => symbols.indexOf(String(a?.symbol || '').trim().toUpperCase()) -
        symbols.indexOf(String(b?.symbol || '').trim().toUpperCase()));
  }
  if (groupKey === 'silverPrice') {
    return all.filter(item => ['OUNCE_SILVER', 'XAGUSD'].includes(String(item.symbol).toUpperCase()));
  }
  if (groupKey === 'coinPrice') {
    const symbols = ['SEKE_1G', 'SEKE_BAHAR', 'SEKE_EMAMI', 'SEKE_NIM', 'SEKE_ROB'];
    return all
      .filter(item => symbols.includes(String(item?.symbol || '').trim().toUpperCase()))
      .sort((a, b) => symbols.indexOf(String(a?.symbol || '').trim().toUpperCase()) -
        symbols.indexOf(String(b?.symbol || '').trim().toUpperCase()));
  }
  if (groupKey === 'currencyPrice') {
    const currencies = Array.isArray(snapshot?.groups?.currency) ? snapshot.groups.currency : [];
    // Keep USD first so the 14-row and Telegram caption-length limits never omit it.
    return currencies.slice().sort((a, b) => {
      const aIsUsd = String(a?.symbol || '').trim().toUpperCase() === 'USD';
      const bIsUsd = String(b?.symbol || '').trim().toUpperCase() === 'USD';
      return Number(bIsUsd) - Number(aIsUsd);
    });
  }
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
  const displayName = htmlEscape(item.name || SYMBOL_LABELS[symbol] || symbol);
  const lines = ['🔸 ' + displayName + (symbol ? ' (' + htmlEscape(symbol) + ')' : '')];
  if (isOunce) {
    lines.push('قیمت جهانی: ' + bold(number(current, 4) + ' دلار / اونس'));
    if (usdRate > 0) lines.push('معادل ریالی: ' + bold(number(current * usdRate) + ' ریال'));
  } else {
    lines.push('قیمت: ' + bold(number(current) + ' ' + currency));
  }
  if (delta !== null || percent !== null) {
    lines.push('تغییر ۲۴ ساعته: ' + trend(delta, 2, isOunce ? ' دلار' : ' ریال') +
      ' (' + trend(percent, 2, '٪') + ')');
  }
  if (item.min24h != null || item.max24h != null) {
    lines.push('کمینه / بیشینه ۲۴ساعت: ' + bold(number(item.min24h) + ' / ' + number(item.max24h) + (isOunce ? ' دلار' : ' ریال')));
  }
  return lines.join('\n');
}

function renderCommodityItem(item) {
  const name = String(item.name || item.symbol || 'فلز');
  const unit = String(item.unit || 'دلار');
  const change = toNumber(item.change_value);
  const percent = toNumber(item.change_percent);
  const lines = ['🔸 ' + htmlEscape(name) + (item.symbol ? ' (' + htmlEscape(item.symbol) + ')' : '')];
  lines.push('قیمت: ' + bold(number(item.price, 4) + ' ' + unit));
  lines.push('تغییر قیمت: ' + trend(change, 4, ' ' + unit) +
    (percent === null ? '' : ' (' + trend(percent, 2, '٪') + ')'));
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
  // Currency posts must include all nine currencies shown in the Commodity tab.
  const formattedItems = group.key === 'currencyPrice' ? items : items.slice(0, 14);
  const formatted = formattedItems.map(item => group.source === 'commodity'
    ? renderCommodityItem(item) : renderNerkhItem(item, group.key, usdRate));
  const header = [
    bold('تحلیلگر هوشمند بورس رونیا'),
    '📊 رونیا | ' + group.title,
    '━━━━━━━━━━━━━━━━━━',
    'آخرین به‌روزرسانی منبع: ' + htmlEscape(latestSourceUpdate(items, group.source)),
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
    const maxMessageLength = group.key === 'currencyPrice' ? 4096 : 1024;
    if (candidate.length > maxMessageLength) break;
    selected.push(row);
    caption = candidate;
  }
  if (selected.length < formatted.length) {
    const omitted = '… موارد بیشتر در تب کامودیتی نرم‌افزار رونیا';
    const candidate = [...header, ...selected, omitted, ...footer].join('\n');
    if (candidate.length <= (group.key === 'currencyPrice' ? 4096 : 1024)) caption = candidate;
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
      const slotTime = getCommodityScheduleSlot(now, schedule);
      if (!slotTime) { outcomes.push({ name: group.key, skipped: true, reason: 'NOT_IN_PUBLISH_CYCLE' }); continue; }
      const slot = tehranDateKey(now) + '@' + slotTime;
      if (state.lastCommodityTelegramSlots?.[group.key] === slot) { outcomes.push({ name: group.key, skipped: true, reason: 'ALREADY_PUBLISHED_THIS_SLOT' }); continue; }

      const snapshot = centralCache.get(group.source === 'commodity' ? COMMODITY_CACHE_KEY : NERKH_CACHE_KEY);
      if (!snapshot || !freshSnapshot(snapshot, now)) { outcomes.push({ name: group.key, skipped: true, reason: 'CACHE_MISSING_OR_STALE' }); continue; }
      const caption = renderCommodityCaption(group, snapshot, now);
      if (!caption) { outcomes.push({ name: group.key, skipped: true, reason: 'NO_VALID_PRICE_ROWS' }); continue; }

      try {
        await sendTelegramMessage(caption, { parseMode: 'HTML' });
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
      await sendTelegramMessage(caption, { parseMode: 'HTML' });
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

module.exports = { GROUPS, renderCommodityCaption, getCommodityScheduleSlot, publishCommodityPricesIfScheduled, publishCommodityGroupNow };
