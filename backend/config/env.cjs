// backend/config/env.cjs - Environment Configuration (Hardened v6.0)
'use strict';

var path = require('path');
try {
  var dotenv = require('dotenv');
  dotenv.config({ path: path.resolve(__dirname, '..', '.env.production'), override: false });
  dotenv.config({ path: path.resolve(__dirname, '..', '.env'), override: false });
} catch (e) { console.warn('[ENV] dotenv not available:', e.message); }

var defaultEndpoints = {};
try { defaultEndpoints = require('./defaultEndpoints.cjs'); } catch (_err) { console.warn('[ENV] defaultEndpoints.cjs not found'); }
var NODE_ENV = process.env.NODE_ENV || 'production';
var IS_DEV = NODE_ENV !== 'production';
var IS_PROD = !IS_DEV;
function toInt(value, fallback) { var n = parseInt(value, 10); return Number.isFinite(n) ? n : fallback; }
function parseOrigins(str) { return str ? str.split(',').map(function (s) { return String(s || '').trim(); }).filter(Boolean) : []; }
function isWildcard(v) { return String(v || '').trim() === '*'; }
var PORT = toInt(process.env.PORT, 3001);
var corsRaw = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '';
var allowedOrigins = parseOrigins(corsRaw);
var brsSymbolUrl = process.env.BRS_SYMBOL_URL || (defaultEndpoints.BRS_SYMBOL && defaultEndpoints.BRS_SYMBOL.url) || '';
var brsAllSymbolsUrl = process.env.BRS_ALL_SYMBOLS_URL || (defaultEndpoints.BRS_ALL_SYMBOLS && defaultEndpoints.BRS_ALL_SYMBOLS.url) || '';
var brsIndexUrl = process.env.BRS_INDEX_URL || (defaultEndpoints.BRS_INDEX && defaultEndpoints.BRS_INDEX.url) || '';
var brsHistoryUrl = process.env.BRS_HISTORY_URL || (defaultEndpoints.BRS_HISTORY && defaultEndpoints.BRS_HISTORY.url) || '';
var brsCandlestickUrl = process.env.BRS_CANDLESTICK_URL || (defaultEndpoints.BRS_CANDLESTICK && defaultEndpoints.BRS_CANDLESTICK.url) || '';
var brsCodalUrl = process.env.BRS_CODAL_URL || (defaultEndpoints.BRS_CODAL && defaultEndpoints.BRS_CODAL.url) || '';

