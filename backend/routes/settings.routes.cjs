// routes/settings.routes.cjs
const express = require('express');
const router = express.Router();

const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middlewares/auth.middleware.cjs');

// تلاش برای استفاده از Prisma مشترک پروژه (در صورت وجود)
let prisma;
try {
  // اگر در پروژه‌ات مسیر دیگری دارد، همین require را مطابق پروژه اصلاح کن
  prisma = require('../lib/prisma.cjs');
  if (!prisma || typeof prisma !== 'object') throw new Error('Invalid shared prisma export');
} catch (_) {
  prisma = new PrismaClient();
}

const globalSettingsController = require('../controllers/globalSettings.controller.cjs');

// اگر middleware ادمین دارید، فعال کنید:
// const requireAdmin = require('../middlewares/requireAdmin.middleware.cjs');

const VALID_KEYS = ['theme', 'language', 'notifications', 'guest_user_validity_days'];

/**
 * async wrapper برای جلوگیری از unhandled rejection در route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * اطمینان از اینکه callback معتبر به Express می‌دهیم.
 * اگر handler وجود نداشت، route هنگام mount کرش نمی‌کند و پاسخ 501 می‌دهد.
 */
function safeControllerHandler(fn, name = 'unknownHandler') {
  if (typeof fn === 'function') {
    return asyncHandler(fn);
  }

  return (req, res) => {
    console.error(`[SettingsRoutes] Controller handler is missing or invalid: ${name}`);
    return res.status(501).json({
      success: false,
      message: `Handler "${name}" پیاده‌سازی نشده یا export آن نادرست است`,
      code: 'HANDLER_NOT_IMPLEMENTED'
    });
  };
}

/**
 * استخراج userId از req.user
 */
function getUserId(req) {
  const userId = req?.user?.id ?? req?.user?.userId;
  const n = Number(userId);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * نرمال‌سازی بولین برای فیلد notifications
 */
function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'off'].includes(v)) return false;
  }
  return null;
}

// ===============================
// Global Settings (MUST be before '/:key')
// ===============================

// GET /api/settings/global
router.get(
  '/global',
  authMiddleware,
  // اگر لازم است requireAdmin اضافه کنید:
  // requireAdmin,
  safeControllerHandler(
    globalSettingsController && globalSettingsController.getAllGlobalSettings,
    'globalSettingsController.getAllGlobalSettings'
  )
);

// PUT /api/settings/global
router.put(
  '/global',
  authMiddleware,
  // اگر لازم است requireAdmin اضافه کنید:
  // requireAdmin,
  safeControllerHandler(
    globalSettingsController && globalSettingsController.updateGlobalSettings,
    'globalSettingsController.updateGlobalSettings'
  )
);

// ===============================
// User Settings
// ===============================

// GET /api/settings
router.get(
  '/',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'کاربر احراز هویت نشده است',
        code: 'UNAUTHORIZED_USER'
      });
    }

    let settings = await prisma.userSettings.findFirst({
      where: { userId }
    });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId,
          theme: 'light',
          language: 'fa',
          notifications: true,
          guest_user_validity_days: 7
        }
      });
    }

    return res.json({
      success: true,
      data: settings
    });
  })
);

// PUT /api/settings
router.put(
  '/',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'کاربر احراز هویت نشده است',
        code: 'UNAUTHORIZED_USER'
      });
    }

    const { theme, language, notifications, guest_user_validity_days } = req.body || {};
    const updateData = {};

    if (theme !== undefined) {
      updateData.theme = String(theme).trim();
    }

    if (language !== undefined) {
      updateData.language = String(language).trim();
    }

    if (notifications !== undefined) {
      const parsed = parseBoolean(notifications);
      if (parsed === null) {
        return res.status(400).json({
          success: false,
          message: 'مقدار notifications نامعتبر است (boolean مورد انتظار است)'
        });
      }
      updateData.notifications = parsed;
    }

    if (guest_user_validity_days !== undefined) {
      const days = Number(guest_user_validity_days);
      if (!Number.isFinite(days) || days < 1) {
        return res.status(400).json({
          success: false,
          message: 'guest_user_validity_days باید عددی بزرگ‌تر یا مساوی 1 باشد'
        });
      }
      updateData.guest_user_validity_days = Math.floor(days);
    }

    let settings = await prisma.userSettings.findFirst({
      where: { userId }
    });

    if (settings) {
      settings = await prisma.userSettings.update({
        where: { id: settings.id },
        data: updateData
      });
    } else {
      settings = await prisma.userSettings.create({
        data: {
          userId,
          theme: theme !== undefined ? String(theme).trim() : 'light',
          language: language !== undefined ? String(language).trim() : 'fa',
          notifications:
            notifications !== undefined ? parseBoolean(notifications) ?? true : true,
          guest_user_validity_days:
            guest_user_validity_days !== undefined
              ? Math.max(1, Math.floor(Number(guest_user_validity_days)))
              : 7
        }
      });
    }

    return res.json({
      success: true,
      message: 'تنظیمات با موفقیت ذخیره شد',
      data: settings
    });
  })
);

// GET /api/settings/:key
router.get(
  '/:key',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'کاربر احراز هویت نشده است',
        code: 'UNAUTHORIZED_USER'
      });
    }

    const { key } = req.params;

    if (!VALID_KEYS.includes(key)) {
      return res.status(400).json({
        success: false,
        message: `کلید "${key}" معتبر نیست. کلیدهای معتبر: ${VALID_KEYS.join(', ')}`
      });
    }

    const settings = await prisma.userSettings.findFirst({
      where: { userId }
    });

    if (!settings) {
      return res.json({
        success: true,
        data: { key, value: null }
      });
    }

    return res.json({
      success: true,
      data: {
        key,
        value: settings[key]
      }
    });
  })
);

module.exports = router;
