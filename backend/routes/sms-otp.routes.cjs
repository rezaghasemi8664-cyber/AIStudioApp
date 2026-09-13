'use strict';

const express = require('express');
const router = express.Router();
const smsService = require('../services/sms/sms.service.cjs');

router.post('/send', async (req, res) => {
  try {
    const mobile = String(req.body?.mobile || '').trim();
    const purpose = String(req.body?.purpose || 'login').trim();
    if (!mobile) return res.status(400).json({ success: false, message: 'شماره موبایل الزامی است' });
    const result = await smsService.createAndSendOtp(mobile, purpose);
    return res.status(200).json({ success: true, data: { expiresAt: result.expiresAt } });
  } catch (error) {
    const status = error?.code === 'OTP_RESEND_COOLDOWN' ? 429 : 400;
    return res.status(status).json({ success: false, message: error?.message || 'ارسال کد تأیید ناموفق بود' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const mobile = String(req.body?.mobile || '').trim();
    const code = String(req.body?.code || '').trim();
    const purpose = String(req.body?.purpose || 'login').trim();
    if (!mobile || !code) return res.status(400).json({ success: false, message: 'شماره موبایل و کد تأیید الزامی است' });
    const result = await smsService.verifyOtp(mobile, code, purpose);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error?.message || 'کد تأیید نامعتبر است' });
  }
});

module.exports = router;
