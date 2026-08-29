// backend/server.cjs - Complete Production Server v5.2.1 FIXED + Socket.IO (PATCH-ONLY)
// ══════════════════════════════════════════════════════════════════
// v5.2.1 Patch-only changes:
//   - Harden API path guard (strict /api and /api/* only) in SPA fallback and API 404
//   - Fix fonts static path to use frontendPath (not hardcoded __dirname/build)
//   - Improve router export detection: routerModule.router.use check
//   - Keep all existing features/logs/error handling intact
// ══════════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const bootstrapSockets = require('./socket/index.cjs');
const { startMarketSummaryCron, stopMarketSummaryCron } = require('./cron/marketSummaryCron.cjs');
const { startCronJobs } = require('./cron/index.cjs');


// ═══════════════════════════════════════════════════════════════════
// 1. LOAD ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════
let env;
try {
  env = require('./config/env.cjs');
  if (typeof env.validate === 'function') {
    env.validate();
  }
  console.log('[SERVER] Environment loaded from config/env.cjs');
} catch (loadEnvErr) {
  console.warn('[SERVER] Failed to load env.cjs, using process.env fallback:', loadEnvErr.message);

  const rawOrigins = (process.env.CORS_ORIGINS || '').split(',').map(function (s) {
    return s.trim();
  }).filter(Boolean);

  env = {
    PORT: parseInt(process.env.PORT, 10) || 3001,
    NODE_ENV: process.env.NODE_ENV || 'production',
    JSON_LIMIT: process.env.JSON_LIMIT || '10mb',
    FRONTEND_PATH: process.env.FRONTEND_PATH || '',
    CORS_ORIGINS: process.env.CORS_ORIGINS || '',
    ALLOWED_ORIGINS: rawOrigins.length > 0 ? rawOrigins : [],
    STATIC_MAX_AGE: parseInt(process.env.STATIC_MAX_AGE, 10) || 31536000,
    IS_DEV: process.env.NODE_ENV !== 'production',
    RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 60000,
    RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    BRS_AVAILABLE: !!(process.env.BRS_API_KEY),
    AI_AVAILABLE: !!(process.env.GAPGPT_API_KEY),
  };
}

const PORT = env.PORT || 3001;
const IS_DEV = env.IS_DEV || process.env.NODE_ENV !== 'production';
const NODE_ENV = env.NODE_ENV || process.env.NODE_ENV || 'production';

// strict API path helper (PATCH)
function isApiPath(p) {
  return p === '/api' || p.startsWith('/api/');
}

// ═══════════════════════════════════════════════════════════════════
// 2. CREATE EXPRESS APP
// ═══════════════════════════════════════════════════════════════════
const app = express();
const httpServer = http.createServer(app);

// Trust proxy (required when behind Nginx / load balancer)
app.set('trust proxy', 1);

// Disable x-powered-by header (security)
app.disable('x-powered-by');

// ═══════════════════════════════════════════════════════════════════
// 3. SECURITY HEADERS (manual helmet alternative)
// ═══════════════════════════════════════════════════════════════════
app.use(function securityHeaders(req, res, next) {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (!req.path.startsWith('/api/')) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://brsapi.ir https://roniya-analyzer.ir wss://roniya-analyzer.ir",
      ].join('; ')
    );
  }
  next();
});

// ═══════════════════════════════════════════════════════════════════
// 4. REQUEST ID & TIMING (for tracing / debugging)
// ═══════════════════════════════════════════════════════════════════
let requestCounter = 0;

app.use(function requestIdAndTiming(req, res, next) {
  requestCounter++;
  const id = Date.now().toString(36) + '-' + requestCounter.toString(36);
  req.requestId = id;
  req.startTime = Date.now();
  res.setHeader('X-Request-Id', id);

  res.on('finish', function () {
    const duration = Date.now() - req.startTime;
    if (duration > 5000 && req.path.startsWith('/api/')) {
      console.warn('[SLOW] ' + req.method + ' ' + req.originalUrl + ' took ' + duration + 'ms (Request-ID: ' + id + ')');
    }
  });

  next();
});

// ═══════════════════════════════════════════════════════════════════
// 5. CORS CONFIGURATION
// ═══════════════════════════════════════════════════════════════════
let corsConfig;
try {
  corsConfig = require('./config/corsConfig.cjs');
  console.log('[SERVER] CORS config loaded from config/corsConfig.cjs');
} catch (_e) {
  corsConfig = null;
}

let resolvedAllowedOrigins = [];

