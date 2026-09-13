'use strict';

const express = require('express');
const router = express.Router();
const smsConfig = require('../config/sms.config.cjs');

function getHealth() {
  const apiKeyConfigured = Boolean(String(process.env.FARAZSMS_API_KEY || '').trim());
  const senderConfigured = Boolean(String(smsConfig.sender || '').trim());
  const initialPasswordPatternConfigured = Boolean(String(smsConfig.pattern.initialPassword || '').trim());
  const otpPatternConfigured = Boolean(String(smsConfig.pattern.otp || '').trim());
  const notificationPatternConfigured = Boolean(String(smsConfig.pattern.notification || '').trim());

  return {
    provider: smsConfig.provider,
    apiKeyConfigured,
    senderConfigured,
    initialPasswordPatternConfigured,
    otpPatternConfigured,
    notificationPatternConfigured,
    initialPasswordReady: apiKeyConfigured && senderConfigured && initialPasswordPatternConfigured,
    otpReady: apiKeyConfigured && senderConfigured && otpPatternConfigured,
    notificationReady: apiKeyConfigured && senderConfigured && notificationPatternConfigured,
  };
}

router.get('/health', (_req, res) => {
  const health = getHealth();
  const ready = health.initialPasswordReady || health.otpReady || health.notificationReady;

  res.status(ready ? 200 : 503).json({
    success: ready,
    data: health,
  });
});

module.exports = router;
