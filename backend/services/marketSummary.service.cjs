'use strict';

const axios = require('axios');
const prismaModule = require('../config/prisma.cjs');
const env = require('../config/env.cjs');

/* ================================
 * Prisma Safe Resolver
 * ================================ */
function resolvePrismaClient(mod) {
  const candidates = [mod?.prisma, mod?.db, mod?.client, mod?.default, mod];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') return candidate;
  }
  return null;
}

const prisma = resolvePrismaClient(prismaModule);

if (!prisma) {
  throw new Error(
    '[MarketSummaryService] Prisma client is unavailable. Check exports in config/prisma.cjs'
  );
}

function getModel(prismaClient, pascalName, camelName) {
  return prismaClient?.[pascalName] || prismaClient?.[camelName] || null;
}

function getMarketSummaryModel() {
  const model = getModel(prisma, 'MarketSummary', 'marketSummary');
  if (!model) {
    throw new Error(
      '[MarketSummaryService] MarketSummary model is unavailable on Prisma client.'
    );
  }
  return model;
}

function getMarketHistoryModel() {
  return getModel(prisma, 'MarketHistory', 'marketHistory');
}

/* ================================
 * Config & Constants
 * ================================ */
const TEHRAN_TIMEZONE = 'Asia/Tehran';
const TRADING_DAY_NAMES = new Set(['sat', 'sun', 'mon', 'tue', 'wed']);
const AI_PENDING_TEXT = 'در حال تولید تحلیل...';
const AI_UNAVAILABLE_TEXT = 'تحلیل هوشمند در دسترس نیست';
const STALE_THRESHOLD_HOURS = Number(env.MARKET_DATA_STALE_HOURS || 24);
const SUMMARY_RETENTION_COUNT = Number(env.MARKET_SUMMARY_RETENTION_COUNT || 5);

/* ================================
 * Field map
 * ================================ */
const FIELD_KEYS = {
  index: ['index', 'index_main', 'index_total', 'index_tepix', 'market_index', 'tedpix'],
  changeIndex: ['change_index', 'index_change', 'index_change_value', 'index_diff', 'tepix_change'],
  equalIndex: ['equalWeight_index', 'index_equalWeight', 'index_equal_weight', 'equal_weight_index', 'equal_index'],
  equalChange: ['change_equalWeight_index', 'index_equalWeight_change', 'index_equal_weight_change', 'equal_weight_change', 'equal_change'],
  marketState: ['state', 'market_state', 'status', 'marketStatus'],
  totalTrades: ['tno', 'total_trades', 'trade_count', 'trades'],
  totalVolume: ['tvol', 'total_volume', 'volume', 'trade_volume'],
  totalValue: ['tval', 'total_value', 'value', 'trade_value'],
  pctClose: ['pcp', 'pCp', 'percent_close', 'close_percent', 'closeChangePercent'],
  pctLast: ['plp', 'pLp', 'percent_last', 'last_percent', 'lastChangePercent'],
  symbol: ['symbol', 'namad', 'l18', 'l30', 'name', 'insCode']
};

/* ================================
 * JSON & BigInt Helpers
 * ================================ */
function jsonStringifySafe(value, space = 0) {
  return JSON.stringify(
    value,
    (_, currentValue) => (typeof currentValue === 'bigint' ? currentValue.toString() : currentValue),
    space
  );
}

function parseJsonSafe(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/* ================================
 * Date & Time Helpers
 * ================================ */
function toDateOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTimeZoneParts(date, timeZone = TEHRAN_TIMEZONE) {
  const safeDate = toDateOrNull(date) || new Date();
  const formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
    hourCycle: 'h23'
  });

  const parts = {};
  for (const part of formatter.formatToParts(safeDate)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: String(parts.weekday || '').trim().toLowerCase()
  };
}

function getTehranDayStart(date) {
  const parts = getTimeZoneParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0));
}

// ⚠️ جلوگیری از تولید زودهنگام تحلیل «امروز»: قبل از ساعت پایان بازار
// (۱۲:۳۵)، حتی اگر چند اسنپ‌شات اولیه‌ی امروز در MarketHistory باشد،
// نباید یک رکورد MarketSummary جدید برای امروز ساخته شود — چون این کار
// باعث می‌شود retention آخرین تحلیل کامل روز قبل را زودتر از موقع حذف
// کند. فقط پچ‌کردنِ رکوردِ از قبل موجود مجاز است، نه ساختن رکورد تازه.
const SAME_DAY_GENERATION_CUTOFF_MINUTES = 12 * 60 + 35; // 12:35 به وقت تهران

function isTehranToday(day) {
  return toDateOnlyISO(day) === toDateOnlyISO(getTehranDayStart(new Date()));
}

function isBeforeTodaysGenerationWindow() {
  const parts = getTimeZoneParts(new Date());
  const minutesNow = parts.hour * 60 + parts.minute;
  return minutesNow < SAME_DAY_GENERATION_CUTOFF_MINUTES;
}

function toDateOnlyISO(date) {
  const d = toDateOrNull(date);
  if (!d) return null;
  const formatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory', {
    timeZone: TEHRAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

function resolveBestDate(raw, fallbackDate) {
  const candidates = [raw?.snapshotCreatedAt, raw?.createdAt, raw?.dateTime, raw?.date];
  const now = new Date();
  for (const candidate of candidates) {
    const parsed = toDateOrNull(candidate);
    if (parsed && parsed <= now) return parsed;
  }
  return toDateOrNull(fallbackDate) || now;
}

function calcStaleInfo(referenceDate) {
  const d = toDateOrNull(referenceDate);
  if (!d) return { stale: true, staleHours: null, staleReason: 'INVALID_REFERENCE_DATE' };
  const diffMs = Date.now() - d.getTime();
  const staleHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  return {
    stale: staleHours >= STALE_THRESHOLD_HOURS,
    staleHours,
    staleReason: staleHours >= STALE_THRESHOLD_HOURS ? 'DATA_STALE_NO_FRESH_INGEST' : null
  };
}

function parseDateInputToTehranDayStart(input) {
  if (!input) return null;
  if (input instanceof Date) return getTehranDayStart(input);

  const raw = String(input).trim();
  if (!raw) return null;

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (y > 1900 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
    }
  }

  const parsed = toDateOrNull(raw);
  if (!parsed) return null;
  return getTehranDayStart(parsed);
}