if (corsConfig) {
  app.use(cors(corsConfig));

  if (Array.isArray(corsConfig.origin)) {
    resolvedAllowedOrigins = corsConfig.origin;
  } else if (typeof corsConfig.origin === 'string') {
    resolvedAllowedOrigins = [corsConfig.origin];
  } else if (env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.length > 0) {
    resolvedAllowedOrigins = env.ALLOWED_ORIGINS;
  }
} else {
  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:3001',
    'https://roniya-analyzer.ir',
    'https://www.roniya-analyzer.ir',
  ];

  const allowedOrigins = (env.ALLOWED_ORIGINS && env.ALLOWED_ORIGINS.length > 0)
    ? env.ALLOWED_ORIGINS
    : defaultOrigins;

  resolvedAllowedOrigins = allowedOrigins;

  const allowedOriginsSet = new Set(allowedOrigins);

  app.use(cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOriginsSet.has(origin)) {
        return callback(null, true);
      }
      if (IS_DEV) {
        return callback(null, true);
      }
      console.warn('[CORS] Blocked origin:', origin);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-Total-Count'],
    maxAge: 86400,
  }));
  console.log('[SERVER] CORS configured with origins:', allowedOrigins.join(', '));
}

// ═══════════════════════════════════════════════════════════════════
// 5.1 SOCKET.IO INITIALIZATION
// ═══════════════════════════════════════════════════════════════════
const io = new Server(httpServer, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (IS_DEV) return callback(null, true);
      if (resolvedAllowedOrigins.length === 0) return callback(null, true);
      if (resolvedAllowedOrigins.includes(origin)) return callback(null, true);
      console.warn('[SOCKET CORS] Blocked origin:', origin);
      return callback(new Error('Not allowed by Socket.IO CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  },
});

bootstrapSockets(io);
app.set('io', io);
console.log('[SERVER] Socket.IO initialized');

// ═══════════════════════════════════════════════════════════════════
// 6. COOKIE PARSER
// ═══════════════════════════════════════════════════════════════════
try {
  const cookieParser = require('cookie-parser');
  app.use(cookieParser());
  console.log('[SERVER] Cookie parser enabled');
} catch (_e) {
  console.warn('[SERVER] cookie-parser not installed. Using fallback parser.');
  console.warn('[SERVER] Install with: npm install cookie-parser');

  app.use(function fallbackCookieParser(req, _res, next) {
    req.cookies = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      cookieHeader.split(';').forEach(function (cookie) {
        const eqIndex = cookie.indexOf('=');
        if (eqIndex > 0) {
          const key = cookie.substring(0, eqIndex).trim();
          const val = cookie.substring(eqIndex + 1).trim();
          if (key) {
            try {
              req.cookies[key] = decodeURIComponent(val);
            } catch (_decErr) {
              req.cookies[key] = val;
            }
          }
        }
      });
    }
    next();
  });
}

// ═══════════════════════════════════════════════════════════════════
// 7. BODY PARSERS
// ═══════════════════════════════════════════════════════════════════
const jsonLimit = env.JSON_LIMIT || '10mb';
app.use(express.json({ limit: jsonLimit }));
app.use(express.urlencoded({ extended: true, limit: jsonLimit }));

// ═══════════════════════════════════════════════════════════════════
// 8. COMPRESSION (gzip responses)
// ═══════════════════════════════════════════════════════════════════
try {
  const compression = require('compression');
  app.use(compression({
    level: 6,
    threshold: 1024,
    filter: function (req, res) {
      if (req.headers['x-no-compression']) return false;
      if (typeof compression.filter === 'function') {
        return compression.filter(req, res);
      }
      const acceptEncoding = req.headers['accept-encoding'] || '';
      return acceptEncoding.indexOf('gzip') !== -1 || acceptEncoding.indexOf('deflate') !== -1;
    },
  }));
  console.log('[SERVER] Compression enabled');
} catch (_e) {
  console.warn('[SERVER] compression not installed. Responses will not be compressed.');
  console.warn('[SERVER] Install with: npm install compression');
}

// ═══════════════════════════════════════════════════════════════════
// 9. ACCESS LOGGING (Morgan or manual)
// ═══════════════════════════════════════════════════════════════════
const logDir = path.join(__dirname, 'logs');
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (mkdirErr) {
  console.warn('[SERVER] Could not create logs directory:', mkdirErr.message);
}

try {
  const morgan = require('morgan');

  const accessLogPath = path.join(logDir, 'access.log');
  const accessLogStream = fs.createWriteStream(accessLogPath, { flags: 'a' });

  morgan.token('request-id', function (req) {
    return req.requestId || '-';
  });

  const logFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" rid=:request-id rt=:response-time[0]ms';

  app.use(morgan(logFormat, { stream: accessLogStream }));

  if (IS_DEV) {
    app.use(morgan('dev'));
  }
  console.log('[SERVER] Morgan access logging enabled -> ' + accessLogPath);
} catch (_e) {
  if (IS_DEV) {
    app.use(function simpleLogger(req, _res, next) {
      const ts = new Date().toLocaleTimeString('fa-IR');
      console.log('[' + ts + '] ' + req.method + ' ' + req.originalUrl);
      next();
    });
    console.log('[SERVER] Simple request logger enabled (development)');
  }
}

