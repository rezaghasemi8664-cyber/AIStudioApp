'use strict';

/**
 * scripts/repair-market-summary-numbers.cjs
 *
 * هدف:
 * 1) اصلاح فیلدهای عددی MarketSummary بر اساس rawJson.data (Data-First)
 * 2) رفع باگ معروف: equalChange == equalIndex (مقادیر بزرگ)
 * 3) نرمال‌سازی rawJson و حذف اتکا به اعداد احتمالی متن AI
 *
 * اجرا:
 *   node scripts/repair-market-summary-numbers.cjs
 *
 * نکته:
 * - قبل از اجرا از DB بکاپ بگیر.
 * - این اسکریپت فقط رکوردهایی را آپدیت می‌کند که واقعاً تغییر لازم داشته باشند.
 */

const prismaModule = require('../config/prisma.cjs');

/* ================================
 * Prisma Resolver
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
  throw new Error('[repair-market-summary-numbers] Prisma client is unavailable.');
}

function getModel(prismaClient, pascalName, camelName) {
  return prismaClient?.[pascalName] || prismaClient?.[camelName] || null;
}

function getMarketSummaryModel() {
  const model = getModel(prisma, 'MarketSummary', 'marketSummary');
  if (!model) {
    throw new Error('[repair-market-summary-numbers] MarketSummary model is unavailable.');
  }
  return model;
}

/* ================================
 * Helpers
 * ================================ */
const FIELD_KEYS = {
  index: ['index'],
  changeIndex: ['change_index'],
  equalIndex: ['equalWeight_index'],
  equalChange: ['change_equalWeight_index'],
  marketState: ['state'],
  totalTrades: ['tno'],
  totalVolume: ['tvol'],
  totalValue: ['tval']
};

function jsonStringifySafe(value, space = 0) {
  return JSON.stringify(
    value,
    (_, v) => (typeof v === 'bigint' ? v.toString() : v),
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
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function toBigIntOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'bigint') return value;
  const n = toNumber(value);
  if (n === null) return null;
  return BigInt(Math.trunc(n));
}