/* ================================
 * Primitive Parsers
 * ================================ */
function normalizeDigits(input) {
  return String(input)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);

  const normalized = normalizeDigits(String(value))
    .replace(/[,\u066C\u2009\u202F\s]/g, '')
    .replace(/\u2212/g, '-')
    .trim();

  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function toBigIntOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'bigint') return value;
  try {
    const normalized = normalizeDigits(String(value))
      .replace(/[,\u066C\u2009\u202F\s]/g, '')
      .replace(/\u2212/g, '-')
      .trim();
    if (!normalized) return null;
    const n = Number(normalized);
    if (!Number.isFinite(n)) return null;
    return BigInt(Math.trunc(n));
  } catch {
    return null;
  }
}

function firstString(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

function keyVariants(key) {
  if (!key) return [];
  const k = String(key).trim();
  if (!k) return [];
  const snake = k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const lower = k.toLowerCase();
  return Array.from(new Set([k, lower, snake, camel]));
}

function getValueBySmartKey(obj, key) {
  if (!obj || typeof obj !== 'object' || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

  const objKeys = Object.keys(obj);
  const lowerMap = new Map(objKeys.map((k) => [k.toLowerCase(), k]));
  const variants = keyVariants(key);

  for (const v of variants) {
    const realKey = lowerMap.get(String(v).toLowerCase());
    if (realKey && Object.prototype.hasOwnProperty.call(obj, realKey)) return obj[realKey];
  }
  return undefined;
}

function pickValue(obj, keys, parser = toNumber) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    const raw = getValueBySmartKey(obj, key);
    const parsed = parser(raw);
    if (parsed !== null) return parsed;
  }
  return null;
}

/* ================================
 * Diagnostics Helpers
 * ================================ */
function buildResult({
  data = null,
  sourceType = 'unknown',
  cached = false,
  generated = false,
  error = false,
  reason = null,
  message = null,
  diagnostics = null
} = {}) {
  return { data, sourceType, cached, generated, error, reason, message, diagnostics };
}
function logInfo(message, extra) { console.log(`[MarketSummaryService] ${message}`, extra ?? ''); }
function logWarn(message, extra) { console.warn(`[MarketSummaryService] ${message}`, extra ?? ''); }
function logError(message, extra) { console.error(`[MarketSummaryService] ${message}`, extra ?? ''); }

/* ================================
 * Market Logic
 * ================================ */
function hasMeaningfulValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

function isUsableMarketData(marketData) {
  if (!marketData || typeof marketData !== 'object') return false;
  const signals = [
    pickValue(marketData, FIELD_KEYS.index, toNumber),
    pickValue(marketData, FIELD_KEYS.changeIndex, toNumber),
    pickValue(marketData, FIELD_KEYS.equalIndex, toNumber),
    pickValue(marketData, FIELD_KEYS.equalChange, toNumber),
    pickValue(marketData, FIELD_KEYS.totalValue, toNumber),
    pickValue(marketData, FIELD_KEYS.totalVolume, toNumber),
    pickValue(marketData, FIELD_KEYS.totalTrades, toNumber)
  ];
  return signals.some(hasMeaningfulValue);
}

function isLikelySyntheticMarketData(marketData) {
  if (!marketData || typeof marketData !== 'object') return false;

  const overallIndex = pickValue(marketData, FIELD_KEYS.index, toNumber);
  const overallChange = pickValue(marketData, FIELD_KEYS.changeIndex, toNumber);
  const equalIndex = pickValue(marketData, FIELD_KEYS.equalIndex, toNumber);
  const equalChange = pickValue(marketData, FIELD_KEYS.equalChange, toNumber);
  const totalTrades = pickValue(marketData, FIELD_KEYS.totalTrades, toNumber);
  const totalVolume = pickValue(marketData, FIELD_KEYS.totalVolume, toNumber);
  const totalValue = pickValue(marketData, FIELD_KEYS.totalValue, toNumber);

  const hardcodedFingerprint =
    overallIndex === 2150000 &&
    overallChange === 15000 &&
    equalIndex === 720000 &&
    equalChange === 2500 &&
    totalTrades === 450000 &&
    totalVolume === 8000000000 &&
    totalValue === 5500000000000;

  if (hardcodedFingerprint) return true;

  const keyNums = [overallIndex, overallChange, equalIndex, equalChange, totalTrades, totalVolume, totalValue]
    .filter((x) => x !== null && Number.isFinite(x));

  if (keyNums.length < 5) return false;

  const roundCount = keyNums.filter((n) => Math.abs(n) >= 1000 && Math.abs(n) % 1000 === 0).length;
  const roundRatio = roundCount / keyNums.length;

  return roundRatio >= 0.85;
}

function normalizeMarketStatus(value) {
  const status = firstString(value)?.toLowerCase();
  if (!status) return null;
  if (['open', 'opened', 'باز'].some((item) => status.includes(item))) return 'open';
  if (['close', 'closed', 'بسته'].some((item) => status.includes(item))) return 'close';
  return status.slice(0, 50);
}

function extractMarketDataCandidate(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const candidates = [parsed.data, parsed.marketData, parsed.payload, parsed.result, parsed];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && isUsableMarketData(candidate)) return candidate;
  }
  return null;
}