// ═══════════════════════════════════════════════════════════════════
// 10. RATE LIMITING (API routes only)
// ═══════════════════════════════════════════════════════════════════
try {
  const rateLimit = require('express-rate-limit');
  const rateLimitWindow = env.RATE_LIMIT_WINDOW || parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 60000;
  const rateLimitMax = env.RATE_LIMIT_MAX || parseInt(process.env.RATE_LIMIT_MAX, 10) || 100;

  const rateLimitSkipPaths = new Set([
    '/api/health',
    '/api/v1/health',
    '/api/version',
  ]);

  const apiLimiter = rateLimit({
    windowMs: rateLimitWindow,
    max: rateLimitMax,
    message: {
      success: false,
      message: 'تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً کمی صبر کنید.',
      messageEn: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: function (req) {
      return req.ip || req.connection.remoteAddress || 'unknown';
    },
    skip: function (req) {
      return rateLimitSkipPaths.has(req.path);
    },
  });
  app.use('/api/', apiLimiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: {
      success: false,
      message: 'تعداد تلاش‌های ورود بیش از حد مجاز است. ۱۵ دقیقه صبر کنید.',
      messageEn: 'Too many login attempts. Please wait 15 minutes.',
      code: 'AUTH_RATE_LIMIT',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/v1/auth/login', authLimiter);

  console.log('[SERVER] Rate limiting enabled (window: ' + rateLimitWindow + 'ms, max: ' + rateLimitMax + ')');
} catch (_e) {
  console.warn('[SERVER] express-rate-limit not installed. Rate limiting disabled.');
  console.warn('[SERVER] Install with: npm install express-rate-limit');
}

// ═══════════════════════════════════════════════════════════════════
// 11. REQUEST TIMEOUT MIDDLEWARE (for long AI requests)
// ═══════════════════════════════════════════════════════════════════
app.use(function requestTimeout(req, res, next) {
  let timeout = 30000;

  if (req.path.startsWith('/api/ai') ||
      req.path.startsWith('/api/v1/ai') ||
      req.path.startsWith('/api/analysis') ||
      req.path.startsWith('/api/v1/analysis')) {
    timeout = 120000;
  }

  if (req.path.startsWith('/api/scalping') ||
      req.path.startsWith('/api/v1/scalping')) {
    timeout = 90000;
  }

  req.setTimeout(timeout);
  res.setTimeout(timeout, function () {
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        message: 'درخواست شما بیش از حد طول کشید. لطفاً دوباره تلاش کنید.',
        messageEn: 'Request timeout. Please try again.',
        code: 'REQUEST_TIMEOUT',
        requestId: req.requestId,
      });
    }
  });

  next();
});

// ═══════════════════════════════════════════════════════════════════
// 12. HEALTH CHECK & VERSION (before auth - public endpoints)
// ═══════════════════════════════════════════════════════════════════
const serverStartTime = new Date();

let prismaClient = null;
try {
  const prismaModule = require('./config/prisma.cjs');
  prismaClient = prismaModule.prisma || prismaModule;
  console.log('[SERVER] Prisma client acquired');
} catch (_e) {
  try {
    const PrismaClientClass = require('@prisma/client').PrismaClient;
    prismaClient = new PrismaClientClass();
    console.log('[SERVER] Prisma client created directly');
  } catch (_e2) {
    console.warn('[SERVER] Could not acquire Prisma client');
  }
}

function healthResponse(req, res) {
  const memUsage = process.memoryUsage();
  const uptimeSeconds = Math.round(process.uptime());

  const dbCheck = prismaClient
    ? prismaClient.$queryRaw`SELECT 1`
        .then(function () { return 'connected'; })
        .catch(function () { return 'disconnected'; })
    : Promise.resolve('unavailable');

  dbCheck.then(function (dbStatus) {
    const isHealthy = dbStatus !== 'disconnected';
    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      success: isHealthy,
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds,
      uptimeFormatted: Math.floor(uptimeSeconds / 3600) + 'h ' +
                       Math.floor((uptimeSeconds % 3600) / 60) + 'm ' +
                       (uptimeSeconds % 60) + 's',
      startedAt: serverStartTime.toISOString(),
      version: '5.2.1',
      environment: NODE_ENV,
      database: dbStatus,
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB',
      },
      requestId: req.requestId,
    });
  });
}