function firstString(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function pickValue(obj, keys, parser = toNumber) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const parsed = parser(obj[k]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function normalizeMarketStatus(value) {
  const status = firstString(value)?.toLowerCase();
  if (!status) return null;
  if (['open', 'opened', 'باز'].some((x) => status.includes(x))) return 'open';
  if (['close', 'closed', 'بسته'].some((x) => status.includes(x))) return 'close';
  return status.slice(0, 50);
}

function applyEqualChangeGuard(equalIndex, equalChange, marketData, existingRaw) {
  const idx = toNumber(equalIndex);
  const chg = toNumber(equalChange);

  // الگوی خطا: equalChange اشتباهاً برابر equalIndex
  if (idx !== null && chg !== null && idx === chg && Math.abs(idx) > 10000) {
    const direct = pickValue(marketData, FIELD_KEYS.equalChange, toNumber);
    if (direct !== null && direct !== idx) return direct;

    const rawCandidate = pickValue(existingRaw?.data || {}, FIELD_KEYS.equalChange, toNumber);
    if (rawCandidate !== null && rawCandidate !== idx) return rawCandidate;

    return 0;
  }

  return chg;
}

function sameNumber(a, b) {
  const x = toNumber(a);
  const y = toNumber(b);
  return (x === null && y === null) || x === y;
}

function sameBigInt(a, b) {
  const x = toBigIntOrNull(a);
  const y = toBigIntOrNull(b);
  return (x === null && y === null) || x === y;
}

/* ================================
 * Repair Runner
 * ================================ */
async function run() {
  const MarketSummary = getMarketSummaryModel();

  const rows = await MarketSummary.findMany({
    orderBy: { summaryDate: 'desc' }
  });

  console.log(`[repair] total rows: ${rows.length}`);

  let scanned = 0;
  let updated = 0;
  let skippedNoRaw = 0;
  let fixedEqualBug = 0;
  let failed = 0;

  for (const row of rows) {
    scanned += 1;

    try {
      const raw = parseJsonSafe(row.rawJson) || {};
      const data = raw?.data || null;

      if (!data || typeof data !== 'object') {
        skippedNoRaw += 1;
        continue;
      }

      const nextOverallIndex = pickValue(data, FIELD_KEYS.index, toNumber);
      const nextOverallChange = pickValue(data, FIELD_KEYS.changeIndex, toNumber);
      const nextEqualIndex = pickValue(data, FIELD_KEYS.equalIndex, toNumber);
      const nextEqualChangeRaw = pickValue(data, FIELD_KEYS.equalChange, toNumber);
      const nextEqualChange = applyEqualChangeGuard(nextEqualIndex, nextEqualChangeRaw, data, raw);

      const nextMarketStatus = normalizeMarketStatus(pickValue(data, FIELD_KEYS.marketState, firstString));
      const nextTotalTrades = pickValue(data, FIELD_KEYS.totalTrades, toBigIntOrNull);
      const nextTotalVolume = pickValue(data, FIELD_KEYS.totalVolume, toBigIntOrNull);
      const nextTotalValue = pickValue(data, FIELD_KEYS.totalValue, toBigIntOrNull);

      const patch = {};

      if (nextOverallIndex !== null && !sameNumber(row.overallIndex, nextOverallIndex)) patch.overallIndex = nextOverallIndex;
      if (nextOverallChange !== null && !sameNumber(row.overallChange, nextOverallChange)) patch.overallChange = nextOverallChange;
      if (nextEqualIndex !== null && !sameNumber(row.equalIndex, nextEqualIndex)) patch.equalIndex = nextEqualIndex;
      if (nextEqualChange !== null && !sameNumber(row.equalChange, nextEqualChange)) patch.equalChange = nextEqualChange;

      if (nextMarketStatus && row.marketStatus !== nextMarketStatus) patch.marketStatus = nextMarketStatus;

      if (nextTotalTrades !== null && !sameBigInt(row.totalTrades, nextTotalTrades)) patch.totalTrades = nextTotalTrades;
      if (nextTotalVolume !== null && !sameBigInt(row.totalVolume, nextTotalVolume)) patch.totalVolume = nextTotalVolume;
      if (nextTotalValue !== null && !sameBigInt(row.totalValue, nextTotalValue)) patch.totalValue = nextTotalValue;

      // rawJson را هم نرمال می‌کنیم (بدون حذف aiAnalysis)
      const normalizedRaw = {
        ...raw,
        data
      };
      const rawBefore = jsonStringifySafe(raw);
      const rawAfter = jsonStringifySafe(normalizedRaw);
      if (rawBefore !== rawAfter) patch.rawJson = rawAfter;

      // آمار باگ equalChange == equalIndex
      const prevIdx = toNumber(row.equalIndex);
      const prevChg = toNumber(row.equalChange);
      if (
        prevIdx !== null &&
        prevChg !== null &&
        prevIdx === prevChg &&
        Math.abs(prevIdx) > 10000 &&
        nextEqualChange !== prevChg
      ) {
        fixedEqualBug += 1;
      }

      if (Object.keys(patch).length > 0) {
        await MarketSummary.update({
          where: { id: row.id },
          data: patch
        });
        updated += 1;
        console.log(`[repair] updated row id=${row.id}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`[repair] failed row id=${row?.id}:`, err.message);
    }
  }

  console.log('------------------------------');
  console.log('[repair] DONE');
  console.log(`[repair] scanned: ${scanned}`);
  console.log(`[repair] updated: ${updated}`);
  console.log(`[repair] skipped(no raw.data): ${skippedNoRaw}`);
  console.log(`[repair] fixed equalIndex/equalChange bug: ${fixedEqualBug}`);
  console.log(`[repair] failed: ${failed}`);
  console.log('------------------------------');
}

run()
  .catch((err) => {
    console.error('[repair] fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect?.();
    } catch (_) {}
  });
