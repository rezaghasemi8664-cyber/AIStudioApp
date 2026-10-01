'use strict';

const prismaModule = require('../config/prisma.cjs');
const env = require('../config/env.cjs');
const sharedMarketService = require('./sharedMarket.service.cjs');

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
  const close = pickValue(row, [...FIELD_KEYS.pctClose, 'changePercent', 'change']);
  if (close !== null) return close;
  const last = pickValue(row, FIELD_KEYS.pctLast);
  if (last !== null) return last;
  const current = pickValue(row, ['lastPrice', 'pl', 'last', 'closingPrice', 'pc', 'close']);
  const previous = pickValue(row, ['yesterday', 'py', 'previousClose']);
  return current !== null && previous !== null && previous !== 0 ? ((current - previous) / previous) * 100 : null;
}
function normalizeMoverList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(x => ({
    symbol: firstString(x?.symbol, x?.name, x?.l18, x?.l30) || 'نامشخص',
    pct: pickValue(x, ['changePercent', 'percentChange', 'pct', 'pcp', 'plp']),
    volume: pickValue(x, ['volume', 'totalVolume', 'tvol']) ?? 0,
    value: pickValue(x, ['value', 'totalValue', 'tradeValue', 'tval']) ?? 0
  }));
}
function buildBreadth(data) {
  const explicitPositive = toNumber(data?.positiveStocks);
  const explicitNegative = toNumber(data?.negativeStocks);
  const explicitNeutral = toNumber(data?.neutralStocks);
  const explicitTotal = [explicitPositive, explicitNegative, explicitNeutral].every(v => v !== null)
    ? explicitPositive + explicitNegative + explicitNeutral : null;

  const explicitGainers = normalizeMoverList(data?.topGainers);
  const explicitLosers = normalizeMoverList(data?.topLosers);
  const explicitVolumes = normalizeMoverList(data?.topVolumes);

  // Central worker/shared market service may already have calculated breadth
  // from the real MarketSymbolCurrent snapshot. Prefer those values when no
  // raw symbol array is embedded in marketData.
  const rows = normalizeSymbolsList(data);
  if (!rows.length && explicitTotal !== null) {
    return {
      positive: explicitPositive,
      negative: explicitNegative,
      neutral: explicitNeutral,
      total: explicitTotal,
      coverage: data?.breadthCoveragePercent ?? null,
      gainers: explicitGainers,
      losers: explicitLosers,
      volumes: explicitVolumes
    };
  }

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
  const volumes = [...items].sort((a,b) => (b.volume-a.volume) || (b.value-a.value)).slice(0,10);
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
  const leaders = normalized
    .filter(x => x.change !== null && x.change > 0)
    .sort((a,b) => b.change - a.change)
    .slice(0,3);

  const laggards = normalized
    .filter(x => x.change !== null && x.change < 0)
    .sort((a,b) => a.change - b.change)
    .slice(0,3);

  return { leaders, laggards };
}
function extractMoneyFlow(data) {
  const flow = data?.realFlow || data?.moneyFlow || data?.realMoneyFlow || {};
  const netVolume = pickValue(flow, ['netRealBuyVolume', 'netVolume', 'net', 'realNet']);
  const buyVolume = pickValue(flow, ['totalRealBuyVolume', 'buyVolume']);
  const sellVolume = pickValue(flow, ['totalRealSellVolume', 'sellVolume']);
  const netValue = pickValue(flow, ['netValue', 'netMoneyFlow']);
  const buyValue = pickValue(flow, ['buyValue', 'realBuyValue']);
  const sellValue = pickValue(flow, ['sellValue', 'realSellValue']);
  return {
    net: netValue !== null ? netValue : netVolume,
    buy: buyValue !== null ? buyValue : buyVolume,
    sell: sellValue !== null ? sellValue : sellVolume,
    unit: netValue !== null || buyValue !== null || sellValue !== null ? 'value' : 'volume'
  };
}
function technicalSma(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const tail = values.slice(-period);
  return tail.reduce((sum, value) => sum + value, 0) / period;
}
function technicalEma(values, period) {
  // Do not silently shorten the requested EMA period. Doing so makes EMA10
  // equal to EMA5 when only five observations exist and can create false
  // crossover signals. A period is reported only when enough observations
  // are available to calculate that period.
  if (!Array.isArray(values) || values.length < period || period < 2) return null;
  let emaValue = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const multiplier = 2 / (period + 1);
  for (const value of values.slice(period)) emaValue = (value - emaValue) * multiplier + emaValue;
  return emaValue;
}
function technicalRsi(values, period = 14) {
  if (!Array.isArray(values) || values.length < period + 1) return null;
  const changes = [];
  for (let i = 1; i < values.length; i += 1) changes.push(values[i] - values[i - 1]);
  const tail = changes.slice(-period);
  const gains = tail.reduce((sum, v) => sum + Math.max(0, v), 0);
  const losses = tail.reduce((sum, v) => sum + Math.max(0, -v), 0);
  if (losses === 0) return gains > 0 ? 100 : 50;
  return 100 - (100 / (1 + ((gains / period) / (losses / period))));
}
function technicalDirection(score) {
  return score >= 2 ? 'صعودی' : score <= -2 ? 'نزولی' : 'خنثی/ترکیبی';
}
async function getHistoricalIndexSeries(referenceDate, limit = 60) {
  const model = getMarketHistoryModel();
  if (!model) return [];
  const targetDay = toDateOnlyISO(referenceDate);
  try {
    const rows = await model.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3000,
      select: { id: true, jsonData: true, createdAt: true }
    });
    const byDay = new Map();
    for (const row of rows) {
      const day = toDateOnlyISO(row.createdAt);
      if (!day || day === targetDay) continue;
      const candidate = extractMarketDataCandidate(parseJsonSafe(row.jsonData));
      if (!candidate || isLikelySyntheticMarketData(candidate)) continue;
      const index = pickValue(candidate, FIELD_KEYS.index);
      if (index === null) continue;
      const previous = byDay.get(day);
      if (!previous || new Date(row.createdAt).getTime() > new Date(previous.createdAt).getTime()) {
        byDay.set(day, { date: day, createdAt: row.createdAt, index });
      }
    }
    return [...byDay.values()]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(-Math.max(1, Number(limit) || 60));
  } catch (_) {
    return [];
  }
}

