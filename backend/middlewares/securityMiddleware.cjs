// backend/middlewares/security.middleware.cjs
// Fixed: No longer blocks legitimate internal/localhost requests
'use strict';

const env = require('../config/env.cjs');

/**
 * SSRF Protection Middleware
 * Only blocks truly suspicious requests, not internal server calls
 */
function ssrfProtection(req, res, next) {
  // If SSRF protection is disabled, skip entirely
  if (env.SSRF_PROTECTION_ENABLED === false || env.ALLOW_LOCALHOST_REQUESTS === true) {
    return next();
  }

  // Only check if request has a URL parameter that could be exploited
  const urlParams = [
    req.body && req.body.url,
    req.body && req.body.targetUrl,
    req.body && req.body.endpoint,
    req.query && req.query.url,
    req.query && req.query.targetUrl
  ].filter(Boolean);

  // If no URL parameters in the request, it's safe
  if (urlParams.length === 0) {
    return next();
  }

  // Check each URL parameter for SSRF patterns
  for (var i = 0; i < urlParams.length; i++) {
    var urlStr = urlParams[i];
    if (typeof urlStr !== 'string') continue;

    try {
      var parsed = new URL(urlStr);
      var hostname = parsed.hostname.toLowerCase();

      // Block only if someone is trying to access internal services via URL parameter
      var blockedHosts = ['169.254.169.254', 'metadata.google.internal'];
      var isBlocked = blockedHosts.some(function(h) { return hostname === h; });

      if (isBlocked) {
        return res.status(403).json({
          success: false,
          message: 'Blocked: potential SSRF attempt',
          code: 'SSRF_BLOCKED'
        });
      }
    } catch (e) {
      // Not a valid URL, ignore
    }
  }

  next();
}

/**
 * Validate request URL - used for outgoing HTTP calls
 * Returns true if the URL is safe to call
 */
function validateRequestUrl(url) {
  if (!url || typeof url !== 'string') return false;

  // Always allow if SSRF protection is disabled
  if (env.SSRF_PROTECTION_ENABLED === false || env.ALLOW_LOCALHOST_REQUESTS === true) {
    return true;
  }

  try {
    var parsed = new URL(url);
    var hostname = parsed.hostname.toLowerCase();

    // Allow localhost/internal if configured
    if (env.ALLOW_INTERNAL_REQUESTS) {
      return true;
    }

    // Block cloud metadata endpoints
    var blocked = ['169.254.169.254', 'metadata.google.internal'];
    if (blocked.indexOf(hostname) !== -1) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  ssrfProtection: ssrfProtection,
  validateRequestUrl: validateRequestUrl
};