var env = {
  NODE_ENV: NODE_ENV, IS_DEV: IS_DEV, IS_PROD: IS_PROD, PORT: PORT,
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || '', JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || '',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || '',
  JWT_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES || process.env.JWT_EXPIRES_IN || '30m',
  JWT_REFRESH_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES || process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  ACCESS_TOKEN_EXPIRES: process.env.ACCESS_TOKEN_EXPIRES || '30m', REFRESH_TOKEN_EXPIRES: process.env.REFRESH_TOKEN_EXPIRES || '7d',
  CORS_ORIGINS: corsRaw, CORS_ORIGIN: corsRaw, ALLOWED_ORIGINS: allowedOrigins,
  FRONTEND_PATH: process.env.FRONTEND_PATH || path.join(__dirname, '..', 'build'), FRONTEND_URL: process.env.FRONTEND_URL || '',
  JSON_LIMIT: process.env.JSON_LIMIT || '1mb', STATIC_MAX_AGE: toInt(process.env.STATIC_MAX_AGE, 31536000),
  FARAZ_SMS_PLUGIN_ZIP: process.env.FARAZ_SMS_PLUGIN_ZIP || path.resolve(__dirname, '..', '..', 'temporary', 'faraz-sms-3.22.212.zip'),
  BRS_API_KEY: process.env.BRS_API_KEY || '', BRS_API_URL: process.env.BRS_SYMBOL_URL || process.env.BRS_API_URL || '',
  BRS_SYMBOL_URL: brsSymbolUrl, BRS_ALL_SYMBOLS_URL: brsAllSymbolsUrl, BRS_INDEX_URL: brsIndexUrl,
  BRS_HISTORY_URL: brsHistoryUrl, BRS_CANDLESTICK_URL: brsCandlestickUrl, BRS_AVAILABLE: !!process.env.BRS_API_KEY,
  BRS_CODAL_API_KEY: process.env.BRS_CODAL_API_KEY || process.env.CODAL_API_KEY || '',
  BRS_CODAL_URL: brsCodalUrl,
  CODAL_API_KEY: process.env.BRS_CODAL_API_KEY || process.env.CODAL_API_KEY || '', CODAL_API_URL: process.env.BRS_CODAL_URL || process.env.CODAL_API_URL || brsCodalUrl,
  CODAL_AVAILABLE: !!((process.env.BRS_CODAL_API_KEY || process.env.CODAL_API_KEY) && brsCodalUrl),
  AI_API_URL: process.env.GAPGPT_API_URL || process.env.AI_API_URL || 'https://api.gapapi.com/v1',
  AI_API_KEY: process.env.GAPGPT_API_KEY || process.env.AI_API_KEY || '', GAPGPT_API_KEY: process.env.GAPGPT_API_KEY || '',
  GAPGPT_MODEL: process.env.GAPGPT_MODEL || process.env.AI_MODEL || 'gpt-4o-mini', AI_MODEL: process.env.GAPGPT_MODEL || process.env.AI_MODEL || 'gpt-4o-mini',
  AI_MAX_TOKENS: toInt(process.env.AI_MAX_TOKENS, 3000), AI_AVAILABLE: !!(process.env.GAPGPT_API_KEY || process.env.AI_API_KEY),
  FETCH_TIMEOUT_MS: toInt(process.env.FETCH_TIMEOUT_MS, 30000), FETCH_TIMEOUT: toInt(process.env.FETCH_TIMEOUT_MS, 30000), FETCH_RETRIES: toInt(process.env.FETCH_RETRIES, 3),
  RATE_LIMIT_WINDOW: toInt(process.env.RATE_LIMIT_WINDOW, 60000), RATE_LIMIT_MAX: toInt(process.env.RATE_LIMIT_MAX, 120), RATE_LIMIT_BURST: toInt(process.env.RATE_LIMIT_BURST, 240),
  CACHE_TTL: toInt(process.env.CACHE_TTL, 300000), COOKIE_SECURE: process.env.COOKIE_SECURE === 'true', COOKIE_SAMESITE: (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(),
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '', COOKIE_PATH: process.env.COOKIE_PATH || '/', LOG_LEVEL: process.env.LOG_LEVEL || (IS_DEV ? 'debug' : 'info'), LOG_DIR: process.env.LOG_DIR || './logs',
  ENABLE_CRON: process.env.ENABLE_CRON !== 'false', UI_DEFAULT_RTL: true, UI_DEFAULT_FONT: 'Vazirmatn, Estedad, Sahel, Arial, sans-serif',
  ALLOW_LOCALHOST_REQUESTS: IS_DEV, ALLOW_INTERNAL_REQUESTS: IS_DEV, SSRF_PROTECTION_ENABLED: IS_PROD,
  isProduction: function () { return IS_PROD; }, isDevelopment: function () { return IS_DEV; },
  validate: function () {
    var warnings = [], errors = [];
    if (!this.DATABASE_URL) errors.push('DATABASE_URL is required');
    if (!this.JWT_SECRET) errors.push('JWT_SECRET is required');
    if (!this.JWT_ACCESS_SECRET) errors.push('JWT_ACCESS_SECRET is required');
    if (!this.JWT_REFRESH_SECRET) errors.push('JWT_REFRESH_SECRET is required');
    var validSameSite = ['lax', 'strict', 'none'];
    if (validSameSite.indexOf(this.COOKIE_SAMESITE) === -1) errors.push("COOKIE_SAMESITE must be one of: 'lax' | 'strict' | 'none'");
    if (this.COOKIE_SAMESITE === 'none' && !this.COOKIE_SECURE) errors.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
    if (IS_PROD) {
      if (!this.COOKIE_SECURE) errors.push('COOKIE_SECURE must be true in production');
      if (!this.COOKIE_DOMAIN) warnings.push('COOKIE_DOMAIN is empty in production');
      if (!this.CORS_ORIGINS || this.ALLOWED_ORIGINS.length === 0) errors.push('CORS_ORIGINS must be set in production');
      if (isWildcard(this.CORS_ORIGINS) || isWildcard(this.CORS_ORIGIN)) errors.push('Wildcard CORS (*) is not allowed in production');
    }
    if (!this.BRS_API_KEY) warnings.push('BRS_API_KEY not set - market features disabled');
    if (!this.BRS_CODAL_API_KEY) warnings.push('BRS_CODAL_API_KEY not set - Codal integration disabled');
    if (!this.AI_API_KEY && !this.GAPGPT_API_KEY) warnings.push('GAPGPT_API_KEY not set - AI features disabled');
    console.log('========================================');
    console.log('  [ENV] Environment Validation');
    console.log('========================================');
    if (errors.length) { console.error('  [ENV] ERRORS:'); errors.forEach(function (e) { console.error('    - ' + e); }); }
    if (warnings.length) { console.warn('  [ENV] WARNINGS:'); warnings.forEach(function (w) { console.warn('    - ' + w); }); }
    console.log('  [ENV] Mode:         ' + this.NODE_ENV);
    console.log('  [ENV] Database:     ' + (this.DATABASE_URL ? 'CONFIGURED' : 'NOT SET'));
    console.log('  [ENV] BRS Market:   ' + (this.BRS_AVAILABLE ? 'ENABLED' : 'DISABLED'));
    console.log('  [ENV] Codal:        ' + (this.CODAL_AVAILABLE ? 'ENABLED' : 'DISABLED'));
    console.log('  [ENV] AI/GapGPT:    ' + (this.AI_AVAILABLE ? 'ENABLED' : 'DISABLED'));
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }
};
var validation = env.validate();
if (!validation.ok && IS_PROD) { console.error('[ENV] Fatal configuration errors. Exiting process.'); process.exit(1); }
module.exports = env;
