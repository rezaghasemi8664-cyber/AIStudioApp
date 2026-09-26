/**
 * Market History Controller - shared-data compatible route handlers.
 * User-facing current market data is served exclusively from Shared Market DB.
 * Legacy MarketHistory snapshots are retained only for backward-compatible
 * history endpoints and are never refreshed from BRS/TSETMC here.
 */
'use strict';

const sharedMarketService = require('../services/sharedMarket.service.cjs');
const marketHistoryService = require('../services/marketHistory.service.cjs');

function errorMessage(error) {
  return error && error.message ? error.message : 'Unknown error';
}

function parseLimit(value, fallback = 20, max = 100) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function safeJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

// GET /api/market-history
// Backward-compatible snapshot history. No upstream market request is made.
async function getHistory(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = parseLimit(req.query.limit);
    const records = await marketHistoryService.getMarketHistory(page * limit);
    const start = (page - 1) * limit;
    const data = records.slice(start, start + limit).map((record) => ({
      id: record?._recordId ?? record?.id ?? null,
      data: safeJson(record),
      createdAt: record?._createdAt ?? record?.createdAt ?? null
    }));

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: records.length < page * limit ? start + data.length : null,
        totalPages: records.length < page * limit
          ? Math.ceil((start + data.length) / limit)
          : null
      },
      source: 'legacy-market-history'
    });
  } catch (error) {
    console.error('[MARKET-HISTORY] GET / error:', errorMessage(error));
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت تاریخچه بازار'
    });
  }
}

// POST /api/market-history
// Kept only for backward compatibility. It writes a normalized snapshot to
// the legacy table; it does not call BRS/TSETMC and does not affect Shared DB.
async function create(req, res) {
  try {
    const data = req.body && Object.prototype.hasOwnProperty.call(req.body, 'data')
      ? req.body.data
      : req.body;

    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'داده تاریخچه الزامی است'
      });
    }

    const record = await marketHistoryService.saveMarketSnapshot(data);
    if (!record) {
      return res.status(422).json({
        success: false,
        message: 'داده تاریخچه قابل ذخیره نیست'
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        id: record._recordId ?? record.id ?? null,
        data: record,
        createdAt: record._createdAt ?? record.createdAt ?? null
      },
      message: 'ذخیره شد'
    });
  } catch (error) {
    console.error('[MARKET-HISTORY] POST / error:', errorMessage(error));
    return res.status(500).json({
      success: false,
      message: 'خطا در ذخیره داده'
    });
  }
}

// GET /api/market-history/latest
async function getLatest(req, res) {
  try {
    const latest = await marketHistoryService.getLatestMarketHistory();

    if (!latest) {
      return res.json({ success: true, data: null });
    }

    return res.json({
      success: true,
      data: {
        id: latest._recordId ?? latest.id ?? null,
        data: latest,
        createdAt: latest._createdAt ?? latest.createdAt ?? null
      },
      source: 'legacy-market-history'
    });
  } catch (error) {
    console.error('[MARKET-HISTORY] GET /latest error:', errorMessage(error));
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت آخرین رکورد'
    });
  }
}

// Shared market index endpoint remains the canonical user-facing market source.
async function getMarketIndex(req, res) {
  if (!sharedMarketService || typeof sharedMarketService.getMarketCurrent !== 'function') {
    return res.status(503).json({
      success: false,
      message: 'سرویس داده مشترک بازار در دسترس نیست',
      code: 'SHARED_MARKET_SERVICE_UNAVAILABLE'
    });
  }

  try {
    const snapshot = await sharedMarketService.getMarketCurrent();
    if (!snapshot) {
      return res.status(503).json({
        success: false,
        message: 'هنوز داده‌ای از بازار در دیتابیس مشترک ثبت نشده است',
        code: 'NO_SHARED_MARKET_DATA'
      });
    }

    return res.json({
      success: true,
      data: snapshot,
      cached: true,
      stale: !!snapshot.isStale,
      source: 'shared-db',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[MARKET CTRL] Shared market index error:', errorMessage(error));
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت شاخص بازار از دیتابیس مشترک',
      code: 'SHARED_MARKET_READ_ERROR'
    });
  }
}

module.exports = {
  getHistory,
  create,
  getLatest,
  getMarketIndex,
  index: getMarketIndex
};
