// backend/config/env.cjs - Environment Configuration (Hardened v6.0)
// -------------------------------------------------------------------
// UPDATED 2026-08-02:
//   - Production-safe validation + fail-fast
//   - Secure JWT/CORS defaults
//   - Added robust numeric parsing
//   - Keep BRS_CANDLESTICK_URL resolution from env/defaultEndpoints
// -------------------------------------------------------------------
'use strict';

var path = require('path');

// Load dotenv - production first, then .env as fallback (no override)
try {
  var dotenv = require('dotenv');
  var prodEnvPath = path.resolve(__dirname, '..', '.env.production');
  var devEnvPath = path.resolve(__dirname, '..', '.env');

  dotenv.config({ path: prodEnvPath, override: false });
  dotenv.config({ path: devEnvPath, override: false });
} catch (e) {
  console.warn('[ENV] dotenv not available:', e.message);
}

// Load default endpoints as fallback URLs
var defaultEndpoints = {};
try {
  defaultEndpoints = require('./defaultEndpoints.cjs');
} catch (_err) {
  console.warn('[ENV] defaultEndpoints.cjs not found - BRS URL fallbacks disabled');
}

var NODE_ENV = process.env.NODE_ENV || 'production';
var IS_DEV = NODE_ENV !== 'production';
var IS_PROD = !IS_DEV;
var PORT = toInt(process.env.PORT, 3001);

function parseOrigins(str) {
  if (!str) return [];
  return str
    .split(',')
    .map(function (s) { return String(s || '').trim(); })
    .filter(Boolean);
}

