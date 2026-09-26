'use strict';

var express = require('express');
var router = express.Router();

var marketHistoryController = require('../controllers/marketHistory.controller.cjs');
var marketSummaryController = require('../controllers/marketSummary.controller.cjs');
var marketRadarHistoryController = require('../controllers/marketRadarHistory.controller.cjs');
var marketBreadth = require('../services/marketBreadth.service.cjs');
var marketSummaryService = require('../services/marketSummary.service.cjs');

// شاخص بازار
router.get('/index', marketHistoryController.getMarketIndex);

// خلاصه بازار
router.get('/summary', marketSummaryController.getLatestMarketSummary);

// تاریخچه واقعی رادار بازار از MarketSummary - بدون داده ساختگی و بدون هوش مصنوعی
router.get('/history/radar', marketRadarHistoryController.getHistory);

// عرض بازار - محاسبه قطعی و بدون هوش مصنوعی

// Real-data fallback: if live breadth sources are temporarily unavailable,
// serve the latest persisted daily market snapshot instead of an empty dashboard.
// This is explicitly marked stale; no synthetic values are generated.
async function getBreadthWithStoredFallback() {
  const live = await marketBreadth.getMarketBreadth();
  if (live && (
    live.available === true ||
    (Array.isArray(live.topGainers) && live.topGainers.length) ||
    (Array.isArray(live.topLosers) && live.topLosers.length) ||
    (Array.isArray(live.topVolumes) && live.topVolumes.length)
  )) {
    return live;
  }

  try {
    const latest = await marketSummaryService.findOrGenerateLatest();
    const stored = latest && latest.data ? latest.data : null;
    if (!stored) return live;

    let raw = stored.rawJson;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (_) { raw = null; }
    }
    const rawData = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' ? raw.data : raw;
    const topGainers = Array.isArray(stored.topGainers) ? stored.topGainers : (Array.isArray(rawData?.topGainers) ? rawData.topGainers : []);
    const topLosers = Array.isArray(stored.topLosers) ? stored.topLosers : (Array.isArray(rawData?.topLosers) ? rawData.topLosers : []);
    const topVolumes = Array.isArray(stored.topVolumes) ? stored.topVolumes : (Array.isArray(rawData?.topVolumes) ? rawData.topVolumes : []);
    const positive = Number(stored.positiveStocks);
    const negative = Number(stored.negativeStocks);
    const neutral = Number(stored.neutralStocks);

    return {
      ...(live || {}),
      available: false,
      stale: true,
      source: 'db-daily-summary',
      topGainers,
      topLosers,
      topVolumes,
      positive: Number.isFinite(positive) ? positive : (live?.positive ?? 0),
      negative: Number.isFinite(negative) ? negative : (live?.negative ?? 0),
      neutral: Number.isFinite(neutral) ? neutral : (live?.neutral ?? 0),
      total: Number.isFinite(positive) && Number.isFinite(negative) && Number.isFinite(neutral)
        ? positive + negative + neutral
        : (live?.total ?? 0),
      storedAt: stored.createdAt || stored.updatedAt || null,
      diagnostics: {
        ...(live?.diagnostics || {}),
        servedFromStoredSummary: true
      }
    };
  } catch (error) {
    console.warn('[MARKET ROUTES] Stored breadth fallback failed:', error.message);
    return live;
  }
}


// Dashboard movers compatibility endpoint.
// Uses the same deterministic breadth dataset; no AI and no synthetic data.
router.get('/movers', async function getMarketMovers(_req, res, next) {
  try {
    const data = await getBreadthWithStoredFallback();
    return res.json({
      success: true,
      data: {
        items: [...(data.topGainers || []), ...(data.topLosers || []), ...(data.topVolumes || [])],
        gainers: data.topGainers || [],
        losers: data.topLosers || [],
        highVolume: data.topVolumes || []
      }
    });
  } catch (error) {
    return next(error);
  }
});

// Dashboard industries compatibility endpoint.
router.get('/industries', async function getMarketIndustries(_req, res, next) {
  try {
    const data = await getBreadthWithStoredFallback();
    const sectors = data.sectors || {};
    const rows = sectors.rows || [];
    return res.json({
      success: true,
      data: rows.length ? rows : [...(sectors.leaders || []), ...(sectors.laggards || [])]
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/breadth', async function getMarketBreadth(_req, res, next) {
  try {
    const data = await getBreadthWithStoredFallback();
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

// شاخص BRS
// تا وقتی handler مجزا وجود ندارد، این route alias رسمی همان market index است.
router.get('/brs-index', marketHistoryController.getMarketIndex);

// اطلاعات نماد
router.get('/symbol/:name', marketHistoryController.getSymbolData);

// تاریخچه نماد
router.get('/history/:name', marketHistoryController.getSymbolHistory);

// تاریخچه کلی بازار
router.get('/history', marketHistoryController.getMarketHistory);

// لیست نمادها
router.get('/symbols', marketHistoryController.getAllSymbols);

// جستجوی نماد
router.get('/search', marketHistoryController.searchSymbols);

// دیباگ داده بازار
router.get('/debug', marketHistoryController.debugMarketData);

// پاک کردن کش
router.post('/cache/clear', marketHistoryController.clearCache);

module.exports = router;
