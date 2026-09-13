'use strict';

const smsConfig = require('../../config/sms.config.cjs');

function getSmsHealth() {
  const apiKeyConfigured = Boolean(process.env.FARAZSMS_API_KEY);
  const provider = smsConfig.provider;
  const senderConfigured = Boolean(smsConfig.sender);
  const initialPasswordPatternConfigured = Boolean(smsConfig.pattern.initialPassword);
  const otpPatternConfigured = Boolean(smsConfig.pattern.otp);

  return {
    provider,
    apiKeyConfigured,
    senderConfigured,
    initialPasswordPatternConfigured,
    otpPatternConfigured,
    readyForInitialPassword: apiKeyConfigured && senderConfigured && initialPasswordPatternConfigured,
    readyForOtp: apiKeyConfigured && senderConfigured && otpPatternConfigured,
  };
}

module.exports = { getSmsHealth };
