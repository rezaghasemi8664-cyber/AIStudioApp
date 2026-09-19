'use strict';

const express = require('express');
const { prisma } = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const { hasPermission } = require('../services/rbac.service.cjs');
const farazsmsAdmin = require('../services/farazsmsAdmin.service.cjs');
const farazsmsSend = require('../services/farazsmsSend.service.cjs');

const router = express.Router();

function userId(req) {
  return Number(req.user?.id ?? req.user?.userId ?? 0) || null;
}

async function requireManagePermission(req, res, next) {
  try {
    if (!userId(req) || !(await hasPermission(userId(req), 'admin.farazsms.manage'))) {
      return res.status(403).json({ success: false, message: 'مجوز مدیریت پیامک فراز اس‌ام‌اس برای شما فعال نیست.' });
    }
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, message: 'بررسی مجوز فراز اس‌ام‌اس ناموفق بود.' });
  }
}

async function audit(req, action, statusCode, details) {
  try {
    await prisma.$executeRawUnsafe(
      `IF OBJECT_ID(N'dbo.AdminAuditLog',N'U') IS NOT NULL
       INSERT INTO dbo.AdminAuditLog(adminUserId,action,moduleKey,targetId,method,path,statusCode,ipAddress,userAgent,detailsJson)
       VALUES(@p1,@p2,N'farazsms',@p3,@p4,@p5,@p6,@p7,@p8,@p9)`,
      userId(req),
      action,
      details?.targetId == null ? null : String(details.targetId),
      req.method,
      req.originalUrl,
      statusCode,
      req.ip || null,
      String(req.get('user-agent') || '').slice(0, 500),
      details ? JSON.stringify(details) : null,
    );
  } catch (_) {}
}

function handleError(res, error, fallback) {
  return res.status(error.statusCode || 502).json({ success: false, message: error.message || fallback });
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

router.use(authMiddleware, requireManagePermission);

router.get('/status', async (_req, res) => {
  res.json({ success: true, data: await farazsmsAdmin.getStatus() });
});

router.get('/account/balance', async (_req, res) => {
  try { return res.json({ success: true, data: await farazsmsAdmin.getBalance() }); }
  catch (error) { return handleError(res, error, 'دریافت اعتبار فراز اس‌ام‌اس ناموفق بود.'); }
});

router.get('/account/profile', async (_req, res) => {
  try { return res.json({ success: true, data: await farazsmsAdmin.getProfile() }); }
  catch (error) { return handleError(res, error, 'دریافت اطلاعات حساب فراز اس‌ام‌اس ناموفق بود.'); }
});

router.get('/history', async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 1000000);
    const limit = parsePositiveInt(req.query.limit, 20, 100);
    const phone = String(req.query.phone || '').trim().slice(0, 30);
    const status = String(req.query.status || '').trim().slice(0, 20);
    const messageType = String(req.query.messageType || '').trim().slice(0, 50);

    const where = {};
    if (phone) where.mobile = { contains: phone };
    if (status) where.status = status;
    if (messageType) where.messageType = messageType;

    const [total, items] = await prisma.$transaction([
      prisma.smsLog.count({ where }),
      prisma.smsLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          mobile: true,
          status: true,
          providerId: true,
          messageType: true,
          errorCode: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
    ]);

    return res.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
    });
  } catch (error) {
    return handleError(res, error, 'دریافت تاریخچه پیامک‌های فراز اس‌ام‌اس ناموفق بود.');
  }
});

router.post('/send-simple', async (req, res) => {
  try {
    const result = await farazsmsSend.sendSimple(req.body || {});
    await audit(req, 'send-simple', 200, {
      recipientCount: Array.isArray(req.body?.recipients) ? req.body.recipients.length : 1,
      providerId: result?.providerId || null,
      textLength: String(req.body?.text || '').trim().length,
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    await audit(req, 'send-simple', error.statusCode || 502, { error: error.message });
    return handleError(res, error, 'ارسال پیامک ساده ناموفق بود.');
  }
});

router.post('/send-pattern', async (req, res) => {
  try {
    const result = await farazsmsSend.sendPattern(req.body || {});
    await audit(req, 'send-pattern', 200, { providerId: result?.providerId || null });
    return res.json({ success: true, data: result });
  } catch (error) {
    await audit(req, 'send-pattern', error.statusCode || 502, { error: error.message });
    return handleError(res, error, 'ارسال پیامک الگویی ناموفق بود.');
  }
});

module.exports = router;