async function buildTechnicalMarketAnalysis(currentMarketData, fallbackDate = new Date()) {
  const historical = await getHistoricalIndexSeries(fallbackDate, 60);
  const history = historical.map(r => ({ index: r.index, equal: null }));
  const currentIndex = pickValue(currentMarketData, FIELD_KEYS.index);
  const currentEqual = pickValue(currentMarketData, FIELD_KEYS.equalIndex);
  if (currentIndex !== null) history.push({ index: currentIndex, equal: currentEqual });
  const closes = history.map(r => r.index).filter(Number.isFinite);
  if (closes.length < 3) {
    return {
      available: false,
      text: '۱۵) تحلیل تکنیکال و چشم‌انداز کوتاه‌مدت: داده تاریخی واقعی کافی برای محاسبه معتبر شاخص‌های تکنیکال در دسترس نیست؛ بنابراین پیش‌بینی روند روزهای آینده ارائه نمی‌شود تا از حدس‌زدن جلوگیری شود.',
      indicators: { observations: closes.length }
    };
  }
  const latest = closes[closes.length - 1];
  const previous = closes[closes.length - 2];
  const sma5 = technicalSma(closes, 5);
  const sma10 = technicalSma(closes, 10);
  const ema5 = technicalEma(closes, 5);
  const ema10 = technicalEma(closes, 10);
  const rsi14 = technicalRsi(closes, 14);
  const ema12 = technicalEma(closes, 12);
  const ema26 = technicalEma(closes, 26);
  const macd = ema12 !== null && ema26 !== null ? ema12 - ema26 : null;
  const momentum = previous !== 0 ? ((latest - previous) / previous) * 100 : null;
  let score = 0;
  const signals = [];
  if (sma5 !== null) {
    score += latest > sma5 ? 1 : latest < sma5 ? -1 : 0;
    if (latest !== sma5) signals.push(latest > sma5 ? 'شاخص بالاتر از SMA5' : 'شاخص پایین‌تر از SMA5');
  }
  if (sma10 !== null) {
    score += latest > sma10 ? 1 : latest < sma10 ? -1 : 0;
    if (latest !== sma10) signals.push(latest > sma10 ? 'شاخص بالاتر از SMA10' : 'شاخص پایین‌تر از SMA10');
  }
  if (ema5 !== null && ema10 !== null) {
    score += ema5 > ema10 ? 1 : ema5 < ema10 ? -1 : 0;
    if (ema5 !== ema10) signals.push(ema5 > ema10 ? 'EMA5 بالاتر از EMA10' : 'EMA5 پایین‌تر از EMA10');
  }
  if (rsi14 !== null) {
    if (rsi14 >= 70) { score -= 1; signals.push('RSI14 در اشباع خرید'); }
    else if (rsi14 <= 30) { score += 1; signals.push('RSI14 در اشباع فروش'); }
    else if (rsi14 >= 55) { score += 1; signals.push('RSI14 بالاتر از ۵۵'); }
    else if (rsi14 <= 45) { score -= 1; signals.push('RSI14 پایین‌تر از ۴۵'); }
  }
  if (macd !== null) {
    score += macd > 0 ? 1 : macd < 0 ? -1 : 0;
    if (macd !== 0) signals.push(macd > 0 ? 'MACD بالاتر از صفر' : 'MACD پایین‌تر از صفر');
  }
  const trendDirection = technicalDirection(score);
  const window = closes.slice(-Math.min(20, closes.length));
  const support = Math.min(...window);
  const resistance = Math.max(...window);
  const technicalText = [
    '۱۵) تحلیل تکنیکال و چشم‌انداز کوتاه‌مدت: این بخش با محاسبات قطعی روی سری تاریخی واقعی شاخص کل تولید شده و به مدل هوش مصنوعی وابسته نیست.',
    `SMA5: ${fa(sma5)}؛ SMA10: ${fa(sma10)}؛ EMA5: ${fa(ema5)}؛ EMA10: ${fa(ema10)}؛ RSI14: ${rsi14 === null ? 'قابل محاسبه نیست' : fa(rsi14)}؛ MACD: ${macd === null ? 'قابل محاسبه نیست' : fa(macd)}؛ مومنتوم آخرین جلسه: ${signedPct(momentum)}.`,
    `محدوده ۲۰ جلسه اخیر: حمایت محاسباتی ${fa(support)} و مقاومت محاسباتی ${fa(resistance)}؛ روند شاخص هم‌وزن برای این سری تاریخی در دسترس نیست مگر داده تاریخی هم‌وزن نیز ذخیره شده باشد.`,
    `برآیند ابزارهای تکنیکال، سوگیری فعلی را «${trendDirection}» نشان می‌دهد. سناریوی پایه ۱ تا ۳ جلسه آینده ${trendDirection === 'صعودی' ? 'متمایل به تداوم حرکت صعودی، مشروط به حفظ رابطه فعلی با میانگین‌ها' : trendDirection === 'نزولی' ? 'متمایل به تداوم حرکت نزولی، مشروط به حفظ رابطه فعلی با میانگین‌ها' : 'خنثی/نوسانی است و جهت معتبر تا دریافت داده جدید تأیید نشده است'}.`,
    `سیگنال‌های اصلی: ${signals.length ? signals.join('؛ ') : 'سیگنال قطعی از ابزارهای در دسترس شناسایی نشد'}.`,
    `تعداد جلسات تاریخی واقعی استفاده‌شده: ${fa(closes.length, 0)}. شاخص‌هایی که داده کافی برای آن‌ها وجود ندارد عمداً قطعی تلقی نشده‌اند. این چشم‌انداز پیش‌بینی قطعی بازار یا توصیه خرید/فروش نیست و با ورود داده جلسات بعدی باید دوباره محاسبه شود.`
  ].join('\\n\\n');
  return {
    available: true,
    text: technicalText,
    indicators: { observations: closes.length, sma5, sma10, ema5, ema10, rsi14, ema12, ema26, macd, momentum, support, resistance }
  };
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
  const flowText = flow.net === null
    ? 'داده جریان خرید و فروش حقیقی در دسترس نیست.'
    : flow.unit === 'volume'
      ? flow.net > 0
        ? `خالص حجم خرید حقیقی ${fa(flow.net, 0)} واحد است.`
        : flow.net < 0
          ? `خالص حجم فروش حقیقی ${fa(Math.abs(flow.net), 0)} واحد است.`
          : 'خالص حجم خرید و فروش حقیقی متعادل است.'
      : flow.net > 0
        ? `ورود خالص پول حقیقی ${fa(flow.net)} است.`
        : flow.net < 0
          ? `خروج خالص پول حقیقی ${fa(Math.abs(flow.net))} است.`
          : 'جریان خالص پول حقیقی متعادل است.';
  const breadthRatio = breadth.negative ? breadth.positive / breadth.negative : null;
  // Do not infer a risk level from market direction alone. A risk label is
  // only valid when an independent, validated volatility/risk metric exists.
  const volatility = pickValue(data, ['volatility', 'volatilityPercent', 'marketVolatility', 'riskScore']);
  const risk = volatility === null ? 'قابل محاسبه نیست' : volatility;
  const technical = data.__technicalAnalysis;

  return [
    `۱) وضعیت کلی بازار: بازار ${state} است؛ برآیند شاخص کل ${direction(overallChange)}، شاخص هم‌وزن ${direction(equalChange)} و پهنای بازار ${breadth.positive > breadth.negative ? 'مثبت' : breadth.negative > breadth.positive ? 'منفی' : 'متعادل'} است؛ سوگیری ترکیبی داده‌ها «${bias}» است.`,
    `۲) شاخص‌ها: شاخص کل ${fa(overall)} واحد با تغییر ${signedPct(overallPct)} و تغییر عددی ${fa(overallChange)} واحد؛ شاخص هم‌وزن ${fa(equal)} واحد با تغییر ${signedPct(equalPct)} و تغییر عددی ${fa(equalChange)} واحد.`,
    `۳) پهنای بازار: ${fa(breadth.positive,0)} نماد مثبت، ${fa(breadth.negative,0)} نماد منفی و ${fa(breadth.neutral,0)} نماد خنثی از ${fa(breadth.total,0)} نماد واجد شرایط تحلیل از snapshot؛ نسبت مثبت به منفی ${fa(breadthRatio)} و پوشش محاسبه ${breadth.coverage === null ? 'نامشخص' : signedPct(breadth.coverage)} است.`,
    `۴) نقدشوندگی و معاملات: تعداد معاملات ${fa(trades,0)}، حجم معاملات ${fa(volume,0)} و ارزش معاملات ${fa(value,0)} ثبت شده است؛ در صورت وجود فهرست نمادها، بیشترین حجم مربوط به ${volumes} است.`,
    `۵) جریان پول حقیقی: ${flowText}${flow.buy !== null || flow.sell !== null ? (flow.unit === 'volume' ? ` حجم خرید حقیقی ${fa(flow.buy, 0)} و حجم فروش حقیقی ${fa(flow.sell, 0)} است.` : ` ارزش خرید حقیقی ${fa(flow.buy)} و ارزش فروش حقیقی ${fa(flow.sell)} است.`) : ''}`,
    `۶) چرخش صنایع: گروه‌های با تغییر مثبت‌تر: ${leaders}؛ گروه‌های با تغییر منفی‌تر: ${laggards}.`,
    `۷) مومنتوم و روند: وضعیت جلسه بر اساس دو شاخص «${bias}» است؛ شاخص کل ${direction(overallChange)} و هم‌وزن ${direction(equalChange)} هستند. مومنتوم چندجلسه‌ای فقط با داده معتبر از جلسات قبلی قابل محاسبه است و در نبود آن گزارش نمی‌شود.`,
    `۸) ریسک و نوسان: ${risk === 'قابل محاسبه نیست' ? 'سطح ریسک مستقل قابل محاسبه نیست؛ داده معتبر نوسان یا ریسک در دسترس نیست.' : `شاخص ریسک/نوسان ثبت‌شده «${fa(risk)}» است و صرفاً بر اساس داده معتبر نوسان گزارش می‌شود.`}`,
    `۹) واگرایی‌ها و هشدارها: شاخص کل ${direction(overallChange)}، شاخص هم‌وزن ${direction(equalChange)} و پهنای بازار ${breadth.positive > breadth.negative ? 'مثبت' : breadth.negative > breadth.positive ? 'منفی' : 'متعادل'} است. ${(direction(overallChange) !== direction(equalChange) || direction(overallChange) !== (breadth.positive > breadth.negative ? 'مثبت' : breadth.negative > breadth.positive ? 'منفی' : 'متعادل')) ? 'اختلاف جهت بین مؤلفه‌ها مشاهده می‌شود و به‌عنوان واگرایی فعلی گزارش می‌شود.' : 'اختلاف جهت معناداری بین این سه مؤلفه مشاهده نمی‌شود.'}`,
    `۱۰) نمادهای شاخص حرکت: برترین رشدهای محاسبه‌شده: ${gainers}؛ برترین افت‌ها: ${losers}؛ نمادهای پرتراکنش از نظر حجم: ${volumes}.`,
    `۱۱) شرایط تغییر وضعیت: ادامه وضعیت فعلی با حفظ جهت شاخص‌ها و پهنای بازار سنجیده می‌شود؛ تغییر به وضعیت منفی با افت شاخص‌ها و افزایش سهم نمادهای منفی قابل مشاهده خواهد بود. این بخش صرفاً شروط داده‌ای را توصیف می‌کند و پیش‌بینی بازار نیست.`,
    `۱۲) جمع‌بندی داده‌ای: در داده فعلی، شاخص‌ها و پهنای بازار ${bias === 'صعودی' ? 'مثبت' : bias === 'نزولی' ? 'منفی' : 'ترکیبی'} هستند؛ این عبارت صرفاً توصیف وضعیت ثبت‌شده بازار است و توصیه سرمایه‌گذاری محسوب نمی‌شود.`,
    `۱۳) شروط پایش: تغییر جهت شاخص‌ها، تغییر نسبت نمادهای مثبت و منفی، و تغییر جریان پول حقیقی باید در داده‌های بعدی پایش شود؛ در حالت ترکیبی، تغییر وضعیت تنها پس از مشاهده داده جدید گزارش می‌شود.`,
    `۱۴) کیفیت داده و محدودیت تحلیل: ${breadth.total > 0 ? `عرض بازار از ${fa(breadth.total,0)} نماد واجد شرایط تحلیل از snapshot محاسبه شده و پوشش snapshot ${breadth.coverage === null ? 'نامشخص' : signedPct(breadth.coverage)} است` : 'عرض بازار از فهرست نمادهای موجود قابل محاسبه کامل نیست'}؛ رکوردهای فاقد شرایط معتبر تحلیل از محاسبات کنار گذاشته شده‌اند و هیچ مقدار یا نتیجه‌ای که داده معتبر برای آن وجود نداشته باشد حدس زده نشده است. منبع محاسباتی این خلاصه داده بازار و سوابق ذخیره‌شده است و به مدل هوش مصنوعی وابسته نیست.`,
    technical?.text || '۱۵) تحلیل تکنیکال و چشم‌انداز کوتاه‌مدت: داده تاریخی کافی برای محاسبه معتبر شاخص‌های تکنیکال در دسترس نیست؛ پیش‌بینی روند ارائه نشد.',
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
  // Manual/admin summary generation must use the same central market source
  // as the live UI. Legacy MarketHistory is intentionally not a market-data
  // source anymore.
  const [market, breadth, industries] = await Promise.all([
    sharedMarketService.getMarketCurrent(),
    sharedMarketService.getBreadth(),
    sharedMarketService.getIndustries(50)
  ]);

  if (!market || !breadth) return null;

  const industryRows = Array.isArray(industries) ? industries : [];
  const marketData = {
    ...market,
    index: market.overallIndex,
    index_change: market.overallChange,
    indexEqualWeight: market.equalIndex,
    indexEqualWeightChange: market.equalChange,
    marketStatus: market.marketStatus,
    totalTrades: market.totalTrades,
    totalVolume: market.totalVolume,
    totalValue: market.totalValue,
    topGainers: breadth.topGainers || [],
    topLosers: breadth.topLosers || [],
    topVolumes: breadth.topVolumes || [],
    positiveStocks: breadth.positive ?? null,
    negativeStocks: breadth.negative ?? null,
    neutralStocks: breadth.neutral ?? null,
    breadthCoveragePercent: breadth.coveragePercent ?? null,
    breadthSnapshotRows: Array.isArray(breadth.snapshotRows) ? breadth.snapshotRows.length : null,
    breadthEligibleRows: breadth.total ?? null,
    industries: industryRows.map(x => ({
      name: x.industryName,
      changePercent: x.changePercent,
      value: x.value,
      symbolCount: x.symbolCount
    })),
    sectors: industryRows.map(x => ({
      name: x.industryName,
      changePercent: x.changePercent,
      value: x.value,
      symbolCount: x.symbolCount
    })),
    realFlow: breadth.realFlow || null
  };

  return {
    row: {
      id: market.id,
      createdAt: market.updatedAt || new Date()
    },
    marketData
  };
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
  const technical = await buildTechnicalMarketAnalysis(marketData, sourceDate);
  const summaryData = { ...marketData, __technicalAnalysis: technical };
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
    content: buildDeterministicSummary(summaryData),
    summary: buildDeterministicSummary(summaryData),
    rawJson: jsonStringifySafe({ data: marketData, meta: { generatedAt: new Date().toISOString(), source: 'deterministic-market-summary', ai: false } })
  };
  const existing = await findBySummaryDateSafe(targetDay);
  const record = existing ? await model.update({ where: { id: existing.id }, data: payload }) : await model.create({ data: payload });
  await retainOnlyLastNSummaries();
  return { data: normalizeSummaryRecord(record), sourceType: 'deterministic_upsert', generated: true, reason: existing ? 'UPDATED_EXISTING_DAY' : 'CREATED_DETERMINISTIC_SUMMARY' };
}

