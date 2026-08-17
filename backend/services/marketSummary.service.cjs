'use strict';

const axios = require('axios');
const prisma = require('../config/prisma.cjs');
const env = require('../config/env.cjs');
const brsService = require('./brs.service.cjs');

/* ================================
 * Config
 * ================================ */
const TEHRAN_TIMEZONE = 'Asia/Tehran';
const TRADING_DAYS = new Set([6, 0, 1, 2, 3]); // Sat..Wed
const MARKET_CLOSE_HOUR = 12;
const MARKET_CLOSE_MINUTE = 30;

async function generateMarketSummaryText(marketData) {
  const source = marketData && typeof marketData === 'object' ? normalizeMarketDataInput(marketData) : null;

  if (!source || !isUsableMarketData(source)) {
    throw new Error('داده بازار برای تحلیل توسط هوش مصنوعی معتبر نیست');
  }

  const apiKey = (env.GAPGPT_API_KEY || env.AI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'gapgpt_xxx') {
    throw new Error('GAPGPT_API_KEY is not configured');
  }

  const baseUrl = (env.GAPGPT_API_URL || env.GAPGPT_BASE_URL || 'https://api.gapapi.com/v1').trim().replace(/\/+$/, '');
  const model = env.GAPGPT_MODEL || 'gpt-4o-mini';

  const prompt = `
شما تحلیلگر بازار بورس ایران هستید. روی داده‌های بازار زیر تحلیل کن و یک خلاصهٔ کوتاه اما دقیق و مفید به زبان فارسی بده.
فقط متن خلاصه را برگردان، بدون کد بلوک، بدون JSON و بدون توضیح اضافی.

داده بازار:
${JSON.stringify(source, null, 2)}

الزام‌ها:
- وضعیت کلی بازار را مشخص کن.
- شاخص کل و تغییر آن را بررسی کن.
- اگر وضعیت بازار باز یا بسته است، روی آن تمرکز کن.
- مهم‌ترین نکته‌ها را در 3 تا 5 جمله کوتاه و کاربردی بیان کن.
- روی ریسک، روند کلی و جهت بازار تمرکز کن.
`;

  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: 'شما یک تحلیلگر حرفه‌ای بازار بورس ایران هستید. فقط به زبان فارسی پاسخ بده و نتیجه را کوتاه، دقیق و قابل‌فهم بنویس.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 45000
    }
  );

  const content = response?.data?.choices?.[0]?.message?.content || response?.data?.choices?.[0]?.text;
  const summaryText = typeof content === 'string' ? content.trim() : '';

  if (!summaryText) {
    throw new Error('AI response for market summary was empty');
  }

  return summaryText;
}

async function enrichSummaryWithAI(summaryRecord, marketData) {
  if (!summaryRecord || typeof summaryRecord !== 'object') return summaryRecord;

  let aiSummaryText = null;
  try {
    // ✅ Always try to fetch fresh live data from BRS API first
    let liveMarketData = null;
    try {
      const freshData = await brsService.getMarketIndex?.();
      liveMarketData = freshData?.data || null;
    } catch (brsError) {
      console.warn('[MarketSummaryService] BRS live fetch failed:', brsError.message);
      // Fall back to provided marketData if live fetch fails
      liveMarketData = marketData || null;
    }

    if (liveMarketData) {
      aiSummaryText = await generateMarketSummaryText(liveMarketData);
    }
  } catch (error) {
    console.warn('[MarketSummaryService] AI market summary generation failed:', error.message || error);
  }

  if (aiSummaryText) {
    summaryRecord.content = aiSummaryText;
    summaryRecord.summary = aiSummaryText;
    summaryRecord.fallback = Boolean(summaryRecord.fallback || false);
  }

  return summaryRecord;
}

/* ================================
 * Public APIs
 * ================================ */