function deepMergePreferDefined(base, extra) {
  if (!base || typeof base !== 'object') return extra;
  if (!extra || typeof extra !== 'object') return base;

  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      out[key] = value.length ? value : out[key];
      continue;
    }
    if (typeof value === 'object') {
      out[key] = deepMergePreferDefined(out[key], value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function normalizeSymbolsList(marketData) {
  const candidates = [
    marketData?.symbols,
    marketData?.allSymbols,
    marketData?.rows,
    marketData?.list,
    marketData?.items,
    marketData?.data
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c;
  }
  if (Array.isArray(marketData)) return marketData;
  return [];
}

function getSymbolName(sym) {
  return firstString(
    pickValue(sym, FIELD_KEYS.symbol, firstString),
    sym?.symbol, sym?.l18, sym?.l30, sym?.name, sym?.namad, sym?.insCode
  ) || 'UNKNOWN';
}

function computeBreadthAndTopLists(marketData) {
  const symbols = normalizeSymbolsList(marketData);
  if (!symbols.length) {
    return {
      positiveStocks: null,
      negativeStocks: null,
      neutralStocks: null,
      topGainers: Array.isArray(marketData?.topGainers) ? marketData.topGainers : [],
      topLosers: Array.isArray(marketData?.topLosers) ? marketData.topLosers : [],
      topVolumes: Array.isArray(marketData?.topVolumes) ? marketData.topVolumes : [],
      symbolsCoverage: 'missing'
    };
  }

  let positive = 0, negative = 0, neutral = 0;

  const enriched = symbols.map((s) => {
    const pcp = pickValue(s, FIELD_KEYS.pctClose, toNumber);
    const plp = pickValue(s, FIELD_KEYS.pctLast, toNumber);
    const pct = pcp !== null ? pcp : plp;
    const tvol = pickValue(s, FIELD_KEYS.totalVolume, toNumber) ?? 0;
    const tval = pickValue(s, FIELD_KEYS.totalValue, toNumber) ?? 0;

    if (pct !== null) {
      if (pct > 0) positive += 1;
      else if (pct < 0) negative += 1;
      else neutral += 1;
    } else neutral += 1;

    return { symbol: getSymbolName(s), pcp, plp, pctSort: pct ?? -Infinity, tvol, tval };
  });

  const topGainers = [...enriched].filter((x) => Number.isFinite(x.pctSort))
    .sort((a, b) => b.pctSort - a.pctSort).slice(0, 10)
    .map((x) => ({ symbol: x.symbol, pcp: x.pcp, plp: x.plp, tvol: x.tvol, tval: x.tval }));

  const topLosers = [...enriched].filter((x) => Number.isFinite(x.pctSort))
    .sort((a, b) => a.pctSort - b.pctSort).slice(0, 10)
    .map((x) => ({ symbol: x.symbol, pcp: x.pcp, plp: x.plp, tvol: x.tvol, tval: x.tval }));

  const topVolumes = [...enriched]
    .sort((a, b) => (b.tvol - a.tvol) || (b.tval - a.tval)).slice(0, 10)
    .map((x) => ({ symbol: x.symbol, tvol: x.tvol, tval: x.tval, pcp: x.pcp, plp: x.plp }));

  return {
    positiveStocks: positive,
    negativeStocks: negative,
    neutralStocks: neutral,
    topGainers,
    topLosers,
    topVolumes,
    symbolsCoverage: 'full'
  };
}

/* ================================
 * Summary & AI
 * ================================ */
function faNum(value, fallback = 'نامشخص') {
  const n = toNumber(value);
  if (n === null) return fallback;
  return new Intl.NumberFormat('fa-IR').format(n);
}
function trendWord(n) {
  const v = toNumber(n);
  if (v === null || v === 0) return 'خنثی';
  return v > 0 ? 'صعودی' : 'نزولی';
}
function pickTopSymbols(list, count = 3) {
  if (!Array.isArray(list) || !list.length) return 'نامشخص';
  return list.slice(0, count).map((x) => x?.symbol || '---').join('، ');
}
function isPendingAiText(text) {
  const normalized = firstString(text);
  if (!normalized) return false;
  return [AI_PENDING_TEXT, 'در حال تولید تحلیل', 'analysis pending', 'pending', 'loading']
    .some((token) => normalized.toLowerCase().includes(String(token).toLowerCase()));
}
function buildEightPartSummary(data, aiText) {
  const ai = firstString(aiText);
  if (ai && ai.length >= 220 && !isPendingAiText(ai)) return ai;

  const statusFa = data.marketStatus === 'open' ? 'باز' : data.marketStatus === 'close' ? 'بسته' : 'نامشخص';
  const overallChangeAbs = toNumber(data.overallChange) !== null ? Math.abs(toNumber(data.overallChange)) : null;
  const equalChangeAbs = toNumber(data.equalChange) !== null ? Math.abs(toNumber(data.equalChange)) : null;

  return [
    `۱) وضعیت کلی بازار: وضعیت بازار ${statusFa} گزارش شده و برآیند عمومی معاملات ${trendWord(data.overallChange)} است.`,
    `۲) شاخص کل: مقدار شاخص کل ${faNum(data.overallIndex)} واحد است و تغییر آن ${faNum(overallChangeAbs)} واحد ثبت شده است.`,
    `۳) شاخص هم‌وزن: مقدار شاخص هم‌وزن ${faNum(data.equalIndex)} واحد است و تغییر آن ${faNum(equalChangeAbs)} واحد گزارش می‌شود.`,
    `۴) نقدشوندگی و معاملات: تعداد معاملات ${faNum(data.totalTrades)}، حجم معاملات ${faNum(data.totalVolume)} و ارزش معاملات ${faNum(data.totalValue)} بوده است.`,
    `۵) پهنای بازار: نمادهای مثبت ${faNum(data.positiveStocks)}، منفی ${faNum(data.negativeStocks)} و خنثی ${faNum(data.neutralStocks)} هستند.`,
    `۶) برترین‌های رشد: ${pickTopSymbols(data.topGainers)}.`,
    `۷) برترین‌های افت: ${pickTopSymbols(data.topLosers)}.`,
    `۸) جمع‌بندی عملیاتی: با توجه به داده‌های فعلی، رویکرد کوتاه‌مدت باید هم‌راستا با مومنتوم بازار و همراه با مدیریت ریسک مرحله‌ای باشد.`
  ].join('\n');
}

function extractAiText(record) {
  const raw = parseJsonSafe(record?.rawJson);
  return firstString(raw?.aiAnalysis, raw?.analysis, raw?.content, raw?.summary);
}
function isWeakAiText(text) {
  const t = firstString(text) || '';
  if (!t || isPendingAiText(t)) return true;
  const normalized = normalizeDigits(t).replace(/\s+/g, ' ').trim();
  return normalized.length < 220;
}
function hasFinalAiText(record) {
  const text = extractAiText(record);
  return Boolean(text && !isPendingAiText(text));
}
function buildAiPrompt(marketData) {
  return `
شما تحلیلگر حرفه‌ای بورس ایران هستید.
بر اساس داده زیر، تحلیل را دقیقاً در 8 بخش ارائه بده:
1) روند شاخص کل و هم‌وزن
2) پهنای بازار (مثبت/منفی/خنثی)
3) نقدینگی و ارزش/حجم معاملات
4) صنایع یا بازیگران اثرگذار
5) سطح ریسک بازار (کم/متوسط/زیاد)
6) سناریوی محتمل جلسه بعد
7) پیشنهاد عملیاتی کوتاه‌مدت
8) کیفیت داده

خروجی فارسی، کاربردی و کوتاه باشد.

داده:
${jsonStringifySafe(marketData)}
`.trim();
}

async function generateMarketSummaryText(marketData) {
  const apiKey = (env.GAPGPT_API_KEY || env.AI_API_KEY || '').trim();
  if (!apiKey || ['your_api_key', 'changeme', 'test_key', 'gapgpt_xxx'].includes(apiKey.toLowerCase())) return null;

  try {
    const response = await axios.post(
      `${env.GAPGPT_API_URL || 'https://api.gapapi.com/v1'}/chat/completions`,
      {
        model: env.GAPGPT_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'تحلیلگر حرفه‌ای بازار سرمایه ایران' },
          { role: 'user', content: buildAiPrompt(marketData) }
        ],
        temperature: 0.15
      },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 45000 }
    );
    return response.data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    logError('AI enrichment request failed', { message: error?.message || 'Unknown AI error' });
    return null;
  }
}