app.get('/api/health', healthResponse);
app.get('/api/v1/health', healthResponse);

app.get('/api/version', function (_req, res) {
  res.json({
    success: true,
    version: '5.2.1',
    name: 'AIStudioApp Backend',
    environment: NODE_ENV,
    node: process.version,
    buildDate: '2026-08-03',
  });
});

// ═══════════════════════════════════════════════════════════════════
// 13. ROUTE MOUNTING
// ═══════════════════════════════════════════════════════════════════
const routeStats = { loaded: 0, failed: 0, skipped: 0, routes: [] };
const mountedRouteKeys = new Set();

function mountRoute(apiPath, filePath, label) {
  const mountKey = apiPath + '::' + filePath;
  if (mountedRouteKeys.has(mountKey)) {
    console.warn('  [ROUTE] ↷ Duplicate mount skipped: ' + apiPath + ' -> ' + filePath + ' (' + label + ')');
    routeStats.skipped++;
    routeStats.routes.push({
      path: apiPath,
      label: label,
      status: 'SKIPPED_DUPLICATE',
      file: filePath,
    });
    return;
  }

  try {
    const fullPath = path.resolve(__dirname, filePath);

    if (!fs.existsSync(fullPath)) {
      console.warn('  [ROUTE] ⚠️  File not found: ' + filePath + ' (' + label + ')');
      routeStats.failed++;
      routeStats.routes.push({
        path: apiPath,
        label: label,
        status: 'NOT_FOUND',
        file: filePath,
      });
      return;
    }

    const routerModule = require(fullPath);

    let routerInstance = null;
    if (typeof routerModule === 'function') {
      routerInstance = routerModule;
    } else if (routerModule && typeof routerModule.use === 'function') {
      routerInstance = routerModule;
    } else if (routerModule && routerModule.router && typeof routerModule.router.use === 'function') { // PATCH
      routerInstance = routerModule.router;
    } else if (routerModule && routerModule.default && typeof routerModule.default === 'function') {
      routerInstance = routerModule.default;
    } else if (routerModule && routerModule.default && typeof routerModule.default.use === 'function') {
      routerInstance = routerModule.default;
    }

    if (routerInstance) {
      app.use(apiPath, routerInstance);
      mountedRouteKeys.add(mountKey);
      routeStats.loaded++;
      routeStats.routes.push({
        path: apiPath,
        label: label,
        status: 'OK',
        file: filePath,
      });
      console.log('  [ROUTE] ✅ ' + apiPath + ' → ' + label);
    } else {
      const exportKeys = (routerModule && typeof routerModule === 'object') ? Object.keys(routerModule) : [];
      console.warn('  [ROUTE] ⚠️  Invalid router export: ' + filePath + ' (' + label + ')');
      console.warn('           Export type: ' + typeof routerModule + ', keys: ' + exportKeys.join(', '));
      routeStats.failed++;
      routeStats.routes.push({
        path: apiPath,
        label: label,
        status: 'INVALID_EXPORT',
        file: filePath,
        exportType: typeof routerModule,
        exportKeys: exportKeys,
      });
    }
  } catch (err) {
    console.error('  [ROUTE] ❌ Failed to mount ' + apiPath + ': ' + err.message);
    if (IS_DEV) {
      console.error('         Stack:', err.stack);
    }
    routeStats.failed++;
    routeStats.routes.push({
      path: apiPath,
      label: label,
      status: 'ERROR',
      error: err.message,
      file: filePath,
    });
  }
}

console.log('');
console.log('════════════════════════════════════════════════');
console.log('  Mounting API Routes (v5.2.1)');
console.log('════════════════════════════════════════════════');

mountRoute('/api/v1', './routes/v1/index.cjs', 'API v1 Root');
mountRoute('/api/v2', './routes/v2/index.cjs', 'API v2 Root');

mountRoute('/api/auth',        './routes/auth.routes.cjs',             'Auth (login/register/refresh)');
mountRoute('/api/v1/auth',     './routes/auth.routes.cjs',             'Auth v1 alias');

mountRoute('/api/profile',     './routes/profile.routes.cjs',          'User Profile');
mountRoute('/api/v1/profile',  './routes/profile.routes.cjs',          'User Profile v1 alias');

mountRoute('/api/users',       './routes/user.routes.cjs',             'User Management');
mountRoute('/api/v1/users',    './routes/user.routes.cjs',             'User Management v1 alias');

mountRoute('/api/market',      './routes/market.routes.cjs',           'Market Data (BRS)');
mountRoute('/api/v1/market',   './routes/market.routes.cjs',           'Market Data v1 alias');
mountRoute('/api/brs',         './routes/brs.routes.cjs',              'BRS Direct API');
mountRoute('/api/v1/brs',      './routes/brs.routes.cjs',              'BRS Direct v1 alias');