exports.findOrGenerateLatest = async () => {
  const latestSummary = await findLatestSummary();
  
  // ✅ Try to fetch fresh live market data from BRS API
  let liveMarketData = null;
  try {
    const freshMarketData = await brsService.getMarketIndex?.();
    liveMarketData = freshMarketData?.data || null;
  } catch (brsError) {
    console.warn('[MarketSummaryService] BRS live fetch failed:', brsError.message);
  }

  // Fallback to database history if live API fails
  const latestHistory = liveMarketData ? null : await findLatestUsableMarketHistoryRow(90);
  const marketDataToUse = liveMarketData || latestHistory?.marketData || null;

  if (!marketDataToUse) {
    if (!latestSummary) {
      return {
        data: null,
        fallback: false,
        generated: false,
        cached: false,
        sourceType: 'empty',
        message: 'هنوز خلاصه‌ای تولید نشده و snapshot معتبری از بازار نیز موجود نیست'
      };
    }

    const normalizedLatestSummary = normalizeSummaryRecord(latestSummary);
    const enriched = await enrichSummaryWithAI(normalizedLatestSummary, null);

    return {
      data: enriched,
      fallback: false,
      generated: false,
      cached: true,
      sourceType: 'marketSummary',
      message: null
    };
  }

  const sourceDate = resolveBestDate(marketDataToUse, latestHistory?.row?.createdAt || new Date());
  const targetSummaryDate = getTehranDayStart(sourceDate);

  if (latestSummary) {
    const latestSummaryDay = getTehranDayStart(latestSummary.date);
    if (latestSummaryDay.getTime() >= targetSummaryDate.getTime()) {
      const normalizedLatestSummary = normalizeSummaryRecord(latestSummary);
      const enriched = await enrichSummaryWithAI(normalizedLatestSummary, marketDataToUse);

      return {
        data: enriched,
        fallback: false,
        generated: false,
        cached: true,
        sourceType: 'marketSummary',
        message: null
      };
    }
  }

  const sameDaySummary = await findSummaryForDay(targetSummaryDate);
  if (sameDaySummary) {
    const normalizedSameDaySummary = normalizeSummaryRecord(sameDaySummary);
    const enriched = await enrichSummaryWithAI(normalizedSameDaySummary, marketDataToUse);

    return {
      data: enriched,
      fallback: false,
      generated: false,
      cached: true,
      sourceType: 'marketSummary',
      message: null
    };
  }

  try {
    const generated = await exports.generateMarketSummary({
      marketData: marketDataToUse,
      forceRegenerate: false,
      fallbackDate: latestHistory?.row?.createdAt || new Date()
    });

    return {
      data: generated.data,
      fallback: false,
      generated: true,
      cached: false,
      sourceType: liveMarketData ? 'generatedFromLiveAPI' : 'generatedFromMarketHistory',
      message: liveMarketData ? 'خلاصه بازار از داده‌های زنده BRS API تولید شد' : 'خلاصه بازار از آخرین دیتای معتبر بازار به‌صورت خودکار تولید شد'
    };
  } catch (error) {
    console.error('[MarketSummaryService] findOrGenerateLatest generation error:', error);

    const snapshotFallback = buildMarketSnapshotFallback(
      marketDataToUse,
      latestHistory?.row?.createdAt || new Date()
    );

    if (snapshotFallback) {
      return {
        data: snapshotFallback,
        fallback: true,
        generated: false,
        cached: false,
        sourceType: 'marketHistorySnapshot',
        message: 'خلاصه ذخیره‌شده موجود نبود؛ آخرین snapshot معتبر بازار بازگردانده شد'
      };
    }

    if (latestSummary) {
      return {
        data: normalizeSummaryRecord(latestSummary),
        fallback: false,
        generated: false,
        cached: true,
        sourceType: 'marketSummary',
        message: null
      };
    }

    throw error;
  }
};

exports.findHistory = async ({ page = 1, limit = 10 } = {}) => {
  const take = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (currentPage - 1) * take;

  const [summaries, total] = await Promise.all([
    prisma.marketSummary.findMany({
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take,
      skip
    }),
    prisma.marketSummary.count()
  ]);

  return {
    data: summaries.map(normalizeSummaryRecord),
    pagination: {
      total,
      page: currentPage,
      limit: take,
      totalPages: Math.max(1, Math.ceil(total / take))
    }
  };
};

