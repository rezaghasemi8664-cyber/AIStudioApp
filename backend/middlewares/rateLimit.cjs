"use strict";

const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown",
  skip: (req) => {
    if (!req || req.method === "OPTIONS") return true;
    const path = req.path || "";
    return path.startsWith("/auth/") || path === "/health";
  },
  handler: (req, res) => {
    if (!res || typeof res.status !== "function" || res.headersSent) return;
    console.warn("[RATE_LIMIT]", req.ip, req.originalUrl);
    return res.status(429).json({
      ok: false,
      success: false,
      error: "Too many requests, please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
    });
  },
});

module.exports = limiter;
