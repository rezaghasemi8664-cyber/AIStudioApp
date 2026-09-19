'use strict';

const prismaModule = require('../config/prisma.cjs');
const env = require('../config/env.cjs');

function resolvePrismaClient(mod) {
  const candidates = [mod?.prisma, mod?.db, mod?.client, mod?.default, mod];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') return candidate;
  }
  return null;
}

const prisma = resolvePrismaClient(prismaModule);
if (!prisma) throw new Error('[MarketSummaryService] Prisma client is unavailable.');

function getModel(client, pascal, camel) {
  return client?.[pascal] || client?.[camel] || null;
}
function getMarketSummaryModel() {
  const model = getModel(prisma, 'MarketSummary', 'marketSummary');
  if (!model) throw new Error('[MarketSummaryService] MarketSummary model is unavailable.');
  return model;
}
function getMarketHistoryModel() { return getModel(prisma, 'MarketHistory', 'marketHistory'); }

const TEHRAN_TIMEZONE = 'Asia/Tehran';
const TRADING_DAY_NAMES = new Set(['sat', 'sun', 'mon', 'tue', 'wed']);
const SUMMARY_RETENTION_COUNT = Number(env.MARKET_SUMMARY_RETENTION_COUNT || 5);
const SAME_DAY_GENERATION_CUTOFF_MINUTES = 12 * 60 + 35;

const FIELD_KEYS = {
  index: ['index', 'index_main', 'index_total', 'index_tepix', 'market_index', 'tedpix', 'overallIndex'],
  changeIndex: ['change_index', 'index_change', 'index_change_value', 'index_diff', 'tepix_change', 'overallChange', 'indexChange'],
  changeIndexPercent: ['changePercent', 'overallChangePercent', 'indexChangePercent', 'index_change_percent', 'percentChange', 'change_index_percent'],
  equalIndex: ['equalWeight_index', 'index_equalWeight', 'index_equal_weight', 'equal_weight_index', 'equal_index', 'indexEqualWeight', 'equalIndex', 'equalWeightedValue'],
  equalChange: ['change_equalWeight_index', 'index_equalWeight_change', 'index_equal_weight_change', 'equal_weight_change', 'equal_change', 'indexEqualWeightChange', 'equalChange', 'equalWeightedChangeValue'],
  equalChangePercent: ['equalWeightedChangePercent', 'equalChangePercent', 'indexEqualWeightChangePercent', 'index_equalWeight_change_percent', 'index_equal_weight_change_percent'],
  marketState: ['state', 'market_state', 'status', 'marketStatus', 'marketState'],
  totalTrades: ['tno', 'total_trades', 'trade_count', 'trades', 'totalTrades', 'tradeCount'],
  totalVolume: ['tvol', 'total_volume', 'volume', 'trade_volume', 'totalVolume', 'tradeVolume'],
  totalValue: ['tval', 'total_value', 'value', 'trade_value', 'totalValue', 'tradeValue'],
  pctClose: ['pcp', 'pCp', 'percent_close', 'close_percent', 'closeChangePercent'],
  pctLast: ['plp', 'pLp', 'percent_last', 'last_percent', 'lastChangePercent'],
  symbol: ['symbol', 'namad', 'l18', 'l30', 'name', 'insCode']
};