exports.generateMarketSummary = async ({
  marketData = null,
  forceRegenerate = false,
  fallbackDate = null
} = {}) => {
  let source = null;

  // ✅ Try to fetch fresh live market data from BRS API first
  try {
    const freshMarketData = await brsService.getMarketIndex?.();
    if (freshMarketData?.data) {
      source = normalizeMarketDataInput(freshMarketData.data);
    }
  } catch (brsError) {
    console.warn('[MarketSummaryService] BRS live fetch failed:', brsError.message);
  }

  // Fallback to provided marketData if live API fails
  if (!source) {
    source = marketData
      ? normalizeMarketDataInput(marketData)
      : await loadLatestMarketHistoryJson();
  }

  if (!isUsableMarketData(source)) {
    throw new Error('داده بازار برای تولید خلاصه معتبر نیست');
  }

  const resolvedDate = resolveBestDate(source, fallbackDate || new Date());
  const summaryDate = getTehranDayStart(resolvedDate);
  const existingSameDay = await findSummaryForDay(summaryDate);

  if (existingSameDay && !forceRegenerate) {
    return {
      data: normalizeSummaryRecord(existingSameDay),
      cached: true,
      generated: false,
      sourceType: 'marketSummary'
    };
  }

  const payload = mapMarketDataToSummary(source, summaryDate);
  const record = await saveSummaryRecord(existingSameDay, payload);
  const normalizedRecord = normalizeSummaryRecord(record);
  const enrichedRecord = await enrichSummaryWithAI(normalizedRecord, source);

  return {
    data: enrichedRecord,
    cached: false,
    generated: true,
    sourceType: 'marketSummary'
  };
};

exports.getLatestMarketSnapshotFallback = async () => {
  const latestHistory = await findLatestUsableMarketHistoryRow(90);
  if (!latestHistory) return null;

  return buildMarketSnapshotFallback(latestHistory.marketData, latestHistory.row.createdAt);
};

exports.getNowInTehran = getNowInTehran;
exports.isTradingDay = isTradingDay;
exports.isAfterMarketClose = isAfterMarketClose;

/* ================================
 * Data Access
 * ================================ */

async function findLatestSummary() {
  return prisma.marketSummary.findFirst({
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
  });
}