function toInt(value, fallback) {
  var n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function isWildcard(originValue) {
  return String(originValue || '').trim() === '*';
}

// --- BRS URL resolution (env -> defaultEndpoints -> empty) ---
var brsSymbolUrl =
  process.env.BRS_SYMBOL_URL ||
  (defaultEndpoints.BRS_SYMBOL && defaultEndpoints.BRS_SYMBOL.url) ||
  '';

var brsAllSymbolsUrl =
  process.env.BRS_ALL_SYMBOLS_URL ||
  (defaultEndpoints.BRS_ALL_SYMBOLS && defaultEndpoints.BRS_ALL_SYMBOLS.url) ||
  '';

var brsIndexUrl =
  process.env.BRS_INDEX_URL ||
  (defaultEndpoints.BRS_INDEX && defaultEndpoints.BRS_INDEX.url) ||
  '';

var brsHistoryUrl =
  process.env.BRS_HISTORY_URL ||
  (defaultEndpoints.BRS_HISTORY && defaultEndpoints.BRS_HISTORY.url) ||
  '';

var brsCandlestickUrl =
  process.env.BRS_CANDLESTICK_URL ||
  (defaultEndpoints.BRS_CANDLESTICK && defaultEndpoints.BRS_CANDLESTICK.url) ||
  '';

var corsRaw = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '';
var allowedOrigins = parseOrigins(corsRaw);

var env = {
  NODE_ENV: NODE_ENV,
  IS_DEV: IS_DEV,
  IS_PROD: IS_PROD,
  PORT: PORT,

  // --- Database ---
  DATABASE_URL: process.env.DATABASE_URL || '',

  // --- JWT (NO insecure defaults) ---
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || '',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || '',
  JWT_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES || process.env.JWT_EXPIRES_IN || '30m',
  JWT_REFRESH_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES || process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // Aliases used by some middleware
  ACCESS_TOKEN_EXPIRES: process.env.ACCESS_TOKEN_EXPIRES || '30m',
  REFRESH_TOKEN_EXPIRES: process.env.REFRESH_TOKEN_EXPIRES || '7d',

  // --- CORS ---
  CORS_ORIGINS: corsRaw,
  CORS_ORIGIN: corsRaw,
  ALLOWED_ORIGINS: allowedOrigins,

  // --- Frontend ---
  FRONTEND_PATH: process.env.FRONTEND_PATH || path.join(__dirname, '..', 'build'),
  FRONTEND_URL: process.env.FRONTEND_URL || '',

  // --- Body Parser ---
  JSON_LIMIT: process.env.JSON_LIMIT || '1mb',

  // --- Static ---
  STATIC_MAX_AGE: toInt(process.env.STATIC_MAX_AGE, 31536000),

  // ------------------------------------------
  // BRS Market Data
  // ------------------------------------------
  BRS_API_KEY: process.env.BRS_API_KEY || '',
  BRS_API_URL: process.env.BRS_SYMBOL_URL || process.env.BRS_API_URL || '',
  BRS_SYMBOL_URL: brsSymbolUrl,
  BRS_ALL_SYMBOLS_URL: brsAllSymbolsUrl,
  BRS_INDEX_URL: brsIndexUrl,
  BRS_HISTORY_URL: brsHistoryUrl,
  BRS_CANDLESTICK_URL: brsCandlestickUrl,
  BRS_AVAILABLE: !!process.env.BRS_API_KEY,

  // ------------------------------------------
  // AI (GapGPT)
  // ------------------------------------------
  AI_API_URL: process.env.GAPGPT_API_URL || process.env.AI_API_URL || 'https://api.gapapi.com/v1',
  AI_API_KEY: process.env.GAPGPT_API_KEY || process.env.AI_API_KEY || '',
  GAPGPT_API_KEY: process.env.GAPGPT_API_KEY || '',
  GAPGPT_MODEL: process.env.GAPGPT_MODEL || process.env.AI_MODEL || 'gpt-4o-mini',
  AI_MODEL: process.env.GAPGPT_MODEL || process.env.AI_MODEL || 'gpt-4o-mini',
  AI_MAX_TOKENS: toInt(process.env.AI_MAX_TOKENS, 3000),
  AI_AVAILABLE: !!(process.env.GAPGPT_API_KEY || process.env.AI_API_KEY),

  // ------------------------------------------
  // Network
  // ------------------------------------------
  FETCH_TIMEOUT_MS: toInt(process.env.FETCH_TIMEOUT_MS, 30000),
  FETCH_TIMEOUT: toInt(process.env.FETCH_TIMEOUT_MS, 30000),
  FETCH_RETRIES: toInt(process.env.FETCH_RETRIES, 3),

  // ------------------------------------------
  // Rate Limiting
  // ------------------------------------------
  RATE_LIMIT_WINDOW: toInt(process.env.RATE_LIMIT_WINDOW, 60000),
  RATE_LIMIT_MAX: toInt(process.env.RATE_LIMIT_MAX, 120),
  RATE_LIMIT_BURST: toInt(process.env.RATE_LIMIT_BURST, 240),

  // ------------------------------------------
  // Cache
  // ------------------------------------------
  CACHE_TTL: toInt(process.env.CACHE_TTL, 300000),

  // ------------------------------------------
  // Cookies
  // ------------------------------------------
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
  COOKIE_SAMESITE: (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(),
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '',
  COOKIE_PATH: process.env.COOKIE_PATH || '/',

  // ------------------------------------------
  // Logging
  // ------------------------------------------
  LOG_LEVEL: process.env.LOG_LEVEL || (IS_DEV ? 'debug' : 'info'),
  LOG_DIR: process.env.LOG_DIR || './logs',

  // ------------------------------------------
  // Scheduling
  // ------------------------------------------
  ENABLE_CRON: process.env.ENABLE_CRON !== 'false',

  // ------------------------------------------
  // UI Fallbacks
  // ------------------------------------------
  UI_DEFAULT_RTL: true,
  UI_DEFAULT_FONT: 'Vazirmatn, Estedad, Sahel, Arial, sans-serif',

  // ------------------------------------------
  // SSRF Protection (secure by default)
  // ------------------------------------------
  ALLOW_LOCALHOST_REQUESTS: IS_DEV,
  ALLOW_INTERNAL_REQUESTS: IS_DEV,
  SSRF_PROTECTION_ENABLED: IS_PROD,

  // ------------------------------------------
  // Helpers
  // ------------------------------------------
  isProduction: function () { return IS_PROD; },
  isDevelopment: function () { return IS_DEV; },

  validate: function () {
    var warnings = [];
    var errors = [];

    // Required
    if (!this.DATABASE_URL) errors.push('DATABASE_URL is required');
    if (!this.JWT_SECRET) errors.push('JWT_SECRET is required');
    if (!this.JWT_ACCESS_SECRET) errors.push('JWT_ACCESS_SECRET is required');
    if (!this.JWT_REFRESH_SECRET) errors.push('JWT_REFRESH_SECRET is required');

    // Cookie validations
    var validSameSite = ['lax', 'strict', 'none'];
    if (validSameSite.indexOf(this.COOKIE_SAMESITE) === -1) {
      errors.push("COOKIE_SAMESITE must be one of: 'lax' | 'strict' | 'none'");
    }
    if (this.COOKIE_SAMESITE === 'none' && !this.COOKIE_SECURE) {
      errors.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
    }

    // Production hard rules
    if (IS_PROD) {
      if (!this.COOKIE_SECURE) errors.push('COOKIE_SECURE must be true in production');
      if (!this.COOKIE_DOMAIN) warnings.push('COOKIE_DOMAIN is empty in production');

      if (!this.CORS_ORIGINS || this.ALLOWED_ORIGINS.length === 0) {
        errors.push('CORS_ORIGINS must be set in production');
      }
      if (isWildcard(this.CORS_ORIGINS) || isWildcard(this.CORS_ORIGIN)) {
        errors.push('Wildcard CORS (*) is not allowed in production');
      }
    }

    // Optional integrations
    if (!this.BRS_API_KEY) warnings.push('BRS_API_KEY not set - market features disabled');
    if (!this.AI_API_KEY && !this.GAPGPT_API_KEY) warnings.push('GAPGPT_API_KEY not set - AI features disabled');

    console.log('========================================');
    console.log('  [ENV] Environment Validation');
    console.log('========================================');

    if (errors.length > 0) {
      console.error('  [ENV] ERRORS:');
      errors.forEach(function (e) { console.error('    - ' + e); });
    }
    if (warnings.length > 0) {
      console.warn('  [ENV] WARNINGS:');
      warnings.forEach(function (w) { console.warn('    - ' + w); });
    }

    console.log('  [ENV] Mode:         ' + this.NODE_ENV);
    console.log('  [ENV] Database:     ' + (this.DATABASE_URL ? 'CONFIGURED' : 'NOT SET'));
    console.log('  [ENV] BRS Market:   ' + (this.BRS_AVAILABLE ? 'ENABLED' : 'DISABLED'));
    console.log('  [ENV] AI/GapGPT:    ' + (this.AI_AVAILABLE ? 'ENABLED' : 'DISABLED'));
    console.log('  [ENV] BRS URLs:');
    console.log('    Symbol:      ' + (this.BRS_SYMBOL_URL || '(not set)'));
    console.log('    AllSymbols:  ' + (this.BRS_ALL_SYMBOLS_URL || '(not set)'));
    console.log('    Index:       ' + (this.BRS_INDEX_URL || '(not set)'));
    console.log('    History:     ' + (this.BRS_HISTORY_URL || '(not set)'));
    console.log('    Candlestick: ' + (this.BRS_CANDLESTICK_URL || '(not set)'));
    console.log('========================================');

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }
};

// Fail-fast in production
var validation = env.validate();
if (!validation.ok && IS_PROD) {
  console.error('[ENV] Fatal configuration errors. Exiting process.');
  process.exit(1);
}

module.exports = env;