async function ensureRecentTradingDaySummaries(daysBack = 7) {
  const model = getMarketSummaryModel();
  const ensured = [];
  const now = new Date();

  for (let offset = 0; offset <= daysBack; offset += 1) {
    const reference = new Date(now.getTime() - offset * 86400000);
    if (!isTradingDay(reference)) continue;

    const targetDay = getTehranDayStart(reference);
    const existing = await findBySummaryDateSafe(targetDay);
    if (existing) {
      ensured.push({ date: toDateOnlyISO(targetDay), status: 'existing', id: existing.id });
      continue;
    }

    let marketData = null;
    let fallbackDate = reference;

    if (offset === 0) {
      const current = await findLatestUsableMarketHistoryRow();
      marketData = current?.marketData || null;
      fallbackDate = current?.row?.createdAt || reference;
    } else {
      const merged = await buildMergedMarketDataForDay(reference);
      marketData = merged?.merged || null;
      fallbackDate = reference;
    }

    if (!isUsableMarketData(marketData) || isLikelySyntheticMarketData(marketData)) {
      continue;
    }

    const result = await generateMarketSummary({ marketData, fallbackDate });
    if (result?.data) {
      ensured.push({ date: toDateOnlyISO(targetDay), status: result.generated ? 'created' : 'updated', id: result.data.id });
    }
  }

  return ensured;
}