mountRoute('/api/market-history',      './routes/marketHistory.routes.cjs',   'Market History');
mountRoute('/api/v1/market-history',   './routes/marketHistory.routes.cjs',   'Market History v1 alias');

mountRoute('/api/maintenance',    './routes/maintenance.routes.cjs',   'Maintenance');
mountRoute('/api/v1/maintenance', './routes/maintenance.routes.cjs',   'Maintenance v1 alias');

mountRoute('/api/market-summary',      './routes/marketSummary.routes.cjs',   'Market Summary (AI)');
mountRoute('/api/v1/market-summary',   './routes/marketSummary.routes.cjs',   'Market Summary v1 alias');

mountRoute('/api/scalping',      './routes/scalping.routes.cjs',       'Scalping');
mountRoute('/api/v1/scalping',   './routes/scalping.routes.cjs',       'Scalping v1 alias');

mountRoute('/api/analysis-history',      './routes/analysisHistory.routes.cjs',  'Analysis History');
mountRoute('/api/v1/analysis-history',   './routes/analysisHistory.routes.cjs',  'Analysis History v1 alias');
mountRoute('/api/ai',                    './routes/ai.routes.cjs',               'AI Analysis (GapGPT)');
mountRoute('/api/v1/ai',                 './routes/ai.routes.cjs',               'AI Analysis v1 alias');
mountRoute('/api/analysis',              './routes/analysis.routes.cjs',         'Stock Analysis');
mountRoute('/api/v1/analysis',           './routes/analysis.routes.cjs',         'Stock Analysis v1 alias');
mountRoute('/api/analyze',               './routes/analyze.routes.cjs',          'Analyze (alias)');
mountRoute('/api/v1/analyze',            './routes/analyze.routes.cjs',          'Analyze v1 alias');

mountRoute('/api/portfolio',    './routes/portfolio.routes.cjs',       'Portfolio');
mountRoute('/api/v1/portfolio', './routes/portfolio.routes.cjs',       'Portfolio v1 alias');

mountRoute('/api/watchlist',    './routes/watchlist.routes.cjs',       'Watchlist');
mountRoute('/api/v1/watchlist', './routes/watchlist.routes.cjs',       'Watchlist v1 alias');

mountRoute('/api/notifications',    './routes/notification.routes.cjs',  'Notifications');
mountRoute('/api/v1/notifications', './routes/notification.routes.cjs',  'Notifications v1 alias');
mountRoute('/api/messages',         './routes/message.routes.cjs',       'Messages');
mountRoute('/api/v1/messages',      './routes/message.routes.cjs',       'Messages v1 alias');

mountRoute('/api/conversations',    './routes/conversation.routes.cjs',  'Conversations');
mountRoute('/api/v1/conversations', './routes/conversation.routes.cjs',  'Conversations v1 alias');

mountRoute('/api/settings',      './routes/settings.routes.cjs',       'User Settings');
mountRoute('/api/v1/settings',   './routes/settings.routes.cjs',       'User Settings v1 alias');
mountRoute('/api/theme',         './routes/theme.routes.cjs',          'Theme Config');
mountRoute('/api/v1/theme',      './routes/theme.routes.cjs',          'Theme Config v1 alias');
mountRoute('/api/ui-config',     './routes/uiConfig.routes.cjs',       'UI Config');
mountRoute('/api/v1/ui-config',  './routes/uiConfig.routes.cjs',       'UI Config v1 alias');
mountRoute('/api/app-config',    './routes/appConfig.routes.cjs',      'App Config');
mountRoute('/api/v1/app-config', './routes/appConfig.routes.cjs',      'App Config v1 alias');
mountRoute('/api/v2/app-config', './routes/appConfig.routes.cjs',      'App Config v2 alias');
mountRoute('/api/endpoints',     './routes/endpoints.routes.cjs',      'API Endpoints');
mountRoute('/api/v1/endpoints',  './routes/endpoints.routes.cjs',      'API Endpoints v1 alias');
mountRoute('/api/user-preference', './routes/userPreference.routes.cjs', 'User Preferences');
mountRoute('/api/global-settings',      './routes/globalSettings.routes.cjs',   'Global Settings');
mountRoute('/api/v1/global-settings',   './routes/globalSettings.routes.cjs',   'Global Settings v1 alias');

mountRoute('/api/api-keys',    './routes/apiKey.routes.cjs',           'API Keys');
mountRoute('/api/v1/api-keys', './routes/apiKey.routes.cjs',           'API Keys v1 alias');

