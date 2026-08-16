"use strict";

const logger = require("../services/logger.service.cjs");

module.exports = function errorHandler(err, req, res, next) {
  const traceId =
    req?.traceId ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  logger.error("global:errorHandler", {
    traceId,
    path: req?.originalUrl,
    method: req?.method,
    userId: req?.user?.id,
    message: err?.message,
    error_code: err?.error_code,
    stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
  });

  if (!res || typeof res.status !== "function") {
    return;
  }

  if (res.headersSent) {
    return;
  }

  const status =
    Number(err?.status) >= 400 && Number(err?.status) < 600
      ? Number(err.status)
      : 500;

  const errorCode =
    err?.error_code ||
    (status === 401
      ? "UNAUTHORIZED"
      : status === 403
      ? "FORBIDDEN"
      : status === 404
      ? "NOT_FOUND"
      : "INTERNAL_SERVER_ERROR");

  return res.status(status).json({
    ok: false,
    error: err?.publicMessage || err?.message || "internal server error",
    error_code: errorCode,
    traceId,
  });
};
