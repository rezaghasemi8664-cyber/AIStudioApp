"use strict";

const crypto = require("crypto");
const { prisma } = require("../db.service.cjs");
const smsConfig = require("../../config/sms.config.cjs");
const { createProvider } = require("./sms.provider.cjs");
const farazsmsProvider = require("./providers/farazsms.provider.cjs");

const provider = createProvider(farazsmsProvider);

function normalizeMobile(mobile) {
  const value = String(mobile || "").trim().replace(/[\s-]/g, "");
  if (/^09\d{9}$/.test(value)) return value;
  if (/^989\d{9}$/.test(value)) return `0${value.slice(2)}`;
  if (/^\+989\d{9}$/.test(value)) return `0${value.slice(3)}`;
  throw new Error("Invalid mobile number");
}

function hashOtp(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

async function sendPattern({ userId = null, mobile, patternCode, attributes = {}, messageType = "notification", sender } = {}) {
  const normalizedMobile = normalizeMobile(mobile);

  const queue = await prisma.smsQueue.create({
    data: {
      userId: userId || null,
      mobile: normalizedMobile,
      patternCode: String(patternCode),
      variablesJson: JSON.stringify(attributes),
      sender: sender || smsConfig.sender,
      status: "sending",
      attempts: 1,
      startedAt: new Date(),
    },
  });

  try {
    const result = await provider.sendPattern({
      recipient: normalizedMobile,
      patternCode,
      attributes,
      sender,
    });

    await prisma.smsQueue.update({
      where: { id: queue.id },
      data: {
        status: "sent",
        sentAt: new Date(),
        providerId: result.providerId,
      },
    });

    await prisma.smsLog.create({
      data: {
        queueId: queue.id,
        userId: userId || null,
        mobile: normalizedMobile,
        patternCode: String(patternCode),
        sender: sender || smsConfig.sender,
        provider: "farazsms",
        providerId: result.providerId,
        status: "sent",
        messageType,
      },
    });

    return { ...result, queueId: queue.id };
  } catch (error) {
    await prisma.smsQueue.update({
      where: { id: queue.id },
      data: {
        status: "failed",
        lastError: String(error.message || "SMS provider error").slice(0, 1000),
      },
    });

    await prisma.smsLog.create({
      data: {
        queueId: queue.id,
        userId: userId || null,
        mobile: normalizedMobile,
        patternCode: String(patternCode),
        sender: sender || smsConfig.sender,
        provider: "farazsms",
        status: "failed",
        messageType,
        errorCode: error.code ? String(error.code) : null,
        errorMessage: String(error.message || "SMS provider error").slice(0, 1000),
      },
    });

    throw error;
  }
}

async function sendInitialPassword({ userId = null, mobile, password } = {}) {
  if (!smsConfig.pattern.initialPassword) throw new Error("Initial-password SMS pattern is not configured");
  if (!password) throw new Error("Password is required");

  return sendPattern({
    userId,
    mobile,
    patternCode: smsConfig.pattern.initialPassword,
    attributes: { password: String(password) },
    messageType: "initial_password",
  });
}

async function createAndSendOtp({ userId = null, mobile, purpose = "login" } = {}) {
  if (!smsConfig.pattern.otp) throw new Error("OTP SMS pattern is not configured");

  const normalizedMobile = normalizeMobile(mobile);
  const cooldownAt = new Date(Date.now() - smsConfig.otp.resendCooldownSeconds * 1000);
  const recent = await prisma.smsOtp.findFirst({
    where: { mobile: normalizedMobile, purpose, createdAt: { gt: cooldownAt } },
    orderBy: { createdAt: "desc" },
  });

  if (recent) {
    const error = new Error("OTP resend cooldown is active");
    error.code = "OTP_COOLDOWN";
    throw error;
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + smsConfig.otp.ttlMinutes * 60 * 1000);

  await prisma.smsOtp.updateMany({
    where: { mobile: normalizedMobile, purpose, verifiedAt: null },
    data: { expiresAt: new Date() },
  });

  const otp = await prisma.smsOtp.create({
    data: {
      userId: userId || null,
      mobile: normalizedMobile,
      codeHash: hashOtp(code),
      purpose,
      expiresAt,
      maxAttempts: smsConfig.otp.maxAttempts,
    },
  });

  try {
    await sendPattern({
      userId,
      mobile: normalizedMobile,
      patternCode: smsConfig.pattern.otp,
      attributes: { code },
      messageType: "otp",
    });
  } catch (error) {
    await prisma.smsOtp.delete({ where: { id: otp.id } }).catch(() => {});
    throw error;
  }

  return { id: otp.id, expiresAt };
}

async function verifyOtp({ mobile, code, purpose = "login" } = {}) {
  const normalizedMobile = normalizeMobile(mobile);
  const otp = await prisma.smsOtp.findFirst({
    where: { mobile: normalizedMobile, purpose, verifiedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otp || otp.expiresAt <= new Date()) return { verified: false, reason: "expired" };
  if (otp.attempts >= otp.maxAttempts) return { verified: false, reason: "max_attempts" };

  const matches = hashOtp(code) === otp.codeHash;
  if (!matches) {
    await prisma.smsOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return { verified: false, reason: "invalid_code" };
  }

  await prisma.smsOtp.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } });
  return { verified: true, otpId: otp.id };
}

module.exports = {
  normalizeMobile,
  sendPattern,
  sendInitialPassword,
  createAndSendOtp,
  verifyOtp,
};