mountRoute('/api/admin',       './routes/admin.routes.cjs',            'Admin Panel');
mountRoute('/api/v1/admin',    './routes/admin.routes.cjs',            'Admin Panel v1 alias');

mountRoute('/api/logs',        './routes/log.routes.cjs',              'System Logs');

console.log('════════════════════════════════════════════════');
console.log('  Routes: ' + routeStats.loaded + ' loaded, ' + routeStats.failed + ' failed, ' + routeStats.skipped + ' skipped');
console.log('════════════════════════════════════════════════');
console.log('');

// ═══════════════════════════════════════════════════════════════════
// 14. DEBUG ROUTES ENDPOINT (protected in production)
// ═══════════════════════════════════════════════════════════════════
app.get('/api/debug/routes', function debugRoutesHandler(req, res) {
  if (!IS_DEV) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    try {
      const jwt = require('jsonwebtoken');
      const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
      if (!secret) {
        return res.status(500).json({ success: false, message: 'JWT secret not configured' });
      }
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, secret);
      if (!decoded.isAdmin && decoded.role !== 'admin' && decoded.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }
    } catch (jwtErr) {
      return res.status(401).json({ success: false, message: 'Invalid token: ' + jwtErr.message });
    }
  }

  res.json({
    success: true,
    stats: {
      loaded: routeStats.loaded,
      failed: routeStats.failed,
      skipped: routeStats.skipped,
      total: routeStats.loaded + routeStats.failed + routeStats.skipped,
    },
    routes: routeStats.routes,
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════════
// 15. STATIC FILES (Frontend Build)
// ═══════════════════════════════════════════════════════════════════
const frontendPath = env.FRONTEND_PATH || path.join(__dirname, 'build');

if (fs.existsSync(frontendPath)) {
  console.log('[SERVER] Serving frontend from: ' + frontendPath);

  const indexPath = path.join(frontendPath, 'index.html');
  const hasIndex = fs.existsSync(indexPath);

  if (!hasIndex) {
    console.warn('[SERVER] WARNING: index.html not found at ' + indexPath);
  }

  const staticFileCache = new Set();
  let staticFileCacheBuilt = false;

  function buildStaticFileCache() {
    try {
      function walkDir(dir, prefix) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const relativePath = prefix + '/' + entry.name;
          if (entry.isFile()) {
            staticFileCache.add(relativePath);
          } else if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
            walkDir(path.join(dir, entry.name), relativePath);
          }
        }
      }
      walkDir(frontendPath, '');
      staticFileCacheBuilt = true;
      console.log('[SERVER] Static file cache built: ' + staticFileCache.size + ' files indexed');
    } catch (walkErr) {
      console.warn('[SERVER] Could not build static file cache:', walkErr.message);
    }
  }

  buildStaticFileCache();

  app.use('/assets', express.static(path.join(frontendPath, 'assets'), {
    maxAge: env.STATIC_MAX_AGE ? env.STATIC_MAX_AGE * 1000 : 31536000000,
    etag: true,
    lastModified: true,
    immutable: true,
  }));

  // PATCH: use frontendPath (not hardcoded __dirname/build)
  app.use('/fonts', express.static(path.join(frontendPath, 'fonts'), {
    maxAge: env.STATIC_MAX_AGE ? env.STATIC_MAX_AGE * 1000 : 31536000000,
    etag: true,
    lastModified: true,
    immutable: true,
  }));

  app.use(express.static(frontendPath, {
    maxAge: 3600000,
    etag: true,
    lastModified: true,
    index: false,
  }));

  app.get('*', function spaFallback(req, res, next) {
    // PATCH: strict API guard
    if (isApiPath(req.path)) {
      return next();
    }

    if (staticFileCacheBuilt && staticFileCache.has(req.path)) {
      const requestedFile = path.join(frontendPath, req.path);
      return res.sendFile(requestedFile);
    }

    if (hasIndex) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.sendFile(indexPath);
    }

    next();
  });

} else {
  console.warn('[SERVER] Frontend path not found: ' + frontendPath);
  console.warn('[SERVER] Only API routes will be available.');

  app.get('/', function (_req, res) {
    res.json({
      success: true,
      message: 'AIStudioApp Backend API v5.2.1',
      docs: '/api/debug/routes',
      health: '/api/health',
      version: '/api/version',
    });
  });
}

