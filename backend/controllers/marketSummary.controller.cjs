'use strict';

const marketSummaryService = require('../services/marketSummary.service.cjs');

/* ================================
 * Helpers
 * ================================ */

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pick(...values) {
  for (const v of values) {
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

function formatNumberWithFallback(value, fallback = 'نامشخص') {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Number(num).toLocaleString('fa-IR');
}

function buildSummaryText(item) {
  if (!item || typeof item !== 'object') return 'خلاصه بازار در دسترس نیست.';

  const content = typeof item.content === 'string' && item.content.trim()
    ? item.content.trim()
    : typeof item.summary === 'string' && item.summary.trim()
      ? item.summary.trim()
      : null;

  if (content) return content;

  const overallIndex = pick(toNumber(item.overallIndex), toNumber(item.index), toNumber(item.marketIndex), null);
  const overallChange = pick(toNumber(item.overallChange), toNumber(item.index_change), toNumber(item.indexChange), null);
  const equalIndex = pick(toNumber(item.equalIndex), toNumber(item.index_equalWeight), toNumber(item.indexEqualWeight), null);
  const marketStatus = pick(item.marketStatus, item.state, item.status, 'نامشخص');
  const totalTrades = pick(item.totalTrades, item.tno, 'نامشخص');
  const totalVolume = pick(item.totalVolume, item.tvol, 'نامشخص');
  const totalValue = pick(item.totalValue, item.tval, 'نامشخص');
  const positiveStocks = pick(toNumber(item.positiveStocks), null);
  const negativeStocks = pick(toNumber(item.negativeStocks), null);

  const changeText = overallChange === null ? '' : ` (${overallChange >= 0 ? '+' : ''}${overallChange.toLocaleString('fa-IR')}%)`;
  const equalText = equalIndex === null ? '' : `؛ شاخص هم‌وزن: ${formatNumberWithFallback(equalIndex)}`;
  const balanceText = positiveStocks === null || negativeStocks === null
    ? ''
    : `؛ سهم‌های مثبت/منفی: ${positiveStocks.toLocaleString('fa-IR')}/${negativeStocks.toLocaleString('fa-IR')}`;

  return `شاخص کل: ${formatNumberWithFallback(overallIndex, 'نامشخص')}${changeText}؛ وضعیت بازار: ${String(marketStatus)}؛ تعداد معاملات: ${formatNumberWithFallback(totalTrades, 'نامشخص')}؛ حجم معاملات: ${formatNumberWithFallback(totalVolume, 'نامشخص')}؛ ارزش معاملات: ${formatNumberWithFallback(totalValue, 'نامشخص')}${equalText}${balanceText}.`;
}

/**
 * نرمال‌سازی رکورد خروجی summary:
 * - ابتدا ستون‌های اصلی DB
 * - در صورت null بودن، fallback از rawJson.data
 */
function normalizeSummaryRecord(row) {
  if (!row || typeof row !== 'object') return row;

  const rawJson = row.rawJson && typeof row.rawJson === 'object' ? row.rawJson : null;
  const raw = rawJson && rawJson.data && typeof rawJson.data === 'object' ? rawJson.data : {};
  const summaryText = buildSummaryText({ ...row, ...raw });

  return {
    id: pick(row.id, null),
    date: pick(row.date, null),

    overallIndex: pick(toNumber(row.overallIndex), toNumber(raw.index)),
    overallChange: pick(toNumber(row.overallChange), toNumber(raw.index_change)),
    equalIndex: pick(toNumber(row.equalIndex), toNumber(raw.index_equalWeight)),
    equalChange: pick(toNumber(row.equalChange), toNumber(raw.index_equalWeight_change)),

    // اگر status استاندارد DB خالی بود از state خام استفاده می‌کنیم
    marketStatus: pick(row.marketStatus, raw.state, null),

    totalTrades: pick(toNumber(row.totalTrades), toNumber(raw.tno)),
    totalVolume: pick(toNumber(row.totalVolume), toNumber(raw.tvol)),
    totalValue: pick(toNumber(row.totalValue), toNumber(raw.tval)),

    positiveStocks: pick(toNumber(row.positiveStocks), null),
    negativeStocks: pick(toNumber(row.negativeStocks), null),
    neutralStocks: pick(toNumber(row.neutralStocks), null),

    topGainers: pick(row.topGainers, null),
    topLosers: pick(row.topLosers, null),
    topVolumes: pick(row.topVolumes, null),

    rawJson: pick(rawJson, null),
    createdAt: pick(row.createdAt, null),
    updatedAt: pick(row.updatedAt, null),
    content: summaryText,
    summary: summaryText,

    // قرارداد خروجی قبلی حفظ شود
    fallback: Boolean(row.fallback)
  };
}

/* ================================
 * Public APIs
 * ================================ */

/**
 * GET /api/market-summary/latest
 * دریافت آخرین خلاصه بازار
 * اگر برای آخرین روز معاملاتی summary موجود نباشد،
 * از آخرین MarketHistory معتبر به‌صورت on-demand تولید می‌شود.
 */
exports.getLatestMarketSummary = async (req, res) => {
  try {
    const result = await marketSummaryService.findOrGenerateLatest();
    const normalizedData = normalizeSummaryRecord(result?.data || null);

    return res.json({
      success: true,
      data: normalizedData,
      fallback: Boolean(result?.fallback),
      generated: Boolean(result?.generated),
      cached: Boolean(result?.cached),
      sourceType: result?.sourceType || null,
      message: result?.message || null
    });
  } catch (error) {
    console.error('[MarketSummary] Get latest error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت خلاصه بازار',
      error: error.message
    });
  }
};

/**
 * GET /api/market-summary/history
 */
exports.getMarketSummaryHistory = async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    const result = await marketSummaryService.findHistory({ page, limit });

    const normalizedHistory = Array.isArray(result?.data)
      ? result.data.map((item) => normalizeSummaryRecord(item))
      : [];

    return res.json({
      success: true,
      data: normalizedHistory,
      pagination: result?.pagination || null
    });
  } catch (error) {
    console.error('[MarketSummary] Get history error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت تاریخچه خلاصه بازار',
      error: error.message
    });
  }
};

