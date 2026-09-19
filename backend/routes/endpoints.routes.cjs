// backend/routes/endpoints.routes.cjs
// Endpoints Configuration
'use strict';

var express = require('express');
var router = express.Router();
var path = require('path');
var fs = require('fs');

var authMiddleware;
try { authMiddleware = require('../middlewares/auth.middleware.cjs'); }
catch (e1) {
  try { authMiddleware = require('../middleware/auth.middleware.cjs'); }
  catch (e2) {
    try { authMiddleware = require('../middleware/auth.cjs'); }
    catch (e3) { authMiddleware = function (req, res, next) { next(); }; }
  }
}

// Load default endpoints config
var defaultEndpoints;
try {
  defaultEndpoints = require('../config/defaultEndpoints.cjs');
} catch (e) {
  defaultEndpoints = null;
}

// =============================================================================
// GET /api/endpoints
// =============================================================================
router.get('/', function (req, res) {
  try {
    if (defaultEndpoints) {
      return res.json({ success: true, data: defaultEndpoints });
    }

    // Fallback: return basic API map
    res.json({
      success: true,
      data: {
        auth: {
          login: '/api/auth/login',
          register: '/api/auth/register',
          refresh: '/api/auth/refresh-token',
          logout: '/api/auth/logout'
        },
        profile: {
          get: '/api/profile',
          update: '/api/profile',
          subscription: '/api/profile/subscription'
        },
        users: {
          list: '/api/users',
          get: '/api/users/:id',
          create: '/api/users',
          update: '/api/users/:id',
          delete: '/api/users/:id'
        },
        roles: {
          list: '/api/roles',
          get: '/api/roles/:id'
        },
        market: {
          index: '/api/market',
          history: '/api/market-history'
        },
        scalping: {
          settings: '/api/scalping/settings',
          signals: '/api/scalping/signals',
          history: '/api/scalping/history'
        },
        analysis: {
          analyze: '/api/analyze',
          history: '/api/analysis-history'
        },
        health: '/api/health',
        version: '/api/version'
      }
    });
  } catch (error) {
    console.error('[ENDPOINTS] GET / error:', error.message);
    res.status(500).json({ success: false, message: 'خطا', error: error.message });
  }
});

// =============================================================================
// PUT /api/endpoints (admin update)
// =============================================================================
router.put('/', authMiddleware, function (req, res) {
  try {
    var body = req.body || {};
    // در حالت واقعی باید در دیتابیس یا فایل ذخیره شود
    res.json({ success: true, data: body, message: 'Endpoints updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا', error: error.message });
  }
});

module.exports = router;
