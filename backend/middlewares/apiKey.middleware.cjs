"use strict";

const apiKeyService = require("../services/apiKey.service.cjs");
const usageService = require("../services/usage.service.cjs");

/**
 * API Key Middleware
 * - Stateless
 * - No next(err)
 * - Dev & Prod safe
 * - Frontend-friendly
 */
module.exports = async function apiKeyMiddleware(req, res, next) {
  try {
    /* ===================== BASIC GUARDS ===================== */

    if (!req || !res || typeof res.status !== "function") {
      console.error("[API_KEY_MIDDLEWARE] Invalid HTTP context");
      return;
    }

    const path = req.path || "";
    const method = req.method || "GET";

    /* ===================== ALWAYS ALLOW ===================== */

    // ? CORS preflight
    if (method === "OPTIONS") {
      return next();
    }

    // ? Auth routes
    if (path.startsWith("/auth/")) {
      return next();
    }

    // ? Health / root
    if (path === "/" || path === "/health") {
      return next();
    }

    /* ===================== DEV MODE BYPASS ===================== */

    if (process.env.NODE_ENV !== "production") {
      // ? Allow frontend essential APIs in dev
      const devAllowed = [
        "/analyze",
        "/theme",
        "/ui",
        "/ui-config",
        "/market",
      ];

      if (devAllowed.some((p) => path.startsWith(p))) {
        return next();
      }
    }

    /* ===================== READ API KEY ===================== */

    // ? Express normalizes headers to lowercase
    const key = req.headers["x-api-key"];

    if (typeof key !== "string" || !key.trim()) {
      return res.status(401).json({
        ok: false,
        error: "API key missing",
      });
    }

    /* ===================== MASTER KEY ===================== */

    const masterKey = process.env.MASTER_API_KEY;
    if (masterKey && key === masterKey) {
      req.apiKey = {
        id: "master",
        name: "MASTER_KEY",
        role: "SYSTEM",
      };
      return next();
    }

    /* ===================== DB VALIDATION ===================== */

    const apiKey = await apiKeyService.findKeyByValue(key.trim());

    if (!apiKey) {
      return res.status(403).json({
        ok: false,
        error: "Invalid API key",
      });
    }

    if (apiKey.isRevoked) {
      return res.status(403).json({
        ok: false,
        error: "API key revoked",
      });
    }

    /* ===================== USAGE LIMIT ===================== */

    const usage = await usageService.checkLimit(apiKey.id);

    if (!usage || usage.allowed !== true) {
      return res.status(429).json({
        ok: false,
        error: "Daily usage limit exceeded",
        count: usage?.count ?? 0,
      });
    }

    /* ===================== ATTACH API KEY ===================== */

    req.apiKey = apiKey;

    // ? Safe usage increment (after response)
    res.on("finish", () => {
      if (res.statusCode < 500) {
        usageService.increase(apiKey.id).catch((err) => {
          console.warn(
            "[API_KEY_USAGE_INCREASE_FAILED]",
            err?.message
          );
        });
      }
    });

    return next();
  } catch (err) {
    /* ===================== HARD FAIL SAFE ===================== */

    console.error("[API_KEY_MIDDLEWARE_ERROR]", err);

    if (res.headersSent) return;

    return res.status(500).json({
      ok: false,
      error: "API key validation failed",
    });
  }
};
