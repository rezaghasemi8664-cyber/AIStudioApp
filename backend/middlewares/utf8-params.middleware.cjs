// middleware/utf8-params.middleware.cjs
'use strict';

/**
 * Middleware to ensure URL params containing Persian text
 * are properly decoded as UTF-8
 */
function ensureUtf8Params(req, res, next) {
  // Express already decodes URI params, but let's verify
  if (req.params) {
    Object.keys(req.params).forEach(function(key) {
      var val = req.params[key];
      if (typeof val === 'string') {
        try {
          // Try to decode if it's percent-encoded
          req.params[key] = decodeURIComponent(val);
        } catch (_e) {
          // Already decoded or invalid encoding - keep as-is
        }
      }
    });
  }
  
  // Also check query params
  if (req.query) {
    Object.keys(req.query).forEach(function(key) {
      var val = req.query[key];
      if (typeof val === 'string') {
        try {
          // Detect double-encoding
          if (val.indexOf('%25') !== -1) {
            req.query[key] = decodeURIComponent(val);
          }
        } catch (_e) {
          // keep as-is
        }
      }
    });
  }
  
  next();
}

module.exports = ensureUtf8Params;
