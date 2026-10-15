'use strict';

const express = require('express');
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule;
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const requireAdmin = require('../middlewares/requireAdmin.middleware.cjs');
const {
  getTelegramPublisherSettings,
  saveTelegramPublisherSettings,
  getTelegramPublisherHistory
} = require('../services/telegramPublisherSettings.service.cjs');

const router = express.Router();
router.use(authMiddleware, requireAdmin);

function userId(req) {
  return Number(req.user?.id ?? req.user?.userId ?? 0) || null;
}

async function audit(req, action, statusCode, details) {
  try {
    await prisma.$executeRawUnsafe(
      `IF OBJECT_ID(N'dbo.AdminAuditLog',N'U') IS NOT NULL
       INSERT INTO dbo.AdminAuditLog(adminUserId,action,moduleKey,targetId,method,path,statusCode,ipAddress,userAgent,detailsJson)
       VALUES(@p1,@p2,N'telegram-publisher',NULL,@p3,@p4,@p5,@p6,@p7,@p8)`,
      userId(req), action, req.method, req.originalUrl, statusCode,
      req.ip || null, String(req.get('user-agent') || '').slice(0, 500),
      details ? JSON.stringify(details).slice(0, 4000) : null
    );
  } catch (_) {}
}

router.get('/settings', async (req, res) => {
  try {
    return res.json({ success: true, data: await getTelegramPublisherSettings(), timezone: 'Asia/Tehran' });
  } catch (error) {
    console.error('[TelegramPublisherAdmin] Read settings failed:', error?.message || error);
    return res.status(500).json({ success: false, message: 'دریافت تنظیمات انتشار تلگرام ناموفق بود.' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const settings = await saveTelegramPublisherSettings(req.body);
    await audit(req, 'update-settings', 200, {
      updatedBy: userId(req),
      enabled: {
        valuable: settings.valuable.enabled,
        scalping: settings.scalping.enabled,
        index: settings.index.enabled,
        summary: settings.summary.enabled
      }
    });
    return res.json({ success: true, message: 'تنظیمات انتشار تلگرام ذخیره شد.', data: settings, timezone: 'Asia/Tehran' });
  } catch (error) {
    const badRequest = /نامعتبر|باید|ارسال نشده/.test(String(error?.message || ''));
    await audit(req, 'update-settings', badRequest ? 400 : 500, { error: String(error?.message || '').slice(0, 300) });
    if (badRequest) return res.status(400).json({ success: false, message: error.message });
    console.error('[TelegramPublisherAdmin] Save settings failed:', error?.message || error);
    return res.status(500).json({ success: false, message: 'ذخیره تنظیمات انتشار تلگرام ناموفق بود.' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const history = await getTelegramPublisherHistory();
    return res.json({ success: true, data: history, timezone: 'Asia/Tehran' });
  } catch (error) {
    console.error('[TelegramPublisherAdmin] Read history failed:', error?.message || error);
    return res.status(500).json({ success: false, message: 'دریافت تاریخچه انتشار تلگرام ناموفق بود.' });
  }
});

module.exports = router;
