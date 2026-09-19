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

  if (typeof input === 'string') {
    const trimmed = input.trim();
    return trimmed || null;
  }

  try {
    return JSON.stringify(input);
  } catch (error) {
    console.error('[AnalysisHistory] resultJson stringify failed:', error);
    return null;
  }
}

function safeParseResultJson(input) {
  if (!input) return null;

  if (typeof input === 'object') {
    return input;
  }

  if (typeof input !== 'string') {
    return null;
  }

  try {
    return JSON.parse(input);
  } catch (error) {
    console.warn('[AnalysisHistory] invalid resultJson:', error.message);
    return null;
  }
}

function getPayload(req) {
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }

  /*
   * بعضی کلاینت‌ها ممکن است payload را داخل data یا payload
   * ارسال کنند. همه حالت‌های متداول را پشتیبانی می‌کنیم.
   */
  if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
    return {
      ...body,
      ...body.data,
    };
  }

  if (
    body.payload &&
    typeof body.payload === 'object' &&
    !Array.isArray(body.payload)
  ) {
    return {
      ...body,
      ...body.payload,
    };
  }

  return body;
}

function extractStock(payload) {
  const candidates = [
    payload.stock,
    payload.symbol,
    payload.stockSymbol,
    payload.ticker,
    payload?.result?.stock,
    payload?.result?.symbol,
    payload?.result?.stockSymbol,
    payload?.result?.ticker,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function extractResultJson(payload) {
  const candidates = [
    payload.resultJson,
    payload.result,
    payload.analysis,
    payload.data?.resultJson,
    payload.data?.result,
  ];

  for (const value of candidates) {
    if (value != null) {
      const normalized = normalizeResultJson(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  /*
   * اگر resultJson مستقیماً ارسال نشده باشد، از کل payload
   * یک نتیجه قابل بازیابی می‌سازیم.
   */
  const result = {
    symbol: extractStock(payload),
    recommendation:
      payload.recommendation ??
      payload.result?.recommendation ??
      null,
    riskLevel:
      payload.riskLevel ??
      payload.result?.riskLevel ??
      null,
    summary:
      payload.summary ??
      payload.result?.summary ??
      null,
  };

  const hasUsefulData = Object.values(result).some(
    (value) => value !== null && value !== ''
  );

  return hasUsefulData ? JSON.stringify(result) : null;
}

/**
 * POST /api/v1/analysis-history
 *
 * ذخیره کامل تحلیل.
 *
 * Prisma schema:
 * AnalysisHistory {
 *   id
 *   userId
 *   stock
 *   resultJson
 *   createdAt
 * }
 */
const createAnalysisHistory = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'احراز هویت لازم است',
      });
    }

    const payload = getPayload(req);
    const stockName = extractStock(payload);
    const finalResultJson = extractResultJson(payload);

    console.log('[AnalysisHistory] create request:', {
      userId,
      bodyType: typeof req.body,
      bodyKeys:
        req.body && typeof req.body === 'object'
          ? Object.keys(req.body)
          : [],
      stock: stockName || undefined,
      hasResultJson: Boolean(finalResultJson),
      resultJsonLength: finalResultJson?.length || 0,
    });

    if (!stockName) {
      return res.status(400).json({
        success: false,
        message: 'نماد سهام الزامی است',
      });
    }

    if (!finalResultJson) {
      return res.status(400).json({
        success: false,
        message: 'نتیجه کامل تحلیل الزامی است',
      });
    }

    /*
     * نکته بسیار مهم:
     * فقط فیلدهای واقعی Prisma را ارسال می‌کنیم.
     *
     * ❌ symbol
     * ❌ recommendation
     * ❌ riskLevel
     * ❌ summary
     *
     * این‌ها ستون AnalysisHistory نیستند.
     */
    const created = await prisma.analysisHistory.create({
      data: {
        userId,
        stock: stockName,
        resultJson: finalResultJson,
      },
    });

    /*
     * فقط 3 رکورد آخر هر کاربر نگه داشته می‌شود.
     */
    const allIds = await prisma.analysisHistory.findMany({
      where: { userId },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    if (allIds.length > MAX_HISTORY_ITEMS) {
      const idsToDelete = allIds
        .slice(MAX_HISTORY_ITEMS)
        .map((item) => item.id);

      await prisma.analysisHistory.deleteMany({
        where: {
          id: {
            in: idsToDelete,
          },
        },
      });
    }

    const parsedResult = safeParseResultJson(created.resultJson);

    return res.status(201).json({
      success: true,
      data: {
        ...created,
        parsedResult,
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

/**
 * GET /api/v1/analysis-history
 *
 * آخرین 3 تحلیل کاربر.
 */
const getAnalysisHistory = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'احراز هویت لازم است',
      });
    }

    const symbolFilter = String(
      req.query.symbol ||
      req.query.stock ||
      ''
    ).trim();

    const where = {
      userId,
    };

    if (symbolFilter) {
      where.stock = {
        contains: symbolFilter,
      };
    }

    const items = await prisma.analysisHistory.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: MAX_HISTORY_ITEMS,
    });

    const mapped = items.map((item) => {
      const parsedResult = safeParseResultJson(item.resultJson);

      return {
        ...item,

        /*
         * برای سازگاری Frontend قدیمی
         */
        symbol: item.stock,

        /*
         * تاریخچه خلاصه
         */
        timestamp: item.createdAt
          ? new Date(item.createdAt).getTime()
          : Date.now(),

        /*
         * نتیجه کامل تحلیل
         */
        result: parsedResult,
        parsedResult,
      };
    });

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

/**
 * GET /api/v1/analysis-history/:id
 *
 * دریافت تحلیل کامل.
 */
const getAnalysisById = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'احراز هویت لازم است',
      });
    }

    const id = toInt(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'شناسه تحلیل نامعتبر است',
      });
    }

    const item = await prisma.analysisHistory.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'تحلیل یافت نشد',
      });
    }

    const parsedResult = safeParseResultJson(item.resultJson);

    return res.json({
      success: true,

      data: {
        ...item,

        symbol: item.stock,

        timestamp: item.createdAt
          ? new Date(item.createdAt).getTime()
          : Date.now(),

        /*
         * هر دو نام برای سازگاری:
         */
        result: parsedResult,
        parsedResult,
      },

      /*
       * برای کلاینت‌هایی که مستقیماً دنبال این فیلد هستند.
       */
      result: parsedResult,
      parsedResult,
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

/**
 * DELETE /api/v1/analysis-history/:id
 */
const deleteAnalysis = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'احراز هویت لازم است',
      });
    }

    const id = toInt(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'شناسه تحلیل نامعتبر است',
      });
    }

    const existing = await prisma.analysisHistory.findFirst({
      where: {
        id,
        userId,
      },
      select: {
        id: true,
        stock: true,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'تحلیل یافت نشد',
      });
    }

    await prisma.analysisHistory.delete({
      where: {
        id,
      },
    });

    return res.json({
      success: true,
      message: 'تحلیل حذف شد',
      data: {
        id: existing.id,
        stock: existing.stock,
        symbol: existing.stock,
      },
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

/**
 * DELETE /api/v1/analysis-history/clear
 */
const clearHistory = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'احراز هویت لازم است',
      });
    }

    const result = await prisma.analysisHistory.deleteMany({
      where: {
        userId,
      },
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

/**
 * GET /api/v1/analysis-history/usage
 */
const getHistoryStats = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'احراز هویت لازم است',
      });
    }

    const items = await prisma.analysisHistory.findMany({
      where: {
        userId,
      },
      select: {
        stock: true,
        resultJson: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: MAX_HISTORY_ITEMS,
    });

    let buyCount = 0;
    let sellCount = 0;
    let holdCount = 0;

    for (const item of items) {
      const parsed = safeParseResultJson(item.resultJson);
      const recommendation = String(
        parsed?.recommendation || ''
      ).toLowerCase();

      if (
        recommendation === 'خرید' ||
        recommendation === 'buy'
      ) {
        buyCount++;
      } else if (
        recommendation === 'فروش' ||
        recommendation === 'sell'
      ) {
        sellCount++;
      } else if (
        recommendation === 'نگهداری' ||
        recommendation === 'hold'
      ) {
        holdCount++;
      }
    }

    return res.json({
      success: true,
      data: {
        total: items.length,
        buyCount,
        sellCount,
        holdCount,
        uniqueSymbols: [
          ...new Set(
            items
              .map((item) => item.stock)
              .filter(Boolean)
          ),
        ],
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