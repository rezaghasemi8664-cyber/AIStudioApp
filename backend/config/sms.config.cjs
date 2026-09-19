"use strict";

module.exports = {
  provider: process.env.SMS_PROVIDER || "farazsms",
  pattern: {
    initialPassword: process.env.FARAZSMS_INITIAL_PASSWORD_PATTERN || "uAUi9KUJPh",
    otp: process.env.FARAZSMS_OTP_PATTERN || "WZ21k7HUZW",
    notification: process.env.FARAZSMS_NOTIFICATION_PATTERN || "",
  },
  sender: process.env.FARAZSMS_LINE_NUMBER || "90008361",
  timeoutMs: Number(process.env.FARAZSMS_TIMEOUT_MS || 10000),
  otp: {
    ttlMinutes: Number(process.env.SMS_OTP_TTL_MINUTES || 5),
    maxAttempts: Number(process.env.SMS_OTP_MAX_ATTEMPTS || 5),
    resendCooldownSeconds: Number(process.env.SMS_OTP_RESEND_COOLDOWN_SECONDS || 60),
  },
};