function scheduleEnrichment(record, marketData) {
  if (!record?.id || !marketData || typeof marketData !== 'object') return;
  if (hasFinalAiText(record) && !isWeakAiText(extractAiText(record))) return;

  (async () => {
    try {
      const text = await generateMarketSummaryText(marketData);
      if (!text) return;

      const MarketSummary = getMarketSummaryModel();
      const current = await MarketSummary.findUnique({ where: { id: record.id } });
      const currentRaw = parseJsonSafe(current?.rawJson || record.rawJson) || {};
      const existingText = firstString(currentRaw.aiAnalysis, currentRaw.analysis, currentRaw.content, currentRaw.summary);
      if (existingText && !isWeakAiText(existingText)) return;

      await MarketSummary.update({
        where: { id: record.id },
        data: { rawJson: jsonStringifySafe({ ...currentRaw, aiAnalysis: text }) }
      });
      logInfo('AI enrichment stored', { recordId: record.id });
    } catch (error) {
      logError('AI enrichment update failed', { recordId: record?.id, message: error.message });
    }
  })().catch((err) => logError('AI enrichment detached task failed', { message: err?.message || String(err) }));
}

/* ================================
 * Payload Builder
 * ================================ */
function applyEqualChangeGuard({ equalIndex, equalChange, marketData, existingRecord }) {
  const idx = toNumber(equalIndex);
  const chg = toNumber(equalChange);

  if (idx !== null && chg !== null && idx === chg && Math.abs(idx) > 10000) {
    const direct = pickValue(marketData, FIELD_KEYS.equalChange, toNumber);
    if (direct !== null && direct !== idx) return direct;

    const raw = parseJsonSafe(existingRecord?.rawJson);
    const rawCandidate = pickValue(raw?.data || raw || {}, FIELD_KEYS.equalChange, toNumber);
    if (rawCandidate !== null && rawCandidate !== idx) return rawCandidate;

    return 0;
  }
  return equalChange;
}

function buildSummaryPayload(marketData, fallbackDate = new Date(), existingRecord = null) {
  if (!isUsableMarketData(marketData)) {
    const error = new Error('Invalid market data');
    error.code = 'INVALID_MARKET_DATA';
    throw error;
  }

  const sourceDate = resolveBestDate(marketData, fallbackDate);
  const targetDay = getTehranDayStart(sourceDate);

  const overallIndex = pickValue(marketData, FIELD_KEYS.index, toNumber);
  const overallChange = pickValue(marketData, FIELD_KEYS.changeIndex, toNumber);

  let equalIndex = pickValue(marketData, FIELD_KEYS.equalIndex, toNumber);
  let equalChange = pickValue(marketData, FIELD_KEYS.equalChange, toNumber);

  const breadthAndTop = computeBreadthAndTopLists(marketData);
  const existingRaw = parseJsonSafe(existingRecord?.rawJson) || {};
  const existingAi = firstString(existingRaw.aiAnalysis, existingRaw.analysis, existingRaw.content, existingRaw.summary);

  if (equalIndex === null || equalChange === null) {
    const oldData = existingRaw?.data || {};
    if (equalIndex === null) equalIndex = pickValue(oldData, FIELD_KEYS.equalIndex, toNumber);
    if (equalChange === null) equalChange = pickValue(oldData, FIELD_KEYS.equalChange, toNumber);
  }
  equalChange = applyEqualChangeGuard({ equalIndex, equalChange, marketData, existingRecord });

  const aiTextToKeep = existingAi && !isPendingAiText(existingAi) ? existingAi : AI_PENDING_TEXT;

  return {
    sourceDate,
    targetDay,
    payload: {
      summaryDate: targetDay,
      overallIndex,
      overallChange,
      equalIndex,
      equalChange,
      marketStatus: normalizeMarketStatus(pickValue(marketData, FIELD_KEYS.marketState, firstString)),
      totalTrades: pickValue(marketData, FIELD_KEYS.totalTrades, toBigIntOrNull),
      totalVolume: pickValue(marketData, FIELD_KEYS.totalVolume, toBigIntOrNull),
      totalValue: pickValue(marketData, FIELD_KEYS.totalValue, toBigIntOrNull),
      positiveStocks: breadthAndTop.positiveStocks,
      negativeStocks: breadthAndTop.negativeStocks,
      neutralStocks: breadthAndTop.neutralStocks,
      topGainers: jsonStringifySafe(breadthAndTop.topGainers),
      topLosers: jsonStringifySafe(breadthAndTop.topLosers),
      topVolumes: jsonStringifySafe(breadthAndTop.topVolumes),
      rawJson: jsonStringifySafe({
        ...(existingRaw || {}),
        data: marketData,
        aiAnalysis: aiTextToKeep,
        meta: {
          ...(existingRaw?.meta || {}),
          symbolsCoverage: breadthAndTop.symbolsCoverage || 'unknown',
          generatedAt: new Date().toISOString()
        }
      })
    }
  };
}

