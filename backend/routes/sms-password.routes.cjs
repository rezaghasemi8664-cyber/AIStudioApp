'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;
const { encryptPassword } = require('../services/passwordVault.service.cjs');
const { JWT_SECRET } = require('../config/env.cjs');

router.post('/reset', async (req, res) => {
  try {
    const mobile = String(req.body?.mobile || '').trim();
    const resetToken = String(req.body?.resetToken || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!mobile || !resetToken) {
      return res.status(400).json({
        success: false,
        message: 'شماره موبایل و توکن بازیابی الزامی است',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'رمز جدید باید حداقل ۶ کاراکتر باشد',
      });
    }

    if (!JWT_SECRET) {
      console.error('[SMS PASSWORD] JWT_SECRET is not configured');
      return res.status(500).json({
        success: false,
        message: 'تنظیمات امنیتی سرور کامل نیست',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, JWT_SECRET);
    } catch (_) {
      return res.status(401).json({
        success: false,
        message: 'توکن بازیابی نامعتبر یا منقضی شده است',
      });
    }

    if (decoded?.purpose !== 'reset-password' || !decoded?.otpId || !decoded?.mobile) {
      return res.status(401).json({
        success: false,
        message: 'توکن بازیابی معتبر نیست',
      });
    }

    if (String(decoded.mobile).trim() !== mobile) {
      return res.status(401).json({
        success: false,
        message: 'شماره موبایل با توکن بازیابی مطابقت ندارد',
      });
    }

    const otpRecord = await prisma.smsOtp.findUnique({
      where: { id: Number(decoded.otpId) },
      select: {
        id: true,
        mobile: true,
        userId: true,
        purpose: true,
        verifiedAt: true,
      },
    });

    if (!otpRecord) {
      return res.status(401).json({
        success: false,
        message: 'توکن بازیابی قبلاً مصرف شده یا معتبر نیست',
      });
    }

    if (
      otpRecord.purpose !== 'reset-password' ||
      !otpRecord.verifiedAt ||
      String(otpRecord.mobile).trim() !== mobile
    ) {
      return res.status(401).json({
        success: false,
        message: 'تأیید بازیابی معتبر نیست',
      });
    }

    const verifiedAt = new Date(otpRecord.verifiedAt);
    const maxAgeMs = 10 * 60 * 1000;
    if (Date.now() - verifiedAt.getTime() > maxAgeMs) {
      await prisma.smsOtp.delete({ where: { id: otpRecord.id } }).catch(() => {});
      return res.status(401).json({
        success: false,
        message: 'توکن بازیابی منقضی شده است',
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ mobile }, { phone: mobile }],
        isDeleted: false,
      },
      select: { id: true, isActive: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'کاربری با این شماره موبایل یافت نشد',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'حساب کاربری غیرفعال است',
      });
    }

    if (otpRecord.userId && Number(otpRecord.userId) !== Number(user.id)) {
      return res.status(401).json({
        success: false,
        message: 'توکن بازیابی با حساب کاربری مطابقت ندارد',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordEncrypted: encryptPassword(newPassword),
        passwordChangedAt: new Date(),
      },
    });

    await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => {});

    // حذف رکورد OTP باعث می‌شود resetToken فقط یک بار قابل استفاده باشد.
    await prisma.smsOtp.delete({ where: { id: otpRecord.id } }).catch(() => {});

    return res.json({
      success: true,
      message: 'کلمه عبور با موفقیت تغییر کرد',
    });
  } catch (error) {
    console.error('[SMS PASSWORD] reset error:', error);
    return res.status(400).json({
      success: false,
      message: error?.message || 'تغییر کلمه عبور ناموفق بود',
    });
  }
});

module.exports = router;