function jsonStringifySafe(value) {
  return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v);
}
function parseJsonSafe(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}
function normalizeDigits(input) {
  return String(input)
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}
function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(normalizeDigits(String(value)).replace(/[,\u066C\u2009\u202F\s]/g, '').replace(/\u2212/g, '-').trim());
  return Number.isFinite(n) ? n : null;
}
function toBigIntOrNull(value) {
  const n = toNumber(value);
  return n === null ? null : BigInt(Math.trunc(n));
}
function firstString(...values) {
  for (const value of values) if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  return null;
}
function keyVariants(key) {
  const k = String(key || '').trim();
  if (!k) return [];
  const snake = k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return [...new Set([k, k.toLowerCase(), snake, camel])];
}
function getValueBySmartKey(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  const lower = new Map(Object.keys(obj).map(k => [k.toLowerCase(), k]));
  for (const variant of keyVariants(key)) {
    const real = lower.get(variant.toLowerCase());
    if (real) return obj[real];
  }
  return undefined;
}
function pickValue(obj, keys, parser = toNumber) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    const value = parser(getValueBySmartKey(obj, key));
    if (value !== null) return value;
  }
  return null;
}
function toDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function tehranParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory', {
    timeZone: TEHRAN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false, hourCycle: 'h23'
  }).formatToParts(date);
  const out = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = p.value;
  return out;
}
function toDateOnlyISO(value) {
  const d = toDateOrNull(value);
  if (!d) return null;
  const p = tehranParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}