function buildPatchDataIfNeeded(existingRecord, nextPayload) {
  if (!existingRecord) return null;
  const patch = {};

  const numericFields = ['overallIndex', 'overallChange', 'equalIndex', 'equalChange', 'positiveStocks', 'negativeStocks', 'neutralStocks'];
  for (const field of numericFields) {
    const oldVal = toNumber(existingRecord[field]);
    const newVal = toNumber(nextPayload[field]);
    if (newVal !== null && (oldVal === null || oldVal !== newVal)) patch[field] = newVal;
  }

  const bigintFields = ['totalTrades', 'totalVolume', 'totalValue'];
  for (const field of bigintFields) {
    const oldVal = toBigIntOrNull(existingRecord[field]);
    const newVal = toBigIntOrNull(nextPayload[field]);
    if (newVal !== null && (oldVal === null || oldVal !== newVal)) patch[field] = newVal;
  }

  if (nextPayload.marketStatus && existingRecord.marketStatus !== nextPayload.marketStatus) patch.marketStatus = nextPayload.marketStatus;
  if ((existingRecord.topGainers || '[]') !== (nextPayload.topGainers || '[]')) patch.topGainers = nextPayload.topGainers;
  if ((existingRecord.topLosers || '[]') !== (nextPayload.topLosers || '[]')) patch.topLosers = nextPayload.topLosers;
  if ((existingRecord.topVolumes || '[]') !== (nextPayload.topVolumes || '[]')) patch.topVolumes = nextPayload.topVolumes;

  const oldRaw = parseJsonSafe(existingRecord.rawJson) || {};
  const nextRaw = parseJsonSafe(nextPayload.rawJson) || {};
  const oldAi = firstString(oldRaw.aiAnalysis, oldRaw.analysis, oldRaw.content, oldRaw.summary);

  const mergedRaw = {
    ...oldRaw,
    ...nextRaw,
    data: deepMergePreferDefined(oldRaw.data || {}, nextRaw.data || {})
  };
  mergedRaw.aiAnalysis = oldAi && !isPendingAiText(oldAi) ? oldAi : (nextRaw.aiAnalysis || AI_PENDING_TEXT);

  if (jsonStringifySafe(oldRaw) !== jsonStringifySafe(mergedRaw)) patch.rawJson = jsonStringifySafe(mergedRaw);

  return Object.keys(patch).length ? patch : null;
}

/* ================================
 * History Inspection
 * ================================ */
async function inspectLatestMarketHistoryRows({ take = 30 } = {}) {
  const model = getMarketHistoryModel();
  if (!model) return { candidate: null, diagnostics: { reasonCode: 'MODEL_MISSING', rows: [] } };

  const rows = await model.findMany({ orderBy: { createdAt: 'desc' }, take });
  if (!rows.length) return { candidate: null, diagnostics: { reasonCode: 'HISTORY_EMPTY', rows: [] } };

  const rowDiagnostics = [];
  for (const row of rows) {
    const parsed = parseJsonSafe(row.jsonData);
    const marketData = extractMarketDataCandidate(parsed);
    const createdAtISO = row.createdAt ? new Date(row.createdAt).toISOString() : null;
    const synthetic = marketData ? isLikelySyntheticMarketData(marketData) : false;

    rowDiagnostics.push({
      id: row.id,
      createdAt: createdAtISO,
      usable: Boolean(marketData) && !synthetic,
      reason: marketData ? (synthetic ? 'SYNTHETIC_MARKET_DATA_REJECTED' : 'USABLE_MARKET_DATA_FOUND') : 'NO_USABLE_MARKET_DATA'
    });

    if (marketData && !synthetic) {
      return {
        candidate: { row, marketData },
        diagnostics: {
          reasonCode: 'USABLE_MARKET_HISTORY_FOUND',
          checkedRows: rowDiagnostics.length,
          usableRowsFound: 1,
          selectedRowId: row.id,
          selectedCreatedAt: createdAtISO,
          rows: rowDiagnostics
        }
      };
    }
  }

  return {
    candidate: null,
    diagnostics: {
      reasonCode: 'NO_USABLE_MARKET_HISTORY',
      checkedRows: rowDiagnostics.length,
      usableRowsFound: 0,
      rows: rowDiagnostics
    }
  };
}

async function buildMergedMarketDataForDay(referenceDate, { take = 80 } = {}) {
  const model = getMarketHistoryModel();
  if (!model) return { merged: null, rowsUsed: 0, inspected: 0 };

  const targetDateISO = toDateOnlyISO(referenceDate);
  const rows = await model.findMany({ orderBy: { createdAt: 'desc' }, take });

  let merged = null, rowsUsed = 0, inspected = 0;
  for (const row of rows) {
    inspected += 1;
    if (!row?.createdAt) continue;
    if (toDateOnlyISO(row.createdAt) !== targetDateISO) continue;

    const parsed = parseJsonSafe(row.jsonData);
    const candidate = extractMarketDataCandidate(parsed);
    if (!candidate) continue;
    if (isLikelySyntheticMarketData(candidate)) continue;

    merged = merged ? deepMergePreferDefined(merged, candidate) : { ...candidate };
    rowsUsed += 1;
  }

  return { merged: rowsUsed ? merged : null, rowsUsed, inspected };
}

/* ================================
 * Record Normalizer
 * ================================ */
function formatFaNumber(value) {
  const num = toNumber(value);
  if (num === null) return null;
  return new Intl.NumberFormat('fa-IR').format(num);
}