async function rebuildExistingTechnicalSummaries({ limit = SUMMARY_RETENTION_COUNT } = {}) {
  const model = getMarketSummaryModel();
  const rows = await model.findMany({
    orderBy: [{ summaryDate: 'asc' }, { id: 'asc' }],
    take: Math.min(50, Math.max(1, Number(limit) || SUMMARY_RETENTION_COUNT))
  });
  const updated = [];
  for (const record of rows) {
    const raw = parseJsonSafe(record.rawJson) || {};
    const rawData = raw?.data && typeof raw.data === 'object' ? raw.data : {};
    const marketData = {
      ...rawData,
      overallIndex: toNumber(record.overallIndex) ?? pickValue(rawData, FIELD_KEYS.index),
      overallChange: toNumber(record.overallChange) ?? pickValue(rawData, FIELD_KEYS.changeIndex),
      equalIndex: toNumber(record.equalIndex) ?? pickValue(rawData, FIELD_KEYS.equalIndex),
      equalChange: toNumber(record.equalChange) ?? pickValue(rawData, FIELD_KEYS.equalChange),
      marketStatus: record.marketStatus || rawData.marketStatus || rawData.state,
      totalTrades: record.totalTrades,
      totalVolume: record.totalVolume,
      totalValue: record.totalValue,
      positiveStocks: record.positiveStocks,
      negativeStocks: record.negativeStocks,
      neutralStocks: record.neutralStocks,
      topGainers: parseJsonSafe(record.topGainers) || [],
      topLosers: parseJsonSafe(record.topLosers) || [],
      topVolumes: parseJsonSafe(record.topVolumes) || []
    };
    if (!isUsableMarketData(marketData) || isLikelySyntheticMarketData(marketData)) continue;
    const technical = await buildTechnicalMarketAnalysis(marketData, record.summaryDate);
    const content = buildDeterministicSummary({ ...marketData, __technicalAnalysis: technical });
    const saved = await model.update({
      where: { id: record.id },
      data: { content, summary: content }
    });
    updated.push({ id: saved.id, summaryDate: toDateOnlyISO(saved.summaryDate), observations: technical?.indicators?.observations ?? null, technicalAvailable: Boolean(technical?.available) });
  }
  return { updatedCount: updated.length, updated };
}

exports.findOrGenerateLatest = async () => {
  const ensured = await ensureRecentTradingDaySummaries(7);
  const model = getMarketSummaryModel();
  const latest = await model.findFirst({ orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }] });
  if (!latest) {
    return { data: null, sourceType: 'none', generated: false, cached: false, reason: 'NO_DAILY_SUMMARY_AVAILABLE', ensured };
  }
  return {
    data: normalizeSummaryRecord(latest),
    sourceType: 'db_daily_summary',
    generated: ensured.some(x => x.status === 'created'),
    cached: true,
    reason: ensured.length ? 'RECENT_TRADING_DAY_SUMMARIES_ENSURED' : 'DAILY_SUMMARY_FROM_DATABASE',
    ensured
  };
};
exports.findHistory = async ({ page = 1, limit = 10 }) => {
  await ensureRecentTradingDaySummaries(7);
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
exports.rebuildExistingTechnicalSummaries = rebuildExistingTechnicalSummaries;
exports.getHistoricalIndexSeries = getHistoricalIndexSeries;
