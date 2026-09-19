'use strict';

var express = require('express');
var router = express.Router();

var marketHistoryController = require('../controllers/marketHistory.controller.cjs');
var marketSummaryController = require('../controllers/marketSummary.controller.cjs');
var marketRadarHistoryController = require('../controllers/marketRadarHistory.controller.cjs');
var marketBreadth = require('../services/marketBreadth.service.cjs');

// شاخص بازار
router.get('/index', marketHistoryController.getMarketIndex);

// خلاصه بازار
router.get('/summary', marketSummaryController.getLatestMarketSummary);

// تاریخچه واقعی رادار بازار از MarketSummary - بدون داده ساختگی و بدون هوش مصنوعی
router.get('/history/radar', marketRadarHistoryController.getHistory);

// عرض بازار - محاسبه قطعی و بدون هوش مصنوعی

// Dashboard movers compatibility endpoint.
// Uses the same deterministic breadth dataset; no AI and no synthetic data.
router.get('/movers', async function getMarketMovers(_req, res, next) {
  try {
    const data = await marketBreadth.getMarketBreadth();
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
    const data = await marketBreadth.getMarketBreadth();
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
    const data = await marketBreadth.getMarketBreadth();
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