function safeParseArray(value) {
  const p = parseJsonSafe(value);
  return Array.isArray(p) ? p : [];
}

function normalizeSummaryRecord(record, diagnostics = null) {
  if (!record) return null;

  const raw = parseJsonSafe(record.rawJson) || {};
  const rawData = raw?.data || {};
  const aiContent = extractAiText(record);

  let equalIndex = toNumber(record.equalIndex);
  let equalChange = toNumber(record.equalChange);

  if (equalIndex === null) equalIndex = pickValue(rawData, FIELD_KEYS.equalIndex, toNumber);
  if (equalChange === null) equalChange = pickValue(rawData, FIELD_KEYS.equalChange, toNumber);

  equalChange = applyEqualChangeGuard({ equalIndex, equalChange, marketData: rawData, existingRecord: record });

  const staleInfo = calcStaleInfo(record.summaryDate);

  const normalized = {
    id: record.id,
    date: toDateOnlyISO(record.summaryDate),
    summaryDate: toDateOnlyISO(record.summaryDate),
    overallIndex: toNumber(record.overallIndex),
    overallChange: toNumber(record.overallChange),
    equalIndex,
    equalChange,
    displayOverallIndex: formatFaNumber(record.overallIndex),
    displayOverallChange: formatFaNumber(record.overallChange),
    displayEqualIndex: formatFaNumber(equalIndex),
    displayEqualChange: formatFaNumber(equalChange),
    marketStatus: record.marketStatus,
    totalTrades: record.totalTrades?.toString() || null,
    totalVolume: record.totalVolume?.toString() || null,
    totalValue: record.totalValue?.toString() || null,
    positiveStocks: record.positiveStocks,
    negativeStocks: record.negativeStocks,
    neutralStocks: record.neutralStocks,
    topGainers: safeParseArray(record.topGainers),
    topLosers: safeParseArray(record.topLosers),
    topVolumes: safeParseArray(record.topVolumes),
    symbolsCoverage: raw?.meta?.symbolsCoverage || (record.positiveStocks === null ? 'missing' : 'full'),
    stale: staleInfo.stale,
    staleHours: staleInfo.staleHours,
    staleReason: staleInfo.staleReason
  };

  const summaryText = buildEightPartSummary(normalized, aiContent || AI_UNAVAILABLE_TEXT);
  const fallback =
    toNumber(normalized.overallIndex) === null &&
    toNumber(normalized.equalIndex) === null &&
    toBigIntOrNull(normalized.totalValue) === null;

  return {
    ...normalized,
    content: summaryText,
    summary: summaryText,
    fallback,
    aiPending: isPendingAiText(aiContent),
    diagnostics: diagnostics || null
  };
}

/* ================================
 * Retention (keep only last N)
 * ================================ */
async function retainOnlyLastNSummaries(keep = SUMMARY_RETENTION_COUNT) {
  const MarketSummary = getMarketSummaryModel();
  const n = Number.isInteger(keep) && keep > 0 ? keep : 5;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const model = tx.MarketSummary || tx.marketSummary;
      if (!model) throw new Error('MarketSummary model unavailable inside transaction');

      const rows = await model.findMany({
        select: { id: true, summaryDate: true, createdAt: true },
        orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }]
      });

      if (rows.length <= n) {
        return { deletedCount: 0, kept: rows.length, total: rows.length };
      }

      const toDeleteIds = rows.slice(n).map((r) => r.id);
      const del = await model.deleteMany({ where: { id: { in: toDeleteIds } } });

      return { deletedCount: del.count || 0, kept: n, total: rows.length };
    });

    logInfo('Retention applied', result);
    return result;
  } catch (error) {
    logError('Retention failed', { message: error.message });
    return { deletedCount: 0, kept: null, total: null, error: true, message: error.message };
  }
}

/* ================================
 * Catch-up (Backfill) Logic
 * ================================
 * سناریو: روزی که بازار باز بوده (مثلاً دیروز)، به هر دلیلی تحلیل ساعت
 * ۱۲:۳۵ انجام نشده و تب «خلاصه بازار» خالی مانده. امروز حتی اگر بازار
 * بسته باشد (پنجشنبه/جمعه یا هر روز دیگر)، این تابع آخرین روز معاملاتیِ
 * «بدون تحلیلِ نهایی» را در MarketHistory پیدا می‌کند و با همان داده و
 * همان تاریخ (نه امروز)، خلاصه را می‌سازد تا در تب با تاریخ درست (مثلاً
 * دیروز) نمایش داده شود.
 */
async function findLatestUnsummarizedMarketDay({ maxDaysBack = 10, rowsPerDayLookup = 1500 } = {}) {
  const model = getMarketHistoryModel();
  if (!model) return null;

  const rows = await model.findMany({ orderBy: { createdAt: 'desc' }, take: rowsPerDayLookup });
  if (!rows.length) return null;

  const seenDays = [];
  const seenSet = new Set();
  for (const row of rows) {
    if (!row?.createdAt) continue;
    const dayISO = toDateOnlyISO(row.createdAt);
    if (!dayISO || seenSet.has(dayISO)) continue;
    seenSet.add(dayISO);
    seenDays.push(dayISO);
    if (seenDays.length >= maxDaysBack) break;
  }

  for (const dayISO of seenDays) {
    const dayStart = parseDateInputToTehranDayStart(dayISO);
    if (!dayStart) continue;
    if (!exports.isTradingDay(dayStart)) continue; // فقط روزهای شنبه تا چهارشنبه

    // امروز را «گم‌شده» حساب نکن اگر هنوز به ساعت تولید (۱۲:۳۵) نرسیده‌ایم؛
    // امروز فقط هنوز به زمانش نرسیده، مفقود نیست.
    if (isTehranToday(dayStart) && isBeforeTodaysGenerationWindow()) continue;

    const existing = await findBySummaryDateSafe(dayStart);
    const alreadyComplete = existing && hasFinalAiText(existing) && !isWeakAiText(extractAiText(existing));
    if (alreadyComplete) continue; // این روز از قبل تحلیل کامل دارد

    const dayMerged = await buildMergedMarketDataForDay(dayStart, { take: rowsPerDayLookup });
    if (!dayMerged.merged || isLikelySyntheticMarketData(dayMerged.merged)) continue;

    return {
      dayStart,
      dayISO,
      marketData: dayMerged.merged,
      existing,
      rowsUsed: dayMerged.rowsUsed
    };
  }

  return null;
}

