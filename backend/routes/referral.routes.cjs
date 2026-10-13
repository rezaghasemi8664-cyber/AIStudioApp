'use strict';

const express = require('express');
const router = express.Router();
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;
const smsService = require('../services/sms/sms.service.cjs');
const smsConfig = require('../config/sms.config.cjs');

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

function generateReferralCode() {
  const crypto = require('crypto');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
}

async function ensureReferralCode(userId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
    if (!user) throw new Error('کاربر یافت نشد');
    if (/^[A-Z0-9]{8}$/.test(String(user.referralCode || ''))) return user.referralCode;
    const code = generateReferralCode();
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { referralCode: code }, select: { referralCode: true } });
      return updated.referralCode;
    } catch (error) {
      if (error.code !== 'P2002') throw error;
    }
  }
  throw new Error('ساخت کد معرف ناموفق بود');
}

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'شناسه کاربر نامعتبر است' });
    const referralCode = await ensureReferralCode(userId);
    const invitationsSent = await prisma.referralInvite.count({ where: { inviterId: userId } });
    const successfulInvites = await prisma.referralInvite.count({ where: { inviterId: userId, status: 'REDEEMED' } });
    return res.json({ success: true, data: { referralCode, invitationsSent, successfulInvites, rewardDays: 5 } });
  } catch (error) {
    console.error('[REFERRAL] GET /me failed:', error.message);
    return res.status(500).json({ success: false, message: 'دریافت اطلاعات دعوت از دوستان ناموفق بود' });
  }
});

router.post('/send', authMiddleware, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'شناسه کاربر نامعتبر است' });
    if (!smsConfig.pattern.referral) {
      return res.status(503).json({ success: false, message: 'پترن پیامک کد معرف در تنظیمات فراز اس‌ام‌اس ثبت نشده است' });
    }

    let mobile;
    try { mobile = smsService.normalizeMobile(req.body?.mobile); }
    catch (_) { return res.status(400).json({ success: false, message: 'شماره موبایل معتبر نیست' }); }

    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mobile: true, phone: true, referralCode: true },
    });
    if (!inviter) return res.status(404).json({ success: false, message: 'کاربر دعوت‌کننده یافت نشد' });
    if ([inviter.mobile, inviter.phone].filter(Boolean).some((value) => {
      try { return smsService.normalizeMobile(value) === mobile; } catch (_) { return false; }
    })) {
      return res.status(400).json({ success: false, message: 'نمی‌توانید شماره موبایل خودتان را دعوت کنید' });
    }

    const registered = await prisma.user.findFirst({
      where: { OR: [{ mobile }, { phone: mobile }], isDeleted: false },
      select: { id: true },
    });
    if (registered) return res.status(409).json({ success: false, message: 'این شماره موبایل قبلاً ثبت‌نام کرده است' });

    const existingInvite = await prisma.referralInvite.findUnique({
      where: { inviterId_inviteeMobile: { inviterId: userId, inviteeMobile: mobile } },
    });
    if (existingInvite?.status === 'REDEEMED') {
      return res.status(409).json({ success: false, message: 'برای این شماره قبلاً هدیه ثبت شده است' });
    }

    const referralCode = await ensureReferralCode(userId);
    await smsService.sendPattern({
      userId,
      mobile,
      patternCode: smsConfig.pattern.referral,
      attributes: { code: referralCode },
      messageType: 'referral_invite',
    });

    await prisma.referralInvite.upsert({
      where: { inviterId_inviteeMobile: { inviterId: userId, inviteeMobile: mobile } },
      create: { inviterId: userId, inviteeMobile: mobile, referralCode, status: 'SENT' },
      update: { referralCode, status: 'SENT', redeemedByUserId: null, redeemedAt: null, createdAt: new Date() },
    });

    return res.json({ success: true, message: 'کد معرف با موفقیت پیامک شد', data: { mobile, referralCode } });
  } catch (error) {
    console.error('[REFERRAL] send failed:', error.message);
    return res.status(502).json({ success: false, message: 'ارسال پیامک کد معرف ناموفق بود؛ پترن و سرویس فراز اس‌ام‌اس را بررسی کنید' });
  }
});

module.exports = router;
