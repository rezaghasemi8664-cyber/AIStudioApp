"use strict";

const smsConfig = require("../../../config/sms.config.cjs");

const FARAZSMS_PATTERN_URL = "https://api.iranpayamak.com/ws/v1/sms/pattern";

function normalizeRecipient(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("SMS recipient is required");

  const normalized = raw.replace(/[\s-]/g, "");
  if (/^09\d{9}$/.test(normalized)) return normalized;
  if (/^989\d{9}$/.test(normalized)) return `0${normalized.slice(2)}`;
  if (/^\+989\d{9}$/.test(normalized)) return `0${normalized.slice(3)}`;

  throw new Error("Invalid mobile number");
}

function assertConfigured() {
  if (!process.env.FARAZSMS_API_KEY) {
    throw new Error("FARAZSMS_API_KEY is not configured");
  }
}

async function sendPattern({ recipient, patternCode, attributes = {}, sender } = {}) {
  assertConfigured();

  if (!patternCode) throw new Error("FarazSMS pattern code is required");

  const body = {
    code: String(patternCode),
    attributes,
    recipient: normalizeRecipient(recipient),
    line_number: sender || smsConfig.sender,
    number_format: "english",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), smsConfig.timeoutMs);

  try {
    const response = await fetch(FARAZSMS_PATTERN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Api-Key": process.env.FARAZSMS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok || data?.status !== "success") {
      const message = data?.messages || data?.message || `FarazSMS HTTP ${response.status}`;
      const error = new Error(String(message));
      error.provider = "farazsms";
      error.statusCode = response.status;
      error.providerResponse = data;
      throw error;
    }

    return {
      provider: "farazsms",
      status: "accepted",
      providerId: data?.data != null ? String(data.data) : null,
      message: data?.messages || null,
      raw: data,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("FarazSMS request timed out");
      timeoutError.provider = "farazsms";
      timeoutError.code = "TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  name: "farazsms",
  sendPattern,
};