async function findSummaryForDay(dayDate) {
  return prisma.marketSummary.findFirst({
    where: {
      date: {
        gte: startOfDay(dayDate),
        lt: endOfDay(dayDate)
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

async function saveSummaryRecord(existingRecord, payload) {
  if (existingRecord) {
    return prisma.marketSummary.update({
      where: { id: existingRecord.id },
      data: payload
    });
  }

  try {
    return await prisma.marketSummary.create({ data: payload });
  } catch (error) {
    if (error?.code === 'P2002') {
      const collided = await findSummaryForDay(payload.date);
      if (collided) {
        return prisma.marketSummary.update({
          where: { id: collided.id },
          data: payload
        });
      }
    }
    throw error;
  }
}

async function loadLatestMarketHistoryJson() {
  const latest = await findLatestUsableMarketHistoryRow(90);

  if (!latest) {
    throw new Error('هیچ داده معتبری در MarketHistory برای تولید خلاصه بازار موجود نیست');
  }

  return latest.marketData;
}

async function findLatestUsableMarketHistoryRow(take = 30) {
  const recentHistory = await prisma.marketHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take
  });

  for (const row of recentHistory) {
    const parsed = parseJsonSafe(row?.jsonData);
    if (!parsed || typeof parsed !== 'object') continue;

    // ساختارهای مختلف jsonData را هندل می‌کنیم:
    // 1) مستقیم index payload
    // 2) { type, data, ... }
    const sourceObj = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
    const normalized = normalizeMarketDataInput({
      ...sourceObj,
      rawContainer: parsed,
      snapshotCreatedAt: row.createdAt
    });

    if (!isUsableMarketData(normalized)) continue;

    return {
      row,
      marketData: normalized
    };
  }

  return null;
}

/* ================================
 * Mappers / Normalizers
 * ================================ */

function normalizeSummaryRecord(summary) {
  if (!summary || typeof summary !== 'object') return null;

  const rawJsonObj = parsedJsonMaybe(summary.rawJson);
  const rawData = rawJsonObj?.data && typeof rawJsonObj.data === 'object' ? rawJsonObj.data : rawJsonObj;

  const topGainers = ensureArrayOrNull(parsedJsonMaybe(summary.topGainers));
  const topLosers = ensureArrayOrNull(parsedJsonMaybe(summary.topLosers));
  const topVolumes = ensureArrayOrNull(parsedJsonMaybe(summary.topVolumes));

  return {
    id: summary.id ?? null,
    date: summary.date ?? null,

    // fallback از rawJson برای رکوردهای قدیمی
    overallIndex: firstNumber(summary.overallIndex, rawData?.index, rawData?.overallIndex),
    overallChange: firstNumber(
      summary.overallChange,
      rawData?.index_change,
      rawData?.indexChange,
      rawData?.overallChange
    ),
    equalIndex: firstNumber(
      summary.equalIndex,
      rawData?.index_equalWeight,
      rawData?.indexEqualWeight,
      rawData?.equalIndex
    ),
    equalChange: firstNumber(
      summary.equalChange,
      rawData?.index_equalWeight_change,
      rawData?.indexEqualWeightChange,
      rawData?.equalChange
    ),

    marketStatus: normalizeMarketStatus(
      firstString(summary.marketStatus, rawData?.state, rawData?.status, rawData?.marketStatus)
    ),

    totalTrades: stringifyBigInt(firstBigInt(summary.totalTrades, rawData?.tno, rawData?.totalTrades)),
    totalVolume: stringifyBigInt(firstBigInt(summary.totalVolume, rawData?.tvol, rawData?.totalVolume)),
    totalValue: stringifyBigInt(firstBigInt(summary.totalValue, rawData?.tval, rawData?.totalValue)),

    positiveStocks: firstInt(summary.positiveStocks, rawData?.positiveStocks),
    negativeStocks: firstInt(summary.negativeStocks, rawData?.negativeStocks),
    neutralStocks: firstInt(summary.neutralStocks, rawData?.neutralStocks),

    topGainers,
    topLosers,
    topVolumes,

    rawJson: rawJsonObj,
    createdAt: summary.createdAt ?? null,
    updatedAt: summary.updatedAt ?? summary.createdAt ?? null,
    fallback: false
  };
}

function buildMarketSnapshotFallback(raw, createdAt) {
  if (!isUsableMarketData(raw)) return null;

  return {
    id: null,
    date: getTehranDayStart(resolveBestDate(raw, createdAt)),
    overallIndex: firstNumber(raw.overallIndex, raw.index, raw.brsIndex, raw.marketIndex),
    overallChange: firstNumber(
      raw.overallChange,
      raw.overallIndexChange,
      raw.indexChange,
      raw.index_change
    ),
    equalIndex: firstNumber(
      raw.equalIndex,
      raw.equalWeightIndex,
      raw.indexEqualWeight,
      raw.index_equalWeight
    ),
    equalChange: firstNumber(
      raw.equalChange,
      raw.equalWeightChange,
      raw.equalWeightIndexChange,
      raw.indexEqualWeightChange,
      raw.index_equalWeight_change
    ),
    marketStatus: normalizeMarketStatus(
      firstString(
        raw.marketStatus,
        raw.status,
        raw.state,
        raw.marketState,
        raw.isMarketOpen === true ? 'open' : 'close'
      )
    ),
    totalTrades: stringifyBigInt(firstBigInt(raw.totalTrades, raw.tradeCount, raw.trades, raw.tno)),
    totalVolume: stringifyBigInt(firstBigInt(raw.totalVolume, raw.tradeVolume, raw.volume, raw.tvol)),
    totalValue: stringifyBigInt(firstBigInt(raw.totalValue, raw.tradeValue, raw.value, raw.tval)),
    positiveStocks: firstInt(raw.positiveStocks),
    negativeStocks: firstInt(raw.negativeStocks),
    neutralStocks: firstInt(raw.neutralStocks),
    topGainers: ensureArrayOrNull(parsedJsonMaybe(raw.topGainers)),
    topLosers: ensureArrayOrNull(parsedJsonMaybe(raw.topLosers)),
    topVolumes: ensureArrayOrNull(parsedJsonMaybe(raw.topVolumes)),
    rawJson: raw?.rawContainer && typeof raw.rawContainer === 'object' ? raw.rawContainer : raw,
    createdAt,
    updatedAt: createdAt,
    fallback: true,
    fallbackType: 'marketHistory'
  };
}

function mapMarketDataToSummary(raw, summaryDate) {
  const status = normalizeMarketStatus(
    firstString(
      raw.marketStatus,
      raw.status,
      raw.state,
      raw.marketState,
      raw.isMarketOpen === true ? 'open' : 'close'
    )
  );

  return {
    date: summaryDate,
    overallIndex: firstNumber(raw.overallIndex, raw.index, raw.brsIndex, raw.marketIndex),
    overallChange: firstNumber(
      raw.overallChange,
      raw.overallIndexChange,
      raw.indexChange,
      raw.index_change
    ),
    equalIndex: firstNumber(
      raw.equalIndex,
      raw.equalWeightIndex,
      raw.indexEqualWeight,
      raw.index_equalWeight
    ),
    equalChange: firstNumber(
      raw.equalChange,
      raw.equalWeightChange,
      raw.equalWeightIndexChange,
      raw.indexEqualWeightChange,
      raw.index_equalWeight_change
    ),
    marketStatus: trimToNull(status, 50),

    // ✅ نگاشت صحیح BRS
    totalTrades: firstBigInt(raw.totalTrades, raw.tradeCount, raw.trades, raw.tno),
    totalVolume: firstBigInt(raw.totalVolume, raw.tradeVolume, raw.volume, raw.tvol),
    totalValue: firstBigInt(raw.totalValue, raw.tradeValue, raw.value, raw.tval),

    positiveStocks: firstInt(raw.positiveStocks),
    negativeStocks: firstInt(raw.negativeStocks),
    neutralStocks: firstInt(raw.neutralStocks),
    topGainers: stringifyOrNull(ensureArrayOrNull(parsedJsonMaybe(raw.topGainers))),
    topLosers: stringifyOrNull(ensureArrayOrNull(parsedJsonMaybe(raw.topLosers))),
    topVolumes: stringifyOrNull(ensureArrayOrNull(parsedJsonMaybe(raw.topVolumes))),
    rawJson: JSON.stringify(raw?.rawContainer && typeof raw.rawContainer === 'object' ? raw.rawContainer : raw)
  };
}

function normalizeMarketDataInput(marketData) {
  const normalized = marketData && typeof marketData === 'object' ? { ...marketData } : {};
  normalized.isMarketOpen = resolveIsMarketOpen(normalized);
  return normalized;
}

function normalizeMarketStatus(value) {
  const s = firstString(value);
  if (!s) return null;

  const x = s.trim().toLowerCase();
  if (['open', 'opened', 'باز'].includes(x)) return 'open';
  if (['close', 'closed', 'بسته'].includes(x)) return 'close';

  if (x.includes('pre') || x.includes('پیش')) return 'preopen';
  return s.trim();
}

function resolveIsMarketOpen(marketData) {
  if (typeof marketData?.isMarketOpen === 'boolean') return marketData.isMarketOpen;

  const stateCandidate =
    marketData?.state ||
    marketData?.marketState ||
    marketData?.status ||
    marketData?.marketStatus ||
    '';

  const normalizedState = String(stateCandidate).trim().toLowerCase();
  if (!normalizedState) return false;

  const closedStates = new Set([
    'close', 'closed', 'بسته',
    'pre-open', 'preopen', 'پیش گشایش', 'پیش‌گشایش'
  ]);

  return !closedStates.has(normalizedState);
}

function isUsableMarketData(marketData) {
  if (!marketData || typeof marketData !== 'object') return false;

  const meaningfulKeys = [
    'overallIndex', 'index', 'brsIndex', 'marketIndex',
    'overallIndexChange', 'indexChange', 'index_change',
    'equalIndex', 'equalWeightIndex', 'indexEqualWeight', 'index_equalWeight',
    'equalChange', 'indexEqualWeightChange', 'index_equalWeight_change',
    'tradeValue', 'tradeVolume', 'tval', 'tvol', 'tno',
    'totalValue', 'totalVolume',
    'state', 'status', 'marketState', 'marketStatus', 'isMarketOpen'
  ];

  return meaningfulKeys.some((key) => {
    const value = marketData[key];
    return value !== undefined && value !== null && value !== '';
  });
}

/* ================================
 * Date / Time helpers
 * ================================ */

function getNowInTehran() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TEHRAN_TIMEZONE }));
}