/**
 * اگر آخرین روز معاملاتیِ دارای داده هنوز تحلیل نهایی ندارد، همین الان
 * (با تاریخ همان روز، نه امروز) بسازد. هم از کرون ۱۲:۳۵ و هم از
 * findOrGenerateLatest (باز شدن تب توسط کاربر) به‌عنوان شبکه‌ی ایمنی
 * صدا زده می‌شود.
 */
async function runCatchUpForMissingSummary() {
  try {
    const target = await findLatestUnsummarizedMarketDay({ maxDaysBack: 10 });
    if (!target) {
      return buildResult({
        data: null,
        sourceType: 'catch_up',
        reason: 'NO_MISSING_SUMMARY_FOUND',
        generated: false
      });
    }

    const result = await exports.generateMarketSummary({
      marketData: target.marketData,
      fallbackDate: target.dayStart
    });

    logInfo('Catch-up summary generated for missing trading day', {
      day: target.dayISO,
      rowsUsed: target.rowsUsed,
      hadPlaceholderRecord: Boolean(target.existing)
    });

    return {
      ...result,
      sourceType: 'catch_up',
      reason: `CATCH_UP_GENERATED_FOR_${target.dayISO}`
    };
  } catch (error) {
    logError('runCatchUpForMissingSummary failed', { message: error.message });
    return buildResult({
      data: null,
      sourceType: 'catch_up',
      error: true,
      reason: 'CATCH_UP_FAILED',
      message: error.message
    });
  }
}

/* ================================
 * DB helpers
 * ================================ */
async function findBySummaryDateSafe(targetDay) {
  const MarketSummary = getMarketSummaryModel();
  try {
    return await MarketSummary.findUnique({ where: { summaryDate: targetDay } });
  } catch {
    return MarketSummary.findFirst({
      where: { summaryDate: targetDay },
      orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }]
    });
  }
}

/* ================================
 * Primary Service Exports
 * ================================ */
exports.findOrGenerateLatest = async () => {
  const MarketSummary = getMarketSummaryModel();

  try {
    const [inspection, latestSummary] = await Promise.all([
      inspectLatestMarketHistoryRows({ take: 30 }),
      MarketSummary.findFirst({
        orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }],
      }),
    ]);

    if (inspection.candidate) {
      const { row } = inspection.candidate;
      const dayMerged = await buildMergedMarketDataForDay(row.createdAt, { take: 80 });
      const marketData = dayMerged.merged || inspection.candidate.marketData;

      if (!isLikelySyntheticMarketData(marketData)) {
        const existingTarget = buildSummaryPayload(marketData, row.createdAt);
        const existing = await findBySummaryDateSafe(existingTarget.targetDay);

        if (existing) {
          const rebuilt = buildSummaryPayload(marketData, row.createdAt, existing);
          const patch = buildPatchDataIfNeeded(existing, rebuilt.payload);

          let finalRecord = existing;
          if (patch) {
            finalRecord = await MarketSummary.update({ where: { id: existing.id }, data: patch });
            logInfo('Existing summary patched', { id: existing.id, rowsUsedForMerge: dayMerged.rowsUsed });
          }

          // مهم: اعمال retention حتی در حالت patch
          await retainOnlyLastNSummaries(SUMMARY_RETENTION_COUNT);

          if (!hasFinalAiText(finalRecord) || isWeakAiText(extractAiText(finalRecord))) {
            scheduleEnrichment(finalRecord, marketData);
          }

          const diag = {
            ...(inspection.diagnostics || {}),
            mergeRowsUsed: dayMerged.rowsUsed,
            mergeRowsInspected: dayMerged.inspected
          };

          return buildResult({
            data: normalizeSummaryRecord(finalRecord, diag),
            sourceType: 'db_current',
            cached: !patch,
            generated: Boolean(patch),
            reason: patch ? 'CURRENT_DAY_SUMMARY_PATCHED' : 'CURRENT_DAY_SUMMARY_EXISTS',
            diagnostics: diag
          });
        }

        // ⚠️ اگر روزِ کاندید «امروز» است و هنوز به ساعت پایان بازار
        // (۱۲:۳۵) نرسیده‌ایم، از ساختن یک رکورد ناقص/زودهنگام برای
        // امروز صرف‌نظر کن. اجازه بده کد پایین‌تر آخرین تحلیل کاملِ
        // موجود (مثلاً دیروز) را برگرداند تا با retention حذف نشود.
        if (isTehranToday(existingTarget.targetDay) && isBeforeTodaysGenerationWindow()) {
          logInfo('Skipping premature same-day generation before 12:35 window', {
            targetDay: toDateOnlyISO(existingTarget.targetDay)
          });
        } else {
          const generated = await exports.generateMarketSummary({ marketData, fallbackDate: row.createdAt });
          const diag = {
            ...(inspection.diagnostics || {}),
            mergeRowsUsed: dayMerged.rowsUsed,
            mergeRowsInspected: dayMerged.inspected
          };

          return buildResult({
            data: { ...(generated.data || {}), diagnostics: diag },
            sourceType: 'generated_from_history',
            generated: true,
            reason: 'GENERATED_FROM_LATEST_MARKET_HISTORY',
            diagnostics: diag
          });
        }
      } else {
        logWarn('Synthetic merged market data rejected', {
          selectedRowId: row?.id,
          selectedCreatedAt: row?.createdAt
        });
      }
    }

    // به این نقطه می‌رسیم اگر: کاندیدی نبود، داده synthetic بود، یا
    // (تازه) تولید امروز قبل از ساعت ۱۲:۳۵ عمداً رد شد.
    // ⚠️ شبکه‌ی ایمنی: قبل از برگرداندن رکورد خیلی قدیمی یا NO_DATA،
    // نگاه کن ببین آیا یک روز معاملاتیِ اخیر هست که داده دارد ولی هنوز
    // تحلیل نهایی نشده (مثلاً چون کرون ۱۲:۳۵ آن روز اجرا نشده بود).
    const catchUp = await runCatchUpForMissingSummary();
    if (catchUp?.data) {
      return catchUp;
    }

    if (latestSummary) {
      return buildResult({
        data: normalizeSummaryRecord(latestSummary, inspection?.diagnostics || null),
        sourceType: 'db_last_available',
        cached: true,
        reason: inspection?.diagnostics?.reasonCode || 'LAST_AVAILABLE',
        message: 'آخرین خلاصه موجود بازگردانده شد',
        diagnostics: inspection?.diagnostics || null
      });
    }

    return buildResult({
      data: null,
      sourceType: 'none',
      reason: 'NO_DATA_AVAILABLE',
      diagnostics: inspection?.diagnostics || null
    });
  } catch (error) {
    logError('findOrGenerateLatest failed', { message: error.message });
    const lastDitch = await MarketSummary.findFirst({ orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }] }).catch(() => null);
    return buildResult({
      data: normalizeSummaryRecord(lastDitch),
      sourceType: lastDitch ? 'db_last_available' : 'none',
      error: true,
      reason: 'CRITICAL_ERROR',
      message: error.message
    });
  }
};

