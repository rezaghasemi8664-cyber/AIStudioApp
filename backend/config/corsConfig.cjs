// backend/config/corsConfig.cjs - Hardened CORS Configuration
// -----------------------------------------------------------
// UPDATED 2026-08-02:
//   - Align with env.cjs hardened origin policy
//   - Prevent localhost leakage into production defaults
//   - Normalize and deduplicate origins
//   - Keep safe dev experience
// -----------------------------------------------------------
'use strict';

var env;
try {
  env = require('./env.cjs');
} catch (_e) {
  env = {};
}

var IS_DEV = !!env.IS_DEV || process.env.NODE_ENV !== 'production';
var IS_PROD = !IS_DEV;

function normalizeOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

function parseOrigins(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalizeOrigin).filter(Boolean);

  return String(value)
    .split(',')
    .map(function (item) { return normalizeOrigin(item); })
    .filter(Boolean);
}

function uniqueOrigins(values) {
  var seen = Object.create(null);
  return values.filter(function (origin) {
    if (!origin) return false;
    if (seen[origin]) return false;
    seen[origin] = true;
    return true;
  });
}

function isWildcard(origin) {
  return normalizeOrigin(origin) === '*';
}

// Production defaults: only real public domains
var productionBaseOrigins = [
  'https://roniya-analyzer.ir',
  'https://www.roniya-analyzer.ir'
];

// Development-only defaults
var developmentBaseOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:4173'
];

var configuredOrigins = [];

// Primary source of truth: env.ALLOWED_ORIGINS
if (Array.isArray(env.ALLOWED_ORIGINS) && env.ALLOWED_ORIGINS.length > 0) {
  configuredOrigins = configuredOrigins.concat(parseOrigins(env.ALLOWED_ORIGINS));
} else {
  configuredOrigins = configuredOrigins.concat(parseOrigins(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || ''));
}

if (env.FRONTEND_URL || process.env.FRONTEND_URL) {
  configuredOrigins.push(normalizeOrigin(env.FRONTEND_URL || process.env.FRONTEND_URL));
}

var allowedOrigins = productionBaseOrigins.concat(configuredOrigins);

if (IS_DEV) {
  allowedOrigins = allowedOrigins.concat(developmentBaseOrigins);
}

allowedOrigins = uniqueOrigins(
  allowedOrigins.filter(function (origin) {
    return origin && !isWildcard(origin);
  })
);

function isAllowedOrigin(origin) {
  var normalizedOrigin = normalizeOrigin(origin);
  return allowedOrigins.indexOf(normalizedOrigin) !== -1;
}

var corsConfig = {
  origin: function (origin, callback) {
    // Requests without Origin:
    // - usually server-to-server, curl, health checks
    // - allow by default unless you later decide to restrict them explicitly
    if (!origin) {
      return callback(null, true);
    }

    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    if (IS_DEV) {
      console.warn('[CORS] Dev mode - allowing non-whitelisted origin:', origin);
      return callback(null, true);
    }

    console.warn('[CORS] Blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },

  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'X-Request-Id',
    'Cache-Control'
  ],
  exposedHeaders: ['X-Request-Id', 'X-Total-Count'],
  maxAge: 86400
};

module.exports = corsConfig;