function isTradingDay(date) {
  return TRADING_DAYS.has(date.getDay());
}

function isAfterMarketClose(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  return h > MARKET_CLOSE_HOUR || (h === MARKET_CLOSE_HOUR && m >= MARKET_CLOSE_MINUTE);
}

function getTehranDayStart(baseDate) {
  const tehranDate = new Date(
    new Date(baseDate).toLocaleString('en-US', { timeZone: TEHRAN_TIMEZONE })
  );
  tehranDate.setHours(0, 0, 0, 0);
  return tehranDate;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function resolveBestDate(raw, fallbackDate) {
  const candidates = [
    raw?.snapshotCreatedAt,
    raw?.createdAt,
    raw?.dateTime,
    raw?.datetime,
    raw?.timestamp,
    raw?.date
  ];

  for (const candidate of candidates) {
    const parsed = toDateOrNull(candidate);
    if (parsed) return parsed;
  }

  return toDateOrNull(fallbackDate) || new Date();
}

function toDateOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/* ================================
 * Primitive parsers
 * ================================ */

function parseJsonSafe(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parsedJsonMaybe(v) {
  return parseJsonSafe(v);
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstInt(...values) {
  for (const value of values) {
    const parsed = toInt(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstBigInt(...values) {
  for (const value of values) {
    const parsed = toBigIntOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function firstString(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const stringValue = String(value).trim();
    if (stringValue) return stringValue;
  }
  return null;
}

function normalizeDigits(input) {
  return String(input)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function toNumber(value) {
  if (value === undefined || value === null || value === '') return null;

  // برای رشته‌های خیلی بزرگ (مانند bigintها) مسیر bigint جدا داریم
  if (typeof value === 'bigint') return Number(value);

  const normalized =
    typeof value === 'string'
      ? normalizeDigits(value).replace(/,/g, '').replace(/\s+/g, '')
      : value;

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function toInt(value) {
  const num = toNumber(value);
  return num === null ? null : Math.trunc(num);
}

function toBigIntOrNull(value) {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'bigint') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    try {
      return BigInt(Math.trunc(value));
    } catch {
      return null;
    }
  }

  if (typeof value === 'string') {
    const normalized = normalizeDigits(value).replace(/,/g, '').trim();
    if (!normalized) return null;

    // اگر رشته عدد صحیح است، مستقیم BigInt (بدون افت دقت)
    if (/^[+-]?\d+$/.test(normalized)) {
      try {
        return BigInt(normalized);
      } catch {
        return null;
      }
    }

    // اگر اعشاری بود
    const asNum = Number(normalized);
    if (!Number.isFinite(asNum)) return null;
    try {
      return BigInt(Math.trunc(asNum));
    } catch {
      return null;
    }
  }

  return null;
}

function ensureArrayOrNull(value) {
  return Array.isArray(value) ? value : null;
}

function stringifyOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function stringifyBigInt(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  return String(value);
}

function trimToNull(value, maxLength) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}