exports.generateMarketSummary = async ({ marketData, fallbackDate = new Date() }) => {
  const MarketSummary = getMarketSummaryModel();

  if (!isUsableMarketData(marketData)) {
    return buildResult({
      data: null,
      sourceType: 'invalid_input',
      error: true,
      reason: 'INVALID_MARKET_DATA',
      message: 'داده بازار معتبر نیست'
    });
  }

  if (isLikelySyntheticMarketData(marketData)) {
    return buildResult({
      data: null,
      sourceType: 'invalid_input',
      error: true,
      reason: 'SYNTHETIC_MARKET_DATA_REJECTED',
      message: 'داده بازار مشکوک/تستی تشخیص داده شد و ذخیره نشد'
    });
  }

  const sourceDate = resolveBestDate(marketData, fallbackDate);
  const targetDay = getTehranDayStart(sourceDate);
  const existing = await findBySummaryDateSafe(targetDay);
  const { payload } = buildSummaryPayload(marketData, fallbackDate, existing);

  const record = existing
    ? await MarketSummary.update({ where: { id: existing.id }, data: payload })
    : await MarketSummary.create({ data: payload });

  await retainOnlyLastNSummaries(SUMMARY_RETENTION_COUNT);

  scheduleEnrichment(record, marketData);

  return buildResult({
    data: normalizeSummaryRecord(record, { targetDate: toDateOnlyISO(targetDay), sourceDate: sourceDate.toISOString() }),
    sourceType: 'upsert',
    generated: true,
    diagnostics: { targetDate: toDateOnlyISO(targetDay), sourceDate: sourceDate.toISOString() }
  });
};

exports.findHistory = async ({ page = 1, limit = 10 }) => {
  const MarketSummary = getMarketSummaryModel();
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));

  const [items, total] = await Promise.all([
    MarketSummary.findMany({
      orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }],
      skip: (p - 1) * l,
      take: l
    }),
    MarketSummary.count()
  ]);

  return {
    data: items.map((x) => normalizeSummaryRecord(x)).filter(Boolean),
    pagination: { total, page: p, limit: l, totalPages: Math.ceil(total / l) }
  };
};

/* ================================
 * New APIs support
 * ================================ */
exports.getAvailableDates = async () => {
  const MarketSummary = getMarketSummaryModel();
  const rows = await MarketSummary.findMany({
    select: { id: true, summaryDate: true },
    orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }],
    take: SUMMARY_RETENTION_COUNT
  });

  return rows.map((r) => ({
    id: r.id,
    summaryDate: toDateOnlyISO(r.summaryDate)
  }));
};

exports.findByDate = async (dateInput) => {
  const MarketSummary = getMarketSummaryModel();
  const targetDay = parseDateInputToTehranDayStart(dateInput);
  if (!targetDay) return null;

  const record = await findBySummaryDateSafe(targetDay);
  if (record) return normalizeSummaryRecord(record, { byDate: toDateOnlyISO(targetDay) });

  // fallback: اگر exact match نبود، با iso string هم تلاش کن
  const iso = toDateOnlyISO(targetDay);
  const maybe = await MarketSummary.findFirst({
    where: { summaryDate: { gte: new Date(`${iso}T00:00:00.000Z`), lt: new Date(`${iso}T23:59:59.999Z`) } },
    orderBy: [{ summaryDate: 'desc' }, { id: 'desc' }]
  }).catch(() => null);

  return maybe ? normalizeSummaryRecord(maybe, { byDate: iso }) : null;
};

/* ================================
 * Extra Exports
 * ================================ */
exports.findLatestUsableMarketHistoryRow = async () => (await inspectLatestMarketHistoryRows({ take: 30 })).candidate;
exports.inspectLatestMarketHistoryRows = inspectLatestMarketHistoryRows;
exports.normalizeSummaryRecord = normalizeSummaryRecord;
exports.isUsableMarketData = isUsableMarketData;
exports.isLikelySyntheticMarketData = isLikelySyntheticMarketData;
exports.getNowInTehran = () => new Date();
exports.retainOnlyLastNSummaries = retainOnlyLastNSummaries;
exports.runCatchUpForMissingSummary = runCatchUpForMissingSummary;
exports.findLatestUnsummarizedMarketDay = findLatestUnsummarizedMarketDay;

exports.isTradingDay = (date) => {
  const wd = String(getTimeZoneParts(date).weekday || '').toLowerCase();
  return TRADING_DAY_NAMES.has(wd) ||
    wd.startsWith('sat') || wd.startsWith('sun') || wd.startsWith('mon') || wd.startsWith('tue') || wd.startsWith('wed');
};

async function inspectLatestMarketRows(opts) {
  return inspectLatestMarketHistoryRows(opts);
}
exports.inspectLatestMarketRows = inspectLatestMarketRows;
