'use strict';

var express = require('express');
var router = express.Router();

var marketHistoryController = require('../controllers/marketHistory.controller.cjs');
var marketSummaryController = require('../controllers/marketSummary.controller.cjs');
var marketRadarHistoryController = require('../controllers/marketRadarHistory.controller.cjs');
var marketSummaryService = require('../services/marketSummary.service.cjs');
var allSymbolsSnapshotService = require('../services/allSymbolsSnapshot.service.cjs');

// شاخص بازار
router.get('/index', marketHistoryController.getMarketIndex);

// خلاصه بازار
router.get('/summary', marketSummaryController.getLatestMarketSummary);

// تاریخچه واقعی رادار بازار از MarketSummary - بدون داده ساختگی و بدون هوش مصنوعی
router.get('/history/radar', marketRadarHistoryController.getHistory);

// داده‌های رشد/افت/حجم و breadth فقط از دیتابیس مشترک خوانده می‌شوند.
// درخواست کاربر نباید مستقیماً به BRS/TSETMC متصل شود.
var sharedMarketService = require('../services/sharedMarket.service.cjs');

router.get('/movers', async function getMarketMovers(_req, res, next) {
  try {
    const breadth = await sharedMarketService.getBreadth();
    if (!breadth) {
      return res.status(503).json({
        success: false,
        message: 'هنوز داده مشترک بازار ثبت نشده است',
        code: 'NO_SHARED_MARKET_DATA'
      });
    }

    return res.json({
      success: true,
      data: {
        items: [...breadth.topGainers, ...breadth.topLosers, ...breadth.topVolumes],
        gainers: breadth.topGainers,
        losers: breadth.topLosers,
        highVolume: breadth.topVolumes
      },
      source: 'shared-db',
      stale: breadth.stale
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/breadth', async function getMarketBreadth(_req, res, next) {
  try {
    const breadth = await sharedMarketService.getBreadth();
    if (!breadth) {
      return res.status(503).json({
        success: false,
        message: 'هنوز داده مشترک بازار ثبت نشده است',
        code: 'NO_SHARED_MARKET_DATA'
      });
    }

    return res.json({
      success: true,
      data: breadth,
      source: 'shared-db',
      stale: breadth.stale
    });
  } catch (error) {
    return next(error);
  }
});

// صنایع در گام بعدی به MarketIndustryCurrent متصل می‌شوند.
router.get('/industries', async function getMarketIndustries(_req, res, next) {
  try {
    const rows = await sharedMarketService.getIndustries();
    return res.json({
      success: true,
      data: rows,
      source: 'shared-db'
    });
  } catch (error) {
    return next(error);
  }
});

// شاخص BRS
// تا وقتی handler مجزا وجود ندارد، این route alias رسمی همان market index است.
router.get('/brs-index', marketHistoryController.getMarketIndex);

// جستجوی نماد فقط از آخرین اسنپ‌شات AllSymbols ذخیره‌شده در دیتابیس؛ بدون فراخوانی مستقیم BRS در درخواست کاربر.
router.get('/all-symbols/search', async function searchAllSymbolsSnapshot(req, res, next) {
  try {
    const symbol = String(req.query.symbol || '').trim();
    if (!symbol) return res.status(400).json({ success: false, code: 'SYMBOL_REQUIRED', message: 'نماد را وارد کنید.' });
    const result = await allSymbolsSnapshotService.searchSymbol(symbol);
    if (result.status === 'NO_SNAPSHOT') return res.status(503).json({ success: false, code: 'ALL_SYMBOLS_SNAPSHOT_UNAVAILABLE', message: 'هنوز اسنپ‌شات AllSymbols در دیتابیس ثبت نشده است.' });
    if (result.status === 'NOT_FOUND') return res.status(404).json({ success: false, code: 'SYMBOL_NOT_FOUND', message: 'نماد در آخرین اسنپ‌شات بازار پیدا نشد.', snapshotUpdatedAt: result.snapshotUpdatedAt, snapshotDate: result.snapshotDate });
    return res.json({ success: true, data: result.symbol, snapshot: { id: result.snapshotId, updatedAt: result.snapshotUpdatedAt, date: result.snapshotDate, symbolCount: result.symbolCount, source: result.source } });
  } catch (error) { return next(error); }
});

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
