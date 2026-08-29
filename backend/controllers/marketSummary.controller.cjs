'use strict';

const marketSummaryService = require('../services/marketSummary.service.cjs');

/* ================================
 * Helpers
 * ================================ */

/**
 * پاکسازی داده‌ها برای جلوگیری از خطای BigInt در JSON.stringify
 */
function sanitizeBigIntDeep(input) {
  if (input === null || input === undefined) return input;
  if (typeof input === 'bigint') return input.toString();
  if (Array.isArray(input)) return input.map(sanitizeBigIntDeep);
  if (typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, sanitizeBigIntDeep(v)])
    );
  }
  return input;
}

const sendResponse = (res, code, payload) => {
  if (res.headersSent) return;
  return res.status(code).json(sanitizeBigIntDeep(payload));
};

function toDateInputOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/* ================================
 * Actions
 * ================================ */

exports.getLatestMarketSummary = async (req, res) => {
  try {
    const result = await marketSummaryService.findOrGenerateLatest();

    if (!result?.data) {
      const nowIso = new Date().toISOString();
      return sendResponse(res, 200, {
        success: true,
        data: {
          id: 0,
          date: nowIso,
          createdAt: nowIso,
          summaryDate: nowIso.split('T')[0],
          content: result?.message || 'در حال حاضر داده‌ای در دسترس نیست.',
          summary: result?.message || 'در حال حاضر داده‌ای در دسترس نیست.',
          overallIndex: null,
          isNoDataNotice: true
        },
        meta: {
          generated: false,
          fallback: true,
          sourceType: result?.sourceType || 'none',
          reason: result?.reason || 'NO_DATA_AVAILABLE',
          diagnostics: result?.diagnostics || null
        }
      });
    }

    return sendResponse(res, 200, {
      success: true,
      data: result.data,
      meta: {
        generated: !!result.generated,
        sourceType: result.sourceType,
        cached: !!result.cached,
        reason: result.reason,
        diagnostics: result.diagnostics || null
      }
    });
  } catch (error) {
    console.error('[MarketSummaryController][Critical]', error);
    return sendResponse(res, 500, {
      success: false,
      message: 'Internal Server Failure',
      error: error.message
    });
  }
};

exports.getMarketSummaryHistory = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

    const result = await marketSummaryService.findHistory({ page, limit });

    return sendResponse(res, 200, {
      success: true,
      data: result.data || [],
      pagination: result.pagination
    });
  } catch (error) {
    console.error('[MarketSummaryController][HistoryError]', error);
    return sendResponse(res, 500, { success: false, message: error.message });
  }
};

/**
 * لیست تاریخ‌های در دسترس (حداکثر به اندازه retention)
 */
exports.getAvailableDates = async (req, res) => {
  try {
    const dates = await marketSummaryService.getAvailableDates();
    return sendResponse(res, 200, {
      success: true,
      data: dates || []
    });
  } catch (error) {
    console.error('[MarketSummaryController][DatesError]', error);
    return sendResponse(res, 500, {
      success: false,
      message: 'خطا در دریافت لیست تاریخ‌ها',
      error: error.message
    });
  }
};

/**
 * دریافت تحلیل بازار بر اساس تاریخ
 * route param: /by-date/:date  -> YYYY-MM-DD
 */
exports.getMarketSummaryByDate = async (req, res) => {
  try {
    const dateInput = toDateInputOrNull(req.params?.date);

    if (!dateInput) {
      return sendResponse(res, 400, {
        success: false,
        message: 'پارامتر تاریخ الزامی است. مثال: /by-date/2026-08-19'
      });
    }

    const item = await marketSummaryService.findByDate(dateInput);

    if (!item) {
      return sendResponse(res, 404, {
        success: false,
        message: 'تحلیلی برای تاریخ درخواستی یافت نشد',
        meta: { date: dateInput, reason: 'NOT_FOUND' }
      });
    }

    return sendResponse(res, 200, {
      success: true,
      data: item,
      meta: {
        date: dateInput,
        sourceType: 'by_date'
      }
    });
  } catch (error) {
    console.error('[MarketSummaryController][ByDateError]', error);
    return sendResponse(res, 500, {
      success: false,
      message: 'خطا در دریافت تحلیل بر اساس تاریخ',
      error: error.message
    });
  }
};

/**
 * اجبار سیستم به تولید خلاصه بازار بر اساس آخرین داده هیستوری
 */
exports.generateMarketSummary = async (req, res) => {
  try {
    const history = await marketSummaryService.findLatestUsableMarketHistoryRow();

    if (!history || !history.marketData) {
      const inspection = await marketSummaryService.inspectLatestMarketHistoryRows({ take: 5 });

      return sendResponse(res, 200, {
        success: false,
        message: 'امکان تولید دستی وجود ندارد زیرا داده معتبری در سوابق بازار (MarketHistory) یافت نشد.',
        meta: {
          reason: inspection?.diagnostics?.reasonCode || 'NO_USABLE_MARKET_HISTORY',
          diagnostics: inspection?.diagnostics || null
        }
      });
    }

    const result = await marketSummaryService.generateMarketSummary({
      marketData: history.marketData,
      fallbackDate: history.row.createdAt
    });

    return sendResponse(res, 200, {
      success: true,
      data: result.data,
      meta: {
        sourceType: result.sourceType,
        generated: true,
        reason: result.reason,
        diagnostics: result.diagnostics || null
      }
    });
  } catch (error) {
    console.error('[MarketSummaryController][GenerateError]', error);
    return sendResponse(res, 500, {
      success: false,
      message: 'خطا در فرآیند تولید دستی خلاصه بازار',
      error: error.message
    });
  }
};

exports.autoGenerateMarketSummary = async (req, res) => {
  try {
    const result = await marketSummaryService.findOrGenerateLatest();
    return sendResponse(res, 200, {
      success: true,
      source: 'auto-cron',
      data: result.data || null,
      meta: {
        sourceType: result.sourceType,
        reason: result.reason,
        generated: !!result.generated,
        cached: !!result.cached,
        diagnostics: result.diagnostics || null
      }
    });
  } catch (error) {
    console.error('[MarketSummaryController][AutoGenerateError]', error);
    return sendResponse(res, 500, { success: false, message: error.message });
  }
};

/**
 * اجرای دستی retention (اختیاری برای ادمین/دیباگ)
 */
exports.runRetentionNow = async (req, res) => {
  try {
    const keep = Number.parseInt(req.query.keep, 10);
    const result = await marketSummaryService.retainOnlyLastNSummaries(
      Number.isInteger(keep) && keep > 0 ? keep : undefined
    );

    return sendResponse(res, 200, {
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[MarketSummaryController][RetentionError]', error);
    return sendResponse(res, 500, {
      success: false,
      message: 'خطا در اجرای retention',
      error: error.message
    });
  }
};
