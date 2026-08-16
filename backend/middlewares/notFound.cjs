"use strict";

const logger = require("../services/logger.service.cjs");

module.exports = function notFound(req, res) {
  const traceId =
    req?.traceId ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!req || !res || typeof res.status !== "function") {
    return;
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  if (res.headersSent) {
    return;
  }

  const path = req.originalUrl || req.url || "unknown";

  console.warn('Route not found:', req.method, req.path);

  if (path.startsWith("/api/")) {
    return res.status(404).json({
      ok: false,
      error: "Route not found",
      error_code: "ROUTE_NOT_FOUND",
      path,
      traceId,
    });
  }

  return res.status(404).send("Not Found");
};