function getTehranDayStart(value) {
  const p = tehranParts(toDateOrNull(value) || new Date());
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), 0, 0, 0, 0));
}
function parseDateInputToTehranDayStart(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00.000Z`);
  const d = toDateOrNull(raw);
  return d ? getTehranDayStart(d) : null;
}
function isTradingDay(date) {
  const weekday = String(tehranParts(date).weekday || '').toLowerCase();
  return TRADING_DAY_NAMES.has(weekday);
}
function isBeforeTodaysGenerationWindow() {
  const p = tehranParts();
  return Number(p.hour) * 60 + Number(p.minute) < SAME_DAY_GENERATION_CUTOFF_MINUTES;
}

function extractMarketDataCandidate(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const candidates = [parsed.data, parsed.marketData, parsed.payload, parsed.result, parsed];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && isUsableMarketData(candidate)) return candidate;
  }
  return null;
}
function isUsableMarketData(data) {
  if (!data || typeof data !== 'object') return false;
  return [
    pickValue(data, FIELD_KEYS.index), pickValue(data, FIELD_KEYS.changeIndex),
    pickValue(data, FIELD_KEYS.equalIndex), pickValue(data, FIELD_KEYS.equalChange),
    pickValue(data, FIELD_KEYS.totalValue), pickValue(data, FIELD_KEYS.totalVolume),
    pickValue(data, FIELD_KEYS.totalTrades)
  ].some(v => v !== null);
}
function isLikelySyntheticMarketData(data) {
  if (!data || typeof data !== 'object') return false;
  const values = [
    pickValue(data, FIELD_KEYS.index), pickValue(data, FIELD_KEYS.changeIndex),
    pickValue(data, FIELD_KEYS.equalIndex), pickValue(data, FIELD_KEYS.equalChange),
    pickValue(data, FIELD_KEYS.totalTrades), pickValue(data, FIELD_KEYS.totalVolume),
    pickValue(data, FIELD_KEYS.totalValue)
  ].filter(v => v !== null);
  if (values.length < 5) return false;
  return values.filter(v => Math.abs(v) >= 1000 && Math.abs(v) % 1000 === 0).length / values.length >= 0.85;
}
function normalizeSymbolsList(data) {
  if (Array.isArray(data)) return data;
  for (const key of ['symbols', 'allSymbols', 'rows', 'list', 'items', 'marketwatch']) {
    if (Array.isArray(data?.[key]) && data[key].length) return data[key];
  }
  return [];
}
function symbolName(row) { return firstString(row?.symbol, row?.l18, row?.l30, row?.name, row?.namad, row?.insCode) || 'نامشخص'; }
function symbolPercent(row) {
  const close = pickValue(row, FIELD_KEYS.pctClose);
  if (close !== null) return close;
  const last = pickValue(row, FIELD_KEYS.pctLast);
  if (last !== null) return last;
  const current = pickValue(row, ['lastPrice', 'pl', 'last', 'closingPrice', 'pc', 'close']);
  const previous = pickValue(row, ['yesterday', 'py', 'previousClose']);
  return current !== null && previous !== null && previous !== 0 ? ((current - previous) / previous) * 100 : null;
}
function buildBreadth(data) {
  const rows = normalizeSymbolsList(data);
  const map = new Map();
  for (const row of rows) {
    const symbol = symbolName(row);
    const code = firstString(row?.insCode, row?.inscode, row?.id) || `symbol:${symbol}`;
    const pct = symbolPercent(row);
    const volume = pickValue(row, FIELD_KEYS.totalVolume) ?? 0;
    const value = pickValue(row, FIELD_KEYS.totalValue) ?? 0;
    if (!symbol || isIndexLike(row) || (volume <= 0 && value <= 0)) continue;
    const old = map.get(code);
    if (!old || volume + value > old.volume + old.value) map.set(code, { symbol, pct, volume, value });
  }
  const items = [...map.values()];
  const positive = items.filter(x => x.pct !== null && x.pct > 0).length;
  const negative = items.filter(x => x.pct !== null && x.pct < 0).length;
  const neutral = items.length - positive - negative;
  const gainers = items.filter(x => x.pct !== null && x.pct > 0).sort((a,b) => b.pct-a.pct).slice(0,10);
  const losers = items.filter(x => x.pct !== null && x.pct < 0).sort((a,b) => a.pct-b.pct).slice(0,10);
  const volumes = [...items].sort((a,b) => (b.volume-b.volume) || (b.value-a.value)).slice(0,10);
  return { positive, negative, neutral, total: items.length, coverage: rows.length ? (items.length / rows.length) * 100 : null, gainers, losers, volumes };
}
function isIndexLike(row) {
  const text = `${row?.symbol || ''} ${row?.name || ''} ${row?.title || ''}`.toLowerCase();
  return /شاخص|index/.test(text);
}
function calculatePercent(current, change, direct) {
  const d = toNumber(direct);
  if (d !== null) return d;
  const c = toNumber(current), ch = toNumber(change);
  if (c === null || ch === null || c - ch === 0) return null;
  return (ch / (c - ch)) * 100;
}
function fa(value, max = 2) {
  const n = toNumber(value);
  return n === null ? 'داده در دسترس نیست' : n.toLocaleString('fa-IR', { maximumFractionDigits: max });
}
function signedPct(value) {
  const n = toNumber(value);
  return n === null ? 'داده در دسترس نیست' : `${n > 0 ? '+' : ''}${n.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}%`;
}
function direction(value) {
  const n = toNumber(value);
  return n === null ? 'نامشخص' : n > 0 ? 'مثبت' : n < 0 ? 'منفی' : 'خنثی';
}
function statusFa(value) {
  const s = String(value || '').toLowerCase();
  return s.includes('open') || s.includes('باز') ? 'باز' : s.includes('close') || s.includes('بسته') ? 'بسته' : 'نامشخص';
}
function trend(indexChange, equalChange, breadth) {
  if (indexChange > 0 && equalChange > 0 && breadth.positive > breadth.negative) return 'صعودی';
  if (indexChange < 0 && equalChange < 0 && breadth.negative > breadth.positive) return 'نزولی';
  return 'ترکیبی';
}
function extractSectorData(data) {
  const sectors = data?.sectors || data?.sectorSummary || data?.sectorSummaries;
  if (!Array.isArray(sectors)) return { leaders: [], laggards: [] };
  const normalized = sectors.map(x => ({
    name: firstString(x?.name, x?.sector, x?.title),
    change: pickValue(x, ['changePercent', 'change', 'percentChange']),
    value: pickValue(x, ['value', 'tradeValue', 'tval'])
  })).filter(x => x.name);
  return {
    leaders: [...normalized].sort((a,b) => (b.change ?? -Infinity) - (a.change ?? -Infinity)).slice(0,3),
    laggards: [...normalized].sort((a,b) => (a.change ?? Infinity) - (b.change ?? Infinity)).slice(0,3)
  };
}
function extractMoneyFlow(data) {
  const flow = data?.moneyFlow || data?.realMoneyFlow || {};
  const net = pickValue(flow, ['netValue', 'net', 'realNet', 'netMoneyFlow']);
  return { net, buy: pickValue(flow, ['buyValue', 'realBuyValue']), sell: pickValue(flow, ['sellValue', 'realSellValue']) };
}
function buildDeterministicSummary(data) {
  const overall = pickValue(data, FIELD_KEYS.index);
  const overallChange = pickValue(data, FIELD_KEYS.changeIndex);
  const overallPct = calculatePercent(overall, overallChange, pickValue(data, FIELD_KEYS.changeIndexPercent));
  const equal = pickValue(data, FIELD_KEYS.equalIndex);
  const equalChange = pickValue(data, FIELD_KEYS.equalChange);
  const equalPct = calculatePercent(equal, equalChange, pickValue(data, FIELD_KEYS.equalChangePercent));
  const trades = pickValue(data, FIELD_KEYS.totalTrades);
  const volume = pickValue(data, FIELD_KEYS.totalVolume);
  const value = pickValue(data, FIELD_KEYS.totalValue);
  const breadth = buildBreadth(data);
  const flow = extractMoneyFlow(data);
  const sectors = extractSectorData(data);
  const state = statusFa(pickValue(data, FIELD_KEYS.marketState, firstString));
  const bias = trend(overallChange, equalChange, breadth);
  const gainers = breadth.gainers.slice(0,5).map(x => `${x.symbol} (${signedPct(x.pct)})`).join('، ') || 'داده در دسترس نیست';
  const losers = breadth.losers.slice(0,5).map(x => `${x.symbol} (${signedPct(x.pct)})`).join('، ') || 'داده در دسترس نیست';
  const volumes = breadth.volumes.slice(0,5).map(x => `${x.symbol} (${fa(x.volume,0)})`).join('، ') || 'داده در دسترس نیست';
  const leaders = sectors.leaders.map(x => `${x.name}${x.change === null ? '' : ` (${signedPct(x.change)})`}`).join('، ') || 'داده صنعت در دسترس نیست';
  const laggards = sectors.laggards.map(x => `${x.name}${x.change === null ? '' : ` (${signedPct(x.change)})`}`).join('، ') || 'داده صنعت در دسترس نیست';
  const flowText = flow.net === null ? 'داده جریان پول حقیقی در دسترس نیست.' : flow.net > 0 ? `ورود خالص پول حقیقی ${fa(flow.net)} است.` : flow.net < 0 ? `خروج خالص پول حقیقی ${fa(Math.abs(flow.net))} است.` : 'جریان خالص پول حقیقی متعادل است.';
  const breadthRatio = breadth.negative ? breadth.positive / breadth.negative : null;
  const risk = bias === 'صعودی' && breadth.positive >= breadth.negative ? 'متوسط' : 'متوسط رو به زیاد';

  return [
    `۱) وضعیت کلی بازار: بازار ${state} است؛ برآیند شاخص کل ${direction(overallChange)}، شاخص هم‌وزن ${direction(equalChange)} و پهنای بازار ${breadth.positive > breadth.negative ? 'مثبت' : breadth.negative > breadth.positive ? 'منفی' : 'متعادل'} است؛ سوگیری ترکیبی داده‌ها «${bias}» است.`,
    `۲) شاخص‌ها: شاخص کل ${fa(overall)} واحد با تغییر ${signedPct(overallPct)} و تغییر عددی ${fa(overallChange)} واحد؛ شاخص هم‌وزن ${fa(equal)} واحد با تغییر ${signedPct(equalPct)} و تغییر عددی ${fa(equalChange)} واحد.`,
    `۳) پهنای بازار: ${fa(breadth.positive,0)} نماد مثبت، ${fa(breadth.negative,0)} نماد منفی و ${fa(breadth.neutral,0)} نماد خنثی از ${fa(breadth.total,0)} نماد معامله‌شده؛ نسبت مثبت به منفی ${fa(breadthRatio)} و پوشش محاسبه ${breadth.coverage === null ? 'نامشخص' : signedPct(breadth.coverage)} است.`,
    `۴) نقدشوندگی و معاملات: تعداد معاملات ${fa(trades,0)}، حجم معاملات ${fa(volume,0)} و ارزش معاملات ${fa(value,0)} ثبت شده است؛ در صورت وجود فهرست نمادها، بیشترین حجم مربوط به ${volumes} است.`,
    `۵) جریان پول حقیقی: ${flowText}${flow.buy !== null || flow.sell !== null ? ` ارزش خرید حقیقی ${fa(flow.buy)} و فروش حقیقی ${fa(flow.sell)} است.` : ''}`,
    `۶) چرخش صنایع: گروه‌های با تغییر مثبت‌تر: ${leaders}؛ گروه‌های با تغییر منفی‌تر: ${laggards}.`,
    `۷) مومنتوم و روند: جهت جلسه بر اساس دو شاخص «${bias}» است؛ شاخص کل ${direction(overallChange)} و هم‌وزن ${direction(equalChange)} هستند. برای تأیید مومنتوم چندجلسه‌ای، داده تاریخی همان روز باید در دسترس باشد و در نبود آن نتیجه‌ای حدس زده نمی‌شود.`,
    `۸) ریسک و نوسان: سطح ریسک محاسباتی «${risk}» است؛ این سطح از هم‌جهتی شاخص‌ها و پهنای بازار به‌دست آمده و شاخص نوسان مستقل فقط در صورت وجود داده معتبر گزارش می‌شود.`,
    `۹) واگرایی‌ها و هشدارها: شاخص کل ${direction(overallChange)}، شاخص هم‌وزن ${direction(equalChange)} و پهنای بازار ${breadth.positive > breadth.negative ? 'مثبت' : breadth.negative > breadth.positive ? 'منفی' : 'متعادل'} است. اختلاف جهت این سه مؤلفه، در صورت وجود، هشدار واگرایی محسوب می‌شود و باید در جلسه بعد تأیید شود.`,
    `۱۰) نمادهای شاخص حرکت: برترین رشدهای محاسبه‌شده: ${gainers}؛ برترین افت‌ها: ${losers}؛ نمادهای پرتراکنش از نظر حجم: ${volumes}.`,
    `۱۱) سناریوهای پیش‌رو: سناریوی پایه بر مبنای داده فعلی «${bias}» است؛ سناریوی صعودی با بهبود هم‌زمان شاخص‌ها و پهنای بازار تأیید می‌شود و سناریوی نزولی با تشدید افت شاخص‌ها، افزایش برتری نمادهای منفی یا خروج پول تقویت می‌شود.`,
    `۱۲) نتیجه عملیاتی: وضعیت فعلی برای «${bias === 'نزولی' ? 'مدیریت ریسک و انتظار برای تأیید برگشت' : bias === 'صعودی' ? 'پیگیری روند با رعایت مدیریت ریسک' : 'انتظار برای تأیید جهت بازار'}» مناسب‌تر است؛ این عبارت توصیه شخصی سرمایه‌گذاری نیست و صرفاً توصیف وضعیت داده‌هاست.`,
    `۱۳) شروط تأیید/ابطال: تأیید روند صعودی نیازمند حفظ عرض مثبت و هم‌جهتی شاخص‌هاست؛ تأیید روند نزولی نیازمند تداوم افت شاخص‌ها و غلبه نمادهای منفی است؛ در حالت ترکیبی، تغییر جهت باید در داده جلسه بعد تأیید شود.`,
    `۱۴) کیفیت داده و محدودیت تحلیل: ${breadth.total > 0 ? `عرض بازار از ${fa(breadth.total,0)} نماد معامله‌شده محاسبه شده` : 'عرض بازار از فهرست نمادهای موجود قابل محاسبه کامل نیست'}؛ هیچ مقدار یا نتیجه‌ای که داده معتبر برای آن وجود نداشته باشد حدس زده نشده است. منبع محاسباتی این خلاصه داده بازار و سوابق ذخیره‌شده است و به مدل هوش مصنوعی وابسته نیست.`
  ].join('\n\n');
}

function normalizeSummaryRecord(record, diagnostics = null) {
  if (!record) return null;
  const raw = parseJsonSafe(record.rawJson) || {};
  const rawData = raw?.data || {};
  const overallIndex = toNumber(record.overallIndex) ?? pickValue(rawData, FIELD_KEYS.index);
  const overallChange = toNumber(record.overallChange) ?? pickValue(rawData, FIELD_KEYS.changeIndex);
  const equalIndex = toNumber(record.equalIndex) ?? pickValue(rawData, FIELD_KEYS.equalIndex);
  const equalChange = toNumber(record.equalChange) ?? pickValue(rawData, FIELD_KEYS.equalChange);
  const overallPct = calculatePercent(overallIndex, overallChange, pickValue(rawData, FIELD_KEYS.changeIndexPercent));
  const equalPct = calculatePercent(equalIndex, equalChange, pickValue(rawData, FIELD_KEYS.equalChangePercent));
  const storedContent = firstString(record.content, record.summary, raw.content, raw.summary);
  const content = storedContent || buildDeterministicSummary({ ...rawData, overallIndex, overallChange, equalIndex, equalChange, totalTrades: record.totalTrades, totalVolume: record.totalVolume, totalValue: record.totalValue, positiveStocks: record.positiveStocks, negativeStocks: record.negativeStocks, neutralStocks: record.neutralStocks, topGainers: parseJsonSafe(record.topGainers), topLosers: parseJsonSafe(record.topLosers), topVolumes: parseJsonSafe(record.topVolumes) });
  return {
    id: record.id,
    date: toDateOnlyISO(record.summaryDate || record.date || record.createdAt),
    summaryDate: toDateOnlyISO(record.summaryDate || record.date || record.createdAt),
    overallIndex,
    overallChange,
    overallChangePercent: overallPct,
    equalIndex,
    equalChange,
    equalChangePercent: equalPct,
    displayOverallIndex: overallIndex === null ? null : fa(overallIndex),
    displayOverallChange: overallChange === null ? null : fa(overallChange),
    displayEqualIndex: equalIndex === null ? null : fa(equalIndex),
    displayEqualChange: equalChange === null ? null : fa(equalChange),
    marketStatus: record.marketStatus || rawData.marketStatus || rawData.state || null,
    totalTrades: record.totalTrades?.toString() || (pickValue(rawData, FIELD_KEYS.totalTrades) ?? null)?.toString() || null,
    totalVolume: record.totalVolume?.toString() || (pickValue(rawData, FIELD_KEYS.totalVolume) ?? null)?.toString() || null,
    totalValue: record.totalValue?.toString() || (pickValue(rawData, FIELD_KEYS.totalValue) ?? null)?.toString() || null,
    positiveStocks: record.positiveStocks ?? null,
    negativeStocks: record.negativeStocks ?? null,
    neutralStocks: record.neutralStocks ?? null,
    topGainers: parseJsonSafe(record.topGainers) || [],
    topLosers: parseJsonSafe(record.topLosers) || [],
    topVolumes: parseJsonSafe(record.topVolumes) || [],
    rawJson: record.rawJson || null,
    createdAt: record.createdAt ? new Date(record.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null,
    content,
    summary: content,
    fallback: !overallIndex && !equalIndex && !record.totalValue,
    aiPending: false,
    sourceType: 'deterministic_market_data',
    diagnostics
  };
}

async function retainOnlyLastNSummaries(keep = SUMMARY_RETENTION_COUNT) {
  const model = getMarketSummaryModel();
  const n = Number.isInteger(keep) && keep > 0 ? keep : SUMMARY_RETENTION_COUNT;
  const rows = await model.findMany({ select: { id: true, summaryDate: true }, orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }] });
  if (rows.length <= n) return { deletedCount: 0, kept: rows.length, total: rows.length };
  const ids = rows.slice(n).map(r => r.id);
  const deleted = await model.deleteMany({ where: { id: { in: ids } } });
  return { deletedCount: deleted.count || 0, kept: n, total: rows.length };
}

async function findLatestUsableMarketHistoryRow() {
  const model = getMarketHistoryModel();
  if (!model) return null;
  const rows = await model.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
  for (const row of rows) {
    const parsed = parseJsonSafe(row.jsonData);
    const marketData = extractMarketDataCandidate(parsed);
    if (marketData && !isLikelySyntheticMarketData(marketData)) return { row, marketData };
  }
  return null;
}

async function buildMergedMarketDataForDay(referenceDate, { take = 1500 } = {}) {
  const model = getMarketHistoryModel();
  if (!model) return { merged: null, rowsUsed: 0, inspected: 0 };
  const target = toDateOnlyISO(referenceDate);
  const rows = await model.findMany({ orderBy: { createdAt: 'desc' }, take });
  let merged = null, rowsUsed = 0;
  for (const row of rows) {
    if (!row?.createdAt || toDateOnlyISO(row.createdAt) !== target) continue;
    const candidate = extractMarketDataCandidate(parseJsonSafe(row.jsonData));
    if (!candidate || isLikelySyntheticMarketData(candidate)) continue;
    merged = merged ? deepMergePreferDefined(merged, candidate) : { ...candidate };
    rowsUsed += 1;
  }
  return { merged, rowsUsed, inspected: rows.length };
}
function deepMergePreferDefined(base, extra) {
  if (!base || typeof base !== 'object') return extra;
  if (!extra || typeof extra !== 'object') return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) { if (value.length) out[key] = value; continue; }
    if (typeof value === 'object') out[key] = deepMergePreferDefined(out[key], value);
    else out[key] = value;
  }
  return out;
}

async function findBySummaryDateSafe(targetDay) {
  const model = getMarketSummaryModel();
  try { return await model.findUnique({ where: { summaryDate: targetDay } }); }
  catch { return model.findFirst({ where: { summaryDate: targetDay }, orderBy: [{ id: 'desc' }] }); }
}

async function generateMarketSummary({ marketData, fallbackDate = new Date() }) {
  const model = getMarketSummaryModel();
  if (!isUsableMarketData(marketData) || isLikelySyntheticMarketData(marketData)) {
    return { data: null, sourceType: 'invalid_input', generated: false, reason: 'INVALID_OR_SYNTHETIC_MARKET_DATA' };
  }
  const sourceDate = toDateOrNull(fallbackDate) || new Date();
  const targetDay = getTehranDayStart(sourceDate);
  const breadth = buildBreadth(marketData);
  const payload = {
    summaryDate: targetDay,
    overallIndex: pickValue(marketData, FIELD_KEYS.index),
    overallChange: pickValue(marketData, FIELD_KEYS.changeIndex),
    equalIndex: pickValue(marketData, FIELD_KEYS.equalIndex),
    equalChange: pickValue(marketData, FIELD_KEYS.equalChange),
    marketStatus: firstString(pickValue(marketData, FIELD_KEYS.marketState, firstString)) || 'close',
    totalTrades: toBigIntOrNull(pickValue(marketData, FIELD_KEYS.totalTrades)),
    totalVolume: toBigIntOrNull(pickValue(marketData, FIELD_KEYS.totalVolume)),
    totalValue: toBigIntOrNull(pickValue(marketData, FIELD_KEYS.totalValue)),
    positiveStocks: breadth.positive || null,
    negativeStocks: breadth.negative || null,
    neutralStocks: breadth.neutral || null,
    topGainers: jsonStringifySafe(breadth.gainers),
    topLosers: jsonStringifySafe(breadth.losers),
    topVolumes: jsonStringifySafe(breadth.volumes),
    content: buildDeterministicSummary(marketData),
    summary: buildDeterministicSummary(marketData),
    rawJson: jsonStringifySafe({ data: marketData, meta: { generatedAt: new Date().toISOString(), source: 'deterministic-market-summary', ai: false } })
  };
  const existing = await findBySummaryDateSafe(targetDay);
  const record = existing ? await model.update({ where: { id: existing.id }, data: payload }) : await model.create({ data: payload });
  await retainOnlyLastNSummaries();
  return { data: normalizeSummaryRecord(record), sourceType: 'deterministic_upsert', generated: true, reason: existing ? 'UPDATED_EXISTING_DAY' : 'CREATED_DETERMINISTIC_SUMMARY' };
}

exports.findOrGenerateLatest = async () => {
  const model = getMarketSummaryModel();
  const latest = await model.findFirst({ orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }] });
  if (!latest) return { data: null, sourceType: 'none', generated: false, cached: false, reason: 'NO_DAILY_SUMMARY_AVAILABLE' };
  return { data: normalizeSummaryRecord(latest), sourceType: 'db_daily_summary', generated: false, cached: true, reason: 'DAILY_SUMMARY_FROM_DATABASE' };
};
exports.findHistory = async ({ page = 1, limit = 10 }) => {
  const model = getMarketSummaryModel();
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
  const [items, total] = await Promise.all([
    model.findMany({ orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }], skip: (p - 1) * l, take: l }),
    model.count()
  ]);
  return { data: items.map(normalizeSummaryRecord).filter(Boolean), pagination: { total, page: p, limit: l, totalPages: Math.ceil(total / l) } };
};
exports.getAvailableDates = async () => {
  const model = getMarketSummaryModel();
  const rows = await model.findMany({ select: { id: true, summaryDate: true }, orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }], take: SUMMARY_RETENTION_COUNT });
  return rows.map(r => ({ id: r.id, summaryDate: toDateOnlyISO(r.summaryDate) }));
};
exports.findByDate = async (dateInput) => {
  const target = parseDateInputToTehranDayStart(dateInput);
  if (!target) return null;
  return normalizeSummaryRecord(await findBySummaryDateSafe(target));
};
exports.generateMarketSummary = generateMarketSummary;
exports.findLatestUsableMarketHistoryRow = findLatestUsableMarketHistoryRow;
exports.inspectLatestMarketHistoryRows = async ({ take = 30 } = {}) => {
  const model = getMarketHistoryModel();
  if (!model) return { candidate: null, diagnostics: { reasonCode: 'MODEL_MISSING' } };
  const rows = await model.findMany({ orderBy: { createdAt: 'desc' }, take });
  for (const row of rows) {
    const marketData = extractMarketDataCandidate(parseJsonSafe(row.jsonData));
    if (marketData && !isLikelySyntheticMarketData(marketData)) return { candidate: { row, marketData }, diagnostics: { reasonCode: 'USABLE_MARKET_HISTORY_FOUND', selectedRowId: row.id } };
  }
  return { candidate: null, diagnostics: { reasonCode: 'NO_USABLE_MARKET_HISTORY', checkedRows: rows.length } };
};
exports.normalizeSummaryRecord = normalizeSummaryRecord;
exports.isUsableMarketData = isUsableMarketData;
exports.isLikelySyntheticMarketData = isLikelySyntheticMarketData;
exports.getNowInTehran = () => new Date();
exports.retainOnlyLastNSummaries = retainOnlyLastNSummaries;
exports.runCatchUpForMissingSummary = async () => ({ data: null, generated: false, reason: 'CATCH_UP_DISABLED_DAILY_ONLY_12_35' });
exports.findLatestUnsummarizedMarketDay = async () => null;
exports.isTradingDay = isTradingDay;
exports.buildMergedMarketDataForDay = buildMergedMarketDataForDay;
