'use strict';

const express = require('express');
const router = express.Router();
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;
const telegramBotApi = require('../services/telegramBotApi.service.cjs');
const telegramReferralService = require('../services/telegramReferral.service.cjs');

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
  return /^\d+$/.test(String(raw ?? '')) ? Number(raw) : null;
}

// Telegram calls this endpoint; it intentionally does not use the normal user-auth middleware.
// Configure Telegram's webhook secret_token with TELEGRAM_WEBHOOK_SECRET.
router.post('/webhook', async (req, res) => {
  const expectedSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '');
  const receivedSecret = req.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!expectedSecret) {
    return res.status(503).json({ success: false, code: 'TELEGRAM_WEBHOOK_SECRET_MISSING' });
  }
  if (!telegramReferralService.safeSecretEquals(receivedSecret, expectedSecret)) {
    return res.status(401).json({ success: false, code: 'TELEGRAM_WEBHOOK_UNAUTHORIZED' });
  }

  // Optional second trust boundary: when configured, only the Cloudflare
  // Worker may relay Telegram updates to this endpoint.
  const expectedRelaySecret = String(process.env.TELEGRAM_WEBHOOK_RELAY_SECRET || '');
  if (!expectedRelaySecret) {
    return res.status(503).json({ success: false, code: 'TELEGRAM_WEBHOOK_RELAY_SECRET_MISSING' });
  }
  if (!telegramReferralService.safeSecretEquals(
    req.get('X-Roniya-Webhook-Relay-Key') || '',
    expectedRelaySecret
  )) {
    return res.status(401).json({ success: false, code: 'TELEGRAM_WEBHOOK_RELAY_UNAUTHORIZED' });
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ success: false, code: 'TELEGRAM_UPDATE_INVALID' });
  }

  try {
    const result = await telegramReferralService.processTelegramUpdate(req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error?.code === 'P2002') {
      // Telegram may redeliver an update, or a user may rejoin using a different update_id.
      return res.status(200).json({ success: true, duplicate: true, counted: false });
    }
    console.error('[TELEGRAM_REFERRAL] webhook processing failed:', {
      code: String(error?.code || 'UNKNOWN').slice(0, 80),
      updateId: Number.isSafeInteger(req.body?.update_id) ? req.body.update_id : null,
    });
    return res.status(500).json({ success: false, code: 'TELEGRAM_WEBHOOK_PROCESSING_FAILED' });
  }
});

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
      try {
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
      } catch (createError) {
        if (createError?.code !== 'P2002') throw createError;
        link = await prisma.telegramReferralLink.findFirst({
          where: { inviterId: userId, channelId: config.chatId, isActive: true },
          orderBy: { createdAt: 'desc' }
        });
        if (!link) throw createError;
      }
    }

    const stats = await telegramReferralService.getReferralStats(userId);
    return res.json({
      success: true,
      data: {
        inviteLink: link.inviteLink,
        channelId: link.channelId,
        createdAt: link.createdAt,
        ...stats,
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