// ═══════════════════════════════════════════════════════════════════
// 16. ERROR HANDLERS
// ═══════════════════════════════════════════════════════════════════
app.use(function apiNotFoundHandler(req, res, next) {
  // PATCH: strict API guard
  if (!isApiPath(req.path)) {
    return next();
  }

  console.warn('[404] ' + req.method + ' ' + req.originalUrl + ' (Request-ID: ' + req.requestId + ')');

  res.status(404).json({
    success: false,
    message: 'مسیر API پیدا نشد: ' + req.method + ' ' + req.originalUrl,
    messageEn: 'API route not found: ' + req.method + ' ' + req.originalUrl,
    code: 'ROUTE_NOT_FOUND',
    requestId: req.requestId,
    suggestion: 'Check /api/debug/routes for available routes',
  });
});

app.use(function globalErrorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'خطای داخلی سرور';

  console.error('[ERROR] ' + req.method + ' ' + req.originalUrl + ' -> ' + statusCode + ': ' + message + ' (Request-ID: ' + req.requestId + ')');
  if (IS_DEV && err.stack) {
    console.error('  Stack:', err.stack);
  }

  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'فرمت JSON ارسالی نامعتبر است';
  }

  if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'حجم درخواست بیش از حد مجاز است (حداکثر: ' + jsonLimit + ')';
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'حجم فایل بیش از حد مجاز است';
  }

  if (err.code === 'EBADCSRFTOKEN') {
    statusCode = 403;
    message = 'توکن CSRF نامعتبر است';
  }

  if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    switch (err.code) {
      case 'P2002':
        statusCode = 409;
        message = 'اطلاعات تکراری: ' + (err.meta && err.meta.target ? err.meta.target.join(', ') : 'unknown');
        break;
      case 'P2003':
        statusCode = 400;
        message = 'خطای ارجاع: رکورد مرتبط یافت نشد';
        break;
      case 'P2025':
        statusCode = 404;
        message = 'رکورد مورد نظر یافت نشد';
        break;
      case 'P2024':
        statusCode = 503;
        message = 'خطای اتصال به پایگاه داده. لطفاً دوباره تلاش کنید';
        break;
      default:
        statusCode = 400;
        message = 'خطای پایگاه داده: ' + err.code;
    }
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'توکن احراز هویت نامعتبر است';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'توکن احراز هویت منقضی شده است';
  }

  const responseBody = {
    success: false,
    message: message,
    code: err.code || 'SERVER_ERROR',
    requestId: req.requestId,
  };

  if (IS_DEV) {
    responseBody.stack = err.stack;
    responseBody.details = err.meta;
    responseBody.name = err.name;
  }

  if (res.headersSent) {
    console.error('[ERROR] Headers already sent, cannot send error response');
    return;
  }

  res.status(statusCode).json(responseBody);
});

