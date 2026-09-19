'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const smsService = require('../services/sms/sms.service.cjs');
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;
const { JWT_SECRET } = require('../config/env.cjs');

const ALLOWED_PURPOSES = new Set(['login', 'reset-password']);
const RESET_TOKEN_TTL = '10m';

function readPurpose(value) {
  const purpose = String(value || 'login').trim();
  return ALLOWED_PURPOSES.has(purpose) ? purpose : null;
}

router.post('/send', async (req, res) => {
  try {
    const mobile = String(req.body?.mobile || '').trim();
    const purpose = readPurpose(req.body?.purpose);

    if (!mobile) {
      return res.status(400).json({ success: false, message: 'شماره موبایل الزامی است' });
    }
    if (!purpose) {
      return res.status(400).json({ success: false, message: 'نوع درخواست OTP نامعتبر است' });
    }

    const result = await smsService.createAndSendOtp({ mobile, purpose });

    return res.status(200).json({
      success: true,
      data: { expiresAt: result.expiresAt },
    });
  } catch (error) {
    const status = error?.code === 'OTP_COOLDOWN' ? 429 : 400;
    return res.status(status).json({
      success: false,
      message: error?.message || 'ارسال کد تأیید ناموفق بود',
    });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const mobile = String(req.body?.mobile || '').trim();
    const code = String(req.body?.code || '').trim();
    const purpose = readPurpose(req.body?.purpose);

    if (!mobile || !/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: 'شماره موبایل و کد تأیید ۶ رقمی الزامی است',
      });
    }
    if (!purpose) {
      return res.status(400).json({ success: false, message: 'نوع درخواست OTP نامعتبر است' });
    }

    const result = await smsService.verifyOtp({ mobile, code, purpose });

    if (!result?.verified) {
      const messages = {
        expired: 'کد تأیید منقضی شده است',
        max_attempts: 'تعداد تلاش‌های مجاز برای این کد به پایان رسیده است',
        invalid_code: 'کد تأیید نادرست است',
      };
      return res.status(400).json({
        success: false,
        message: messages[result?.reason] || 'کد تأیید نامعتبر است',
        data: result,
      });
    }

    if (purpose === 'reset-password') {
      if (!JWT_SECRET) {
        console.error('[SMS OTP] JWT_SECRET is not configured');
        return res.status(500).json({
          success: false,
          message: 'تنظیمات امنیتی سرور کامل نیست',
        });
      }

      const otpRecord = await prisma.smsOtp.findUnique({
        where: { id: result.otpId },
        select: {
          id: true,
          mobile: true,
          userId: true,
          purpose: true,
          verifiedAt: true,
        },
      });

      if (!otpRecord || !otpRecord.verifiedAt || otpRecord.purpose !== 'reset-password') {
        return res.status(400).json({
          success: false,
          message: 'جلسه تأیید کد معتبر نیست',
        });
      }

      const resetToken = jwt.sign(
        {
          purpose: 'reset-password',
          otpId: otpRecord.id,
          userId: otpRecord.userId || null,
          mobile: otpRecord.mobile,
        },
        JWT_SECRET,
        { expiresIn: RESET_TOKEN_TTL }
      );

      return res.status(200).json({
        success: true,
        data: {
          verified: true,
          resetToken,
          expiresIn: 600,
        },
      });
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('[SMS OTP] verify error:', error);
    return res.status(400).json({
      success: false,
      message: error?.message || 'کد تأیید نامعتبر است',
    });
  }
});

module.exports = router;