/**
 * POST /api/market-summary/generate
 * (Admin) تولید summary عددی از marketData یا آخرین MarketHistory
 */
exports.generateMarketSummary = async (req, res) => {
  try {
    const { marketData, forceRegenerate = false } = req.body || {};

    const result = await marketSummaryService.generateMarketSummary({
      marketData: marketData || null,
      forceRegenerate: forceRegenerate === true
    });

    const normalizedData = normalizeSummaryRecord(result?.data || null);

    return res.json({
      success: true,
      data: normalizedData,
      cached: Boolean(result?.cached),
      generated: Boolean(result?.generated),
      sourceType: result?.sourceType || null,
      message: result?.cached
        ? 'خلاصه همان روز قبلاً تولید شده است'
        : 'خلاصه بازار با موفقیت تولید شد'
    });
  } catch (error) {
    console.error('[MarketSummary] Generate error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در تولید خلاصه بازار',
      error: error.message
    });
  }
};

/**
 * POST /api/market-summary/auto-generate
 * فقط برای کرون داخلی
 * امنیت: secret از header خوانده می‌شود
 * شرط اجرا: فقط روز معاملاتی و بعد از بسته شدن بازار (مگر force=true)
 */
exports.autoGenerateMarketSummary = async (req, res) => {
  try {
    const expectedSecret =
      process.env.INTERNAL_CRON_KEY ||
      process.env.CRON_SECRET ||
      process.env.INTERNAL_CRON_SECRET;

    if (!expectedSecret) {
      return res.status(500).json({
        success: false,
        message: 'کلید داخلی cron تنظیم نشده است'
      });
    }

    const providedSecret =
      req.headers['x-internal-key'] ||
      req.headers['x-cron-key'] ||
      req.headers['x-api-key'];

    if (!providedSecret || String(providedSecret) !== String(expectedSecret)) {
      return res.status(403).json({
        success: false,
        message: 'دسترسی غیرمجاز'
      });
    }

    const force = req.body?.force === true;
    const nowTehran = marketSummaryService.getNowInTehran();

    if (!force) {
      if (!marketSummaryService.isTradingDay(nowTehran)) {
        return res.json({
          success: false,
          skipped: true,
          message: 'روز غیرمعاملاتی است؛ تولید خلاصه انجام نشد'
        });
      }

      if (!marketSummaryService.isAfterMarketClose(nowTehran)) {
        return res.json({
          success: false,
          skipped: true,
          message: 'بازار هنوز بسته نشده است؛ تولید خلاصه انجام نشد'
        });
      }
    }

    const result = await marketSummaryService.generateMarketSummary({
      forceRegenerate: force
    });

    const normalizedData = normalizeSummaryRecord(result?.data || null);

    return res.json({
      success: true,
      data: normalizedData,
      cached: Boolean(result?.cached),
      generated: Boolean(result?.generated),
      sourceType: result?.sourceType || null,
      message: result?.cached
        ? 'خلاصه امروز قبلاً تولید شده است'
        : 'خلاصه بازار با موفقیت تولید شد'
    });
  } catch (error) {
    console.error('[MarketSummary] Auto-generate error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در تولید خودکار خلاصه بازار',
      error: error.message
    });
  }
};
