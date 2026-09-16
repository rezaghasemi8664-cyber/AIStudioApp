'use strict';

const marketSummaryService = require('../services/marketSummary.service.cjs');

function sanitizeBigIntDeep(input) {
  if (input === null || input === undefined) return input;
  if (typeof input === 'bigint') return input.toString();
  if (Array.isArray(input)) return input.map(sanitizeBigIntDeep);
  if (typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, sanitizeBigIntDeep(v)]));
  return input;
}
function sendResponse(res, code, payload) {
  if (res.headersSent) return;
  return res.status(code).json(sanitizeBigIntDeep(payload));
}

exports.getLatestMarketSummary = async (req, res) => {
  try {
    const result = await marketSummaryService.findOrGenerateLatest();
    if (!result?.data) {
      return sendResponse(res, 200, {
        success: true,
        data: null,
        meta: {
          generated: false,
          sourceType: result?.sourceType || 'none',
          reason: result?.reason || 'NO_DAILY_SUMMARY_AVAILABLE'
        }
      });
    }
    return sendResponse(res, 200, {
      success: true,
      data: result.data,
      meta: {
        generated: false,
        sourceType: result.sourceType,
        cached: true,
        reason: result.reason,
        ai: false
      }
    });
  } catch (error) {
    console.error('[MarketSummaryController][Latest]', error);
    return sendResponse(res, 500, { success: false, message: 'خطا در دریافت خلاصه روزانه بازار', error: error.message });
  }
};

exports.getMarketSummaryHistory = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const result = await marketSummaryService.findHistory({ page, limit });
    return sendResponse(res, 200, {
      success: true,
      data: result.data,
      pagination: result.pagination,
      meta: { ai: false, sourceType: 'db_daily_summaries' }
    });
  } catch (error) {
    console.error('[MarketSummaryController][History]', error);
    return sendResponse(res, 500, { success: false, message: 'خطا در دریافت تاریخچه خلاصه بازار', error: error.message });
  }
};

exports.getAvailableDates = async (req, res) => {
  try {
    return sendResponse(res, 200, {
      success: true,
      data: await marketSummaryService.getAvailableDates(),
      meta: { ai: false }
    });
  } catch (error) {
    return sendResponse(res, 500, { success: false, message: 'خطا در دریافت فهرست تاریخ‌های خلاصه بازار', error: error.message });
  }
};

exports.getMarketSummaryByDate = async (req, res) => {
  try {
    const dateInput = String(req.params?.date || '').trim();
    if (!dateInput) return sendResponse(res, 400, { success: false, message: 'پارامتر تاریخ الزامی است.' });
    const item = await marketSummaryService.findByDate(dateInput);
    if (!item) {
      return sendResponse(res, 404, { success: false, message: 'خلاصه‌ای برای تاریخ درخواستی یافت نشد', meta: { date: dateInput } });
    }
    return sendResponse(res, 200, {
      success: true,
      data: item,
      meta: { date: dateInput, sourceType: 'db_daily_summary', ai: false }
    });
  } catch (error) {
    return sendResponse(res, 500, { success: false, message: 'خطا در دریافت خلاصه بازار بر اساس تاریخ', error: error.message });
  }
};

// Manual generation remains available for administration/testing, but it is
// deterministic and never calls an AI provider. The normal daily pipeline is
// still generated only by the 12:35 Tehran scheduler.
exports.generateMarketSummary = async (req, res) => {
  try {
    const candidate = await marketSummaryService.findLatestUsableMarketHistoryRow();
    if (!candidate?.marketData) {
      return sendResponse(res, 200, {
        success: false,
        message: 'داده معتبر بازار برای تولید خلاصه پیدا نشد.',
        meta: { reason: 'NO_USABLE_MARKET_HISTORY', ai: false }
      });
    }
    const result = await marketSummaryService.generateMarketSummary({
      marketData: candidate.marketData,
      fallbackDate: candidate.row?.createdAt || new Date()
    });
    return sendResponse(res, result?.data ? 200 : 422, {
      success: Boolean(result?.data),
      data: result?.data || null,
      meta: { sourceType: result?.sourceType || 'deterministic', generated: Boolean(result?.generated), reason: result?.reason, ai: false }
    });
  } catch (error) {
    console.error('[MarketSummaryController][Generate]', error);
    return sendResponse(res, 500, { success: false, message: 'خطا در تولید خلاصه بازار', error: error.message });
  }
};

exports.autoGenerateMarketSummary = async (req, res) => {
  try {
    // No request-time generation: the daily cron is the only normal generator.
    const result = await marketSummaryService.findOrGenerateLatest();
    return sendResponse(res, 200, {
      success: true,
      data: result?.data || null,
      meta: { sourceType: result?.sourceType || 'none', generated: false, reason: result?.reason, ai: false }
    });
  } catch (error) {
    return sendResponse(res, 500, { success: false, message: error.message });
  }
};

exports.runRetentionNow = async (req, res) => {
  try {
    const keep = Number.parseInt(req.query.keep, 10);
    const result = await marketSummaryService.retainOnlyLastNSummaries(Number.isInteger(keep) && keep > 0 ? keep : undefined);
    return sendResponse(res, 200, { success: true, data: result });
  } catch (error) {
    return sendResponse(res, 500, { success: false, message: 'خطا در اجرای retention', error: error.message });
  }
};
