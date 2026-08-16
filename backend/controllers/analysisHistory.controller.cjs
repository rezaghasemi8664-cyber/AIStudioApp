'use strict';

const prisma = require('../config/prisma.cjs');

const MAX_HISTORY_ITEMS = 3;

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
}

function getUserId(req) {
  return toInt(req.user?.id ?? req.user?.userId);
}

function normalizeResultJson(input) {
  if (input == null) return null;
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch (_) {
    return null;
  }
}

function safeParseResultJson(input) {
  if (!input || typeof input !== 'string') return null;
  try {
    return JSON.parse(input);
  } catch (_) {
    return null;
  }
}

/* ──────────────────────────────────────────── */
/*  ایجاد تاریخچه تحلیل جدید + enforce max=3    */
/* ──────────────────────────────────────────── */
const createAnalysisHistory = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'احراز هویت لازم است' });
    }

    const { symbol, stock, recommendation, riskLevel, summary, resultJson } = req.body || {};
    const stockName = String(stock || symbol || '').trim();

    if (!stockName) {
      return res.status(400).json({ success: false, message: 'نماد سهام الزامی است' });
    }

    let finalResultJson = normalizeResultJson(resultJson);
    if (!finalResultJson && (recommendation || riskLevel || summary)) {
      finalResultJson = JSON.stringify({
        recommendation: recommendation || 'نامشخص',
        riskLevel: riskLevel || 'متوسط',
        summary: summary || '',
      });
    }

    const created = await prisma.analysisHistory.create({
      data: {
        userId,
        stock: stockName,
        resultJson: finalResultJson,
      },
    });

    // enforce: فقط 3 رکورد آخر برای هر کاربر نگه داشته شود
    const allIdsDesc = await prisma.analysisHistory.findMany({
      where: { userId },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    if (allIdsDesc.length > MAX_HISTORY_ITEMS) {
      const idsToDelete = allIdsDesc.slice(MAX_HISTORY_ITEMS).map((x) => x.id);
      await prisma.analysisHistory.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        ...created,
        parsedResult: safeParseResultJson(created.resultJson),
      },
      id: created.id,
      message: 'تاریخچه تحلیل ذخیره شد',
    });
  } catch (error) {
    console.error('[AnalysisHistory] create error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در ذخیره تاریخچه تحلیل',
      error: error.message,
    });
  }
};

/* ──────────────────────────────────────────── */
/*  دریافت تاریخچه کاربر (حداکثر 3 آیتم)         */
/* ──────────────────────────────────────────── */
const getAnalysisHistory = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'احراز هویت لازم است' });
    }

    const symbolFilter = String(req.query.symbol || req.query.stock || '').trim();
    const where = { userId };

    if (symbolFilter) {
      where.stock = { contains: symbolFilter };
    }

    const items = await prisma.analysisHistory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_ITEMS, // enforce server-side
    });

    const mapped = items.map((item) => ({
      ...item,
      parsedResult: safeParseResultJson(item.resultJson),
    }));

    return res.json({
      success: true,
      data: mapped,
      total: mapped.length,
      limit: MAX_HISTORY_ITEMS,
      offset: 0,
    });
  } catch (error) {
    console.error('[AnalysisHistory] get list error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت تاریخچه',
      error: error.message,
    });
  }
};

/* ──────────────────────────────────────────── */
/*  دریافت یک تحلیل خاص (جزئیات کامل)            */
/* ──────────────────────────────────────────── */
const getAnalysisById = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'احراز هویت لازم است' });
    }

    const id = toInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'شناسه تحلیل نامعتبر است' });
    }

    const item = await prisma.analysisHistory.findFirst({
      where: { id, userId },
    });

    if (!item) {
      return res.status(404).json({ success: false, message: 'تحلیل یافت نشد' });
    }

    return res.json({
      success: true,
      data: {
        ...item,
        parsedResult: safeParseResultJson(item.resultJson),
      },
    });
  } catch (error) {
    console.error('[AnalysisHistory] get by id error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت تحلیل',
      error: error.message,
    });
  }
};

/* ──────────────────────────────────────────── */
/*  حذف یک تحلیل                                */
/* ──────────────────────────────────────────── */
const deleteAnalysis = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'احراز هویت لازم است' });
    }

    const id = toInt(req.params.id);
    if (!id) {
      return res.status(400).json({ success: false, message: 'شناسه تحلیل نامعتبر است' });
    }

    const existing = await prisma.analysisHistory.findFirst({
      where: { id, userId },
      select: { id: true, stock: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'تحلیل یافت نشد' });
    }

    await prisma.analysisHistory.delete({ where: { id } });

    return res.json({
      success: true,
      message: 'تحلیل حذف شد',
      data: { id: existing.id, stock: existing.stock },
    });
  } catch (error) {
    console.error('[AnalysisHistory] delete error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در حذف تحلیل',
      error: error.message,
    });
  }
};

/* ──────────────────────────────────────────── */
/*  حذف کل تاریخچه کاربر                        */
/* ──────────────────────────────────────────── */
const clearHistory = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'احراز هویت لازم است' });
    }

    const result = await prisma.analysisHistory.deleteMany({
      where: { userId },
    });

    return res.json({
      success: true,
      message: `${result.count} تحلیل حذف شد`,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error('[AnalysisHistory] clear error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در پاکسازی تاریخچه',
      error: error.message,
    });
  }
};

/* ──────────────────────────────────────────── */
/*  آمار تاریخچه                                 */
/* ──────────────────────────────────────────── */
const getHistoryStats = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'احراز هویت لازم است' });
    }

    const items = await prisma.analysisHistory.findMany({
      where: { userId },
      select: { stock: true, resultJson: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_ITEMS,
    });

    let buyCount = 0;
    let sellCount = 0;
    let holdCount = 0;

    for (const item of items) {
      const parsed = safeParseResultJson(item.resultJson);
      const rec = String(parsed?.recommendation || '').toLowerCase();

      if (['خرید', 'buy'].includes(rec)) buyCount++;
      else if (['فروش', 'sell'].includes(rec)) sellCount++;
      else if (['نگهداری', 'hold'].includes(rec)) holdCount++;
    }

    return res.json({
      success: true,
      data: {
        total: items.length,
        buyCount,
        sellCount,
        holdCount,
        uniqueSymbols: [...new Set(items.map((x) => x.stock).filter(Boolean))],
        maxItems: MAX_HISTORY_ITEMS,
      },
    });
  } catch (error) {
    console.error('[AnalysisHistory] stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت آمار',
      error: error.message,
    });
  }
};

module.exports = {
  createAnalysisHistory,
  getAnalysisHistory,
  getAnalysisById,
  deleteAnalysis,
  clearHistory,
  getHistoryStats,
};
