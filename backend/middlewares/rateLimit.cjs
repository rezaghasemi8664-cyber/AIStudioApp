"use strict";

const rateLimit = require("express-rate-limit");

/**
 * Global API Rate Limiter (Production Safe)
 * - Proxy-aware
 * - API-only
 * - Never crashes on invalid context
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,

  /**
   * ? Proxy safe (requires app.set("trust proxy", 1))
   */
  keyGenerator: (req) => {
    return (
      req.ip ||
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      "unknown"
    );
  },

  /**
   * ? Allow health check & auth
   */
 skip: (req) => {
  // ? NEVER touch CORS preflight
  if (!req || req.method === "OPTIONS") return true;

  const path = req.path || "";
  return path.startsWith("/auth/") || path === "/health";
},




  /**
   * ? Safe handler
   */
  handler: (req, res) => {
    // Guard: non-HTTP context
    if (!res || typeof res.status !== "function") return;
    if (res.headersSent) return;

    console.warn("[RATE_LIMIT]", req.ip, req.originalUrl);

    return res.status(429).json({
      ok: false,
      error: "Too many requests, please try again later.",
    });
  },
});

module.exports = limiter;
