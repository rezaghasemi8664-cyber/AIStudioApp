'use strict';

const express = require('express');
const router = express.Router();
const smsService = require('../services/sms/sms.service.cjs');

const ALLOWED_PURPOSES = new Set(['login', 'reset-password']);

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

    if (!mobile || !code) {
      return res.status(400).json({
        success: false,
        message: 'شماره موبایل و کد تأیید الزامی است',
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

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error?.message || 'کد تأیید نامعتبر است',
    });
  }
});

module.exports = router;
