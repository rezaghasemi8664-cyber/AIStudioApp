'use strict';

const express = require('express');
const router = express.Router();

// استفاده از مسیرهای استاندارد پروژه (طبق ساختار فایل‌های شما)
const prisma = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const marketHistoryController = require('../controllers/marketHistory.controller.cjs');

/**
 * Helper برای پارس کردن ایمن JSON
 */
const safeParseJson = (data) => {
  try {
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    return data;
  }
};

// =============================================================================
// GET /api/market-history
// =============================================================================
router.get('/', authMiddleware, async (req, res) => {
  if (marketHistoryController?.getHistory) {
    return marketHistoryController.getHistory(req, res);
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      prisma.marketHistory.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.marketHistory.count()
    ]);

    res.json({
      success: true,
      data: records.map(r => ({
        id: r.id,
        data: safeParseJson(r.jsonData),
        createdAt: r.createdAt
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[MARKET-HISTORY] GET / error:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت تاریخچه بازار' });
  }
});

// =============================================================================
// POST /api/market-history
// =============================================================================
router.post('/', authMiddleware, async (req, res) => {
  if (marketHistoryController?.create) {
    return marketHistoryController.create(req, res);
  }

  try {
    const { data } = req.body;
    const jsonData = typeof data === 'string' ? data : JSON.stringify(data || req.body);

    const record = await prisma.marketHistory.create({
      data: { jsonData }
    });

    res.status(201).json({ success: true, data: record, message: 'ذخیره شد' });
  } catch (error) {
    console.error('[MARKET-HISTORY] POST / error:', error);
    res.status(500).json({ success: false, message: 'خطا در ذخیره داده' });
  }
});

// =============================================================================
// GET /api/market-history/latest
// =============================================================================
// نکته: در صورتی که این API عمومی است، authMiddleware حذف شد. 
// اگر نیاز به امنیت دارد، آن را اضافه کنید.
router.get('/latest', async (req, res) => {
  try {
    const latest = await prisma.marketHistory.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (!latest) {
      return res.json({ success: true, data: null });
    }

    res.json({
      success: true,
      data: { 
        id: latest.id, 
        data: safeParseJson(latest.jsonData), 
        createdAt: latest.createdAt 
      }
    });
  } catch (error) {
    console.error('[MARKET-HISTORY] GET /latest error:', error);
    res.status(500).json({ success: false, message: 'خطا در دریافت آخرین رکورد' });
  }
});

module.exports = router;
