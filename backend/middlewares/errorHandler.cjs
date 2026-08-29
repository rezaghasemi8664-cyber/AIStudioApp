"use strict";

const logger = require("../services/logger.service.cjs");

function isValidHttpStatus(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 400 && n < 600;
}

function detectHttpStatus(err) {
  const directStatus =
    err?.status ??
    err?.statusCode ??
    err?.httpStatus ??
    err?.response?.status;

  if (isValidHttpStatus(directStatus)) return Number(directStatus);

  const message = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toUpperCase();
  const errorCode = String(err?.error_code || "").toUpperCase();

  // Network / BRS / timeout => 503
  if (
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("network error") ||
    message.includes("could not connect") ||
    message.includes("service unavailable") ||
    message.includes("brs service unavailable") ||
    message.includes("brs service error")
  ) {
    return 503;
  }

  // Prisma / DB-ish errors
  if (
    code.startsWith("P") ||
    message.includes("prisma") ||
    message.includes("database") ||
    message.includes("db ")
  ) {
    if (code === "P2002") return 409; // unique constraint
    if (code === "P2025") return 404; // record not found
    return 500;
  }

  // Explicit app error codes
  if (errorCode === "NOT_FOUND") return 404;
  if (errorCode === "FORBIDDEN") return 403;
  if (errorCode === "UNAUTHORIZED") return 401;
  if (errorCode === "SERVICE_UNAVAILABLE") return 503;

  return 500;
}

function detectErrorCode(status, err) {
  if (err?.error_code) return err.error_code;

  const code = String(err?.code || "").toUpperCase();

  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 503) return "SERVICE_UNAVAILABLE";

  if (code === "P2002") return "CONFLICT";
  if (code === "P2025") return "NOT_FOUND";

  return "INTERNAL_SERVER_ERROR";
}

function buildPublicMessage(status, err) {
  if (err?.publicMessage) return err.publicMessage;

  const message = String(err?.message || "");

  if (status === 503) {
    return "service temporarily unavailable";
  }

  if (status === 409) {
    return "conflict";
  }

  if (status === 404) {
    return "not found";
  }

  if (status === 401) {
    return "unauthorized";
  }

  if (status === 403) {
    return "forbidden";
  }

  return message || "internal server error";
}

module.exports = function errorHandler(err, req, res, next) {
  const traceId =
    req?.traceId ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const status = detectHttpStatus(err);
  const errorCode = detectErrorCode(status, err);

  logger.error("global:errorHandler", {
    traceId,
    path: req?.originalUrl,
    method: req?.method,
    userId: req?.user?.id,
    status,
    message: err?.message,
    error_code: err?.error_code,
    code: err?.code,
    stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
  });

  if (!res || typeof res.status !== "function") {
    return;
  }

  if (res.headersSent) {
    return;
  }

  return res.status(status).json({
    ok: false,
    error: buildPublicMessage(status, err),
    error_code: errorCode,
    traceId,
  });
};
