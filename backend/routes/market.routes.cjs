'use strict';

var express = require('express');
var router = express.Router();

var marketHistoryController = require('../controllers/marketHistory.controller.cjs');
var marketSummaryController = require('../controllers/marketSummary.controller.cjs');

// شاخص بازار
router.get('/index', marketHistoryController.getMarketIndex);

// خلاصه بازار
router.get('/summary', marketSummaryController.getLatestMarketSummary);

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