// ═══════════════════════════════════════════════════════════════════
// 17. START SERVER & GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════════
const server = httpServer.listen(PORT, function () {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   🚀 AIStudioApp Backend v5.2.1             ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║   Port:        ' + String(PORT).padEnd(30) + '║');
  console.log('║   Mode:        ' + NODE_ENV.padEnd(30) + '║');
  console.log('║   Routes:      ' + (routeStats.loaded + ' loaded, ' + routeStats.failed + ' failed, ' + routeStats.skipped + ' skipped').padEnd(30) + '║');
  console.log('║   Socket.IO:   ' + '✅ ENABLED'.padEnd(30) + '║');
  console.log('║   BRS API:     ' + (env.BRS_AVAILABLE ? '✅ ENABLED' : '❌ DISABLED').padEnd(30) + '║');
  console.log('║   AI Gateway:  ' + (env.AI_AVAILABLE ? '✅ ENABLED' : '❌ DISABLED').padEnd(30) + '║');
  console.log('║   Database:    ' + (prismaClient ? '✅ CONNECTED' : '❌ NOT AVAILABLE').padEnd(30) + '║');
  console.log('║   Frontend:    ' + (fs.existsSync(frontendPath) ? '✅ SERVING' : '❌ NOT FOUND').padEnd(30) + '║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});

let marketSummaryCronStarted = false;
try {
  const cronEnabled = String(process.env.MARKET_SUMMARY_CRON_ENABLED || 'true').toLowerCase() !== 'false';

  // اگر PM2 cluster داری: فقط یک اینستنس کرون اجرا کند
  // مثال: فقط روی instance 0
  const pm2Instance = process.env.NODE_APP_INSTANCE;
  const isCronLeader = (pm2Instance === undefined || pm2Instance === '0');

  if (cronEnabled && isCronLeader) {
    startMarketSummaryCron();
    marketSummaryCronStarted = true;
    console.log('[SERVER] ✅ MarketSummary cron started');

    // ⚠️ FIX: این بخش قبلاً هرگز صدا زده نمی‌شد!
    // بدون این خط، registerMarketCron (ذخیره اسنپ‌شات هر ۲ دقیقه در MarketHistory)
    // و کرون‌های scalping/usage هیچ‌وقت اجرا نمی‌شدند، پس جدول MarketHistory
    // هیچ داده‌ی تازه‌ای نداشت و تحلیل بازار ساعت ۱۲:۳۵ همیشه داده‌ی خالی/قدیمی می‌دید.
    startCronJobs();
    console.log('[SERVER] ✅ Market/Scalping/Usage cron jobs started (via cron/index.cjs)');
  } else {
    console.log('[SERVER] ℹ️ MarketSummary cron not started (cronEnabled=' + cronEnabled + ', NODE_APP_INSTANCE=' + String(pm2Instance) + ')');
  }
} catch (cronErr) {
  console.error('[SERVER] ❌ Failed to start MarketSummary cron:', cronErr.message);
}

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

const activeConnections = new Set();

server.on('connection', function (conn) {
  activeConnections.add(conn);
  conn.on('close', function () {
    activeConnections.delete(conn);
  });
});

let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('');
  console.log('[SERVER] ' + signal + ' received. Starting graceful shutdown...');
  console.log('[SERVER] Active connections: ' + activeConnections.size);

  app.use(function shutdownMiddleware(_req, res, _next) {
    res.setHeader('Connection', 'close');
    if (_req.path === '/api/health' || _req.path === '/api/v1/health') {
      return res.status(503).json({
        success: false,
        status: 'shutting_down',
        message: 'سرور در حال خاموش شدن است',
      });
    }
    _next();
  });

  server.close(function () {
    console.log('[SERVER] HTTP server closed. No more connections.');
    if (marketSummaryCronStarted && typeof stopMarketSummaryCron === 'function') {
  try {
    stopMarketSummaryCron();
    console.log('[SERVER] MarketSummary cron stopped.');
  } catch (cronStopErr) {
    console.warn('[SERVER] Failed to stop MarketSummary cron:', cronStopErr.message);
  }
}


    if (io && typeof io.close === 'function') {
      io.close(function () {
        console.log('[SERVER] Socket.IO server closed.');
      });
    }

    if (prismaClient && typeof prismaClient.$disconnect === 'function') {
      prismaClient.$disconnect()
        .then(function () {
          console.log('[SERVER] Prisma client disconnected.');
          console.log('[SERVER] ✅ Graceful shutdown complete.');
          process.exit(0);
        })
        .catch(function (err) {
          console.error('[SERVER] Error disconnecting Prisma:', err.message);
          process.exit(1);
        });
    } else {
      console.log('[SERVER] ✅ Graceful shutdown complete.');
      process.exit(0);
    }
  });

  activeConnections.forEach(function (conn) {
    if (conn._httpMessage == null) {
      conn.destroy();
    } else {
      conn._httpMessage.setHeader('Connection', 'close');
    }
  });

  const forceTimeout = setTimeout(function () {
    console.error('[SERVER] ❌ Forced shutdown after 30s timeout.');
    console.error('[SERVER] Remaining connections: ' + activeConnections.size);

    activeConnections.forEach(function (conn) {
      conn.destroy();
    });

    process.exit(1);
  }, 30000);

  if (forceTimeout.unref) {
    forceTimeout.unref();
  }
}

process.on('SIGTERM', function () { gracefulShutdown('SIGTERM'); });
process.on('SIGINT', function () { gracefulShutdown('SIGINT'); });

process.on('uncaughtException', function (err) {
  console.error('');
  console.error('[FATAL] ════════════════════════════════════════');
  console.error('[FATAL] Uncaught Exception:', err.message);
  console.error('[FATAL] Stack:', err.stack);
  console.error('[FATAL] ════════════════════════════════════════');

  try {
    const errorLog = path.join(logDir, 'fatal-errors.log');
    const logEntry = '\n[' + new Date().toISOString() + '] UNCAUGHT EXCEPTION\n' +
                     'Message: ' + err.message + '\n' +
                     'Stack: ' + err.stack + '\n' +
                     '---\n';
    fs.appendFileSync(errorLog, logEntry);
  } catch (_logErr) {
  }

  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', function (reason, promise) {
  console.error('[WARN] Unhandled Promise Rejection:');
  console.error('[WARN] Reason:', reason);

  try {
    const errorLog = path.join(logDir, 'unhandled-rejections.log');
    const logEntry = '\n[' + new Date().toISOString() + '] UNHANDLED REJECTION\n' +
                     'Reason: ' + (reason instanceof Error ? reason.stack : String(reason)) + '\n' +
                     '---\n';
    fs.appendFileSync(errorLog, logEntry);
  } catch (_logErr) {
  }
});

// ═══════════════════════════════════════════════════════════════════
// 18. EXPORT
// ═══════════════════════════════════════════════════════════════════
module.exports = app;
