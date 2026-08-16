'use strict';

const db = require('../services/db.service.cjs');

function getUserId(req) {
  return req.user?.id || req.user?.userId || null;
}

/**
 * دریافت تمام تنظیمات کاربر
 */
exports.getUserPreferences = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'کاربر احراز هویت نشد',
      });
    }

    const preferences = await db.userPreference.findMany({
      where: { userId },
      orderBy: { key: 'asc' },
    });

    return res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    console.error('getUserPreferences error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت تنظیمات کاربر',
    });
  }
};

/**
 * دریافت یک تنظیم کاربر بر اساس کلید
 */
exports.getUserPreference = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { key } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'کاربر احراز هویت نشد',
      });
    }

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'کلید تنظیمات الزامی است',
      });
    }

    const preference = await db.userPreference.findFirst({
      where: { userId, key },
    });

    return res.json({
      success: true,
      data: preference || null,
    });
  } catch (error) {
    console.error('getUserPreference error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت تنظیم کاربر',
    });
  }
};

/**
 * ذخیره یا بروزرسانی یک تنظیم کاربر
 */
exports.upsertUserPreference = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { key } = req.params;
    const { value } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'کاربر احراز هویت نشد',
      });
    }

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'کلید تنظیمات الزامی است',
      });
    }

    const preference = await db.userPreference.upsert({
      where: {
        userId_key: {
          userId,
          key,
        },
      },
      update: {
        value,
      },
      create: {
        userId,
        key,
        value,
      },
    });

    return res.json({
      success: true,
      data: preference,
      message: 'تنظیم کاربر با موفقیت ذخیره شد',
    });
  } catch (error) {
    console.error('upsertUserPreference error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در ذخیره تنظیم کاربر',
    });
  }
};

/**
 * ذخیره دسته‌ای تنظیمات کاربر
 */
exports.bulkUpsertUserPreferences = async (req, res) => {
  try {
    const userId = getUserId(req);
    const items = Array.isArray(req.body) ? req.body : req.body?.items || [];

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'کاربر احراز هویت نشد',
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'لیست تنظیمات نامعتبر است',
      });
    }

    const validItems = items.filter(item => item && typeof item.key === 'string' && item.key.trim() !== '');

    if (validItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'هیچ تنظیم معتبری برای ذخیره وجود ندارد',
      });
    }

    const results = [];

    for (const item of validItems) {
      const preference = await db.userPreference.upsert({
        where: {
          userId_key: {
            userId,
            key: item.key,
          },
        },
        update: {
          value: item.value,
        },
        create: {
          userId,
          key: item.key,
          value: item.value,
        },
      });

      results.push(preference);
    }

    return res.json({
      success: true,
      data: results,
      message: 'تنظیمات کاربر با موفقیت ذخیره شدند',
    });
  } catch (error) {
    console.error('bulkUpsertUserPreferences error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در ذخیره گروهی تنظیمات کاربر',
    });
  }
};

/**
 * حذف یک تنظیم کاربر
 */
exports.deleteUserPreference = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { key } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'کاربر احراز هویت نشد',
      });
    }

    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'کلید تنظیمات الزامی است',
      });
    }

    const existing = await db.userPreference.findFirst({
      where: { userId, key },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'تنظیم موردنظر یافت نشد',
      });
    }

    await db.userPreference.delete({
      where: {
        userId_key: {
          userId,
          key,
        },
      },
    });

    return res.json({
      success: true,
      message: 'تنظیم کاربر با موفقیت حذف شد',
    });
  } catch (error) {
    console.error('deleteUserPreference error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در حذف تنظیم کاربر',
    });
  }
};

/**
 * دریافت endpointهای مربوط به featureهای فرانت‌اند
 * مثال:
 * GET /api/v1/user-preference/feature-endpoints?feature=marketIndex
 */
exports.getFeatureEndpoints = async (req, res) => {
  try {
    const { feature } = req.query;

    const endpointMap = {
      marketIndex: {
        summary: '/api/v1/market/summary',
        history: '/api/v1/market-history',
      },
      marketSummary: {
        summary: '/api/v1/market-summary',
      },
      scalping: {
        signals: '/api/v1/scalping',
      },
      messages: {
        unreadCount: '/api/v1/messages/unread-count',
      },
      profile: {
        me: '/api/v1/profile',
      },
    };

    const data = feature ? (endpointMap[feature] || {}) : endpointMap;

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('getFeatureEndpoints error:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت endpointهای feature',
    });
  }
};
