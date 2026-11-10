'use strict';

const express = require('express');
const router = express.Router();
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;
const telegramBotApi = require('../services/telegramBotApi.service.cjs');

let authMiddleware;
for (const candidate of ['../middlewares/auth.middleware.cjs', '../middleware/auth.middleware.cjs', '../middleware/auth.cjs']) {
  try {
    const mod = require(candidate);
    authMiddleware = mod.authenticate || mod.authMiddleware || mod.verifyToken || mod;
    if (typeof authMiddleware === 'function') break;
    authMiddleware = null;
  } catch (_) {}
}
if (typeof authMiddleware !== 'function') {
  authMiddleware = (_req, res) => res.status(401).json({ success: false, message: 'احراز هویت الزامی است' });
}

function getUserId(req) {
  const raw = req.user?.id ?? req.user?.userId ?? req.user?.sub;
  return /^\\d+$/.test(String(raw ?? '')) ? Number(raw) : null;
}

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'شناسه کاربر نامعتبر است' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, isDeleted: true }
    });
    if (!user || !user.isActive || user.isDeleted) {
      return res.status(403).json({ success: false, message: 'حساب کاربری فعال نیست' });
    }

    const config = telegramBotApi.getTelegramConfig();
    if (!config.token || !config.chatId) {
      return res.status(503).json({ success: false, code: 'TELEGRAM_NOT_CONFIGURED', message: 'تنظیمات ربات تلگرام کامل نیست' });
    }

    let link = await prisma.telegramReferralLink.findFirst({
      where: { inviterId: userId, channelId: config.chatId, isActive: true },
      orderBy: { createdAt: 'desc' }
    });

    if (!link) {
      const created = await telegramBotApi.createTelegramInviteLink({ inviterId: userId });
      link = await prisma.telegramReferralLink.create({
        data: {
          inviterId: userId,
          channelId: created.channelId,
          inviteLink: created.inviteLink,
          inviteName: created.inviteName,
          isActive: true,
          createdAt: created.createdAt
        }
      });
    }

    return res.json({
      success: true,
      data: {
        inviteLink: link.inviteLink,
        channelId: link.channelId,
        createdAt: link.createdAt
      }
    });
  } catch (error) {
    console.error('[TELEGRAM_REFERRAL] GET /me failed:', {
      code: error?.code || 'UNKNOWN',
      message: String(error?.message || 'Unknown error').slice(0, 180)
    });
    const status = error?.code === 'TELEGRAM_NOT_CONFIGURED' ? 503 : 502;
    return res.status(status).json({
      success: false,
      code: error?.code || 'TELEGRAM_REFERRAL_LINK_FAILED',
      message: 'ساخت لینک اختصاصی دعوت تلگرام ناموفق بود'
    });
  }
});

module.exports = router;
