'use strict';

const scalpingService = require('../services/scalping.service.cjs');
const sharedMarketService = require('../services/sharedMarket.service.cjs');

function getUserId(req) {
  if (!req || !req.user) return null;
  const rawUserId = req.user.userId || req.user.id;
  if (!rawUserId) return null;
  const userId = parseInt(rawUserId, 10);
  return Number.isNaN(userId) ? null : userId;
}

function sendUnauthorized(res) {
  return res.status(401).json({ success: false, message: 'احراز هویت لازم است' });
}

function sendError(res, error, statusCode) {
  const message = error && error.message ? error.message : 'خطای داخلی سرور';
  return res.status(statusCode || 500).json({ success: false, message });
}

function sendSuccess(res, data, message, statusCode) {
  return res.status(statusCode || 200).json({
    success: true,
    message: message || undefined,
    data: data === undefined ? null : data
  });
}

async function resolveMarketStatus() {
  try {
    const market = await sharedMarketService.getMarketCurrent();
    if (!market) {
      return { isOpen: false, available: false, source: 'shared-db', reason: 'NO_SHARED_MARKET_DATA' };
    }
    return {
      isOpen: market.marketStatus === 'OPEN',
      available: true,
      source: 'shared-db',
      stale: !!market.isStale,
      updatedAt: market.updatedAt || null,
      marketDate: market.marketDate || null,
      reason: market.marketStatus === 'OPEN' ? 'OPEN' : 'CLOSED'
    };
  } catch (error) {
    console.warn('[SCALPING CTRL] Failed to resolve shared market status:', error.message);
    return { isOpen: false, available: false, source: 'shared-db', reason: 'SHARED_MARKET_DATA_UNAVAILABLE' };
  }
}

function ensureMarketOpenResponse(res, marketStatus) {
  if (marketStatus && marketStatus.isOpen === true) return null;
  return res.status(403).json({
    success: false,
    message: 'بازار بسته است و اجرای اسکالپینگ مجاز نیست',
    data: { marketStatus }
  });
}

async function getSettings(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return sendUnauthorized(res);
    const config = await scalpingService.getSettings(userId);
    return sendSuccess(res, config);
  } catch (error) {
    return sendError(res, error, 500);
  }
}

async function updateSettings(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return sendUnauthorized(res);
    const savedConfig = await scalpingService.updateSettings(userId, req.body || {});
    return sendSuccess(res, savedConfig, 'تنظیمات اسکالپینگ با موفقیت به‌روزرسانی شد');
  } catch (error) {
    return sendError(res, error, 500);
  }
}

async function getSignals(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return sendUnauthorized(res);
    const signals = await scalpingService.getOpportunities(userId, {});
    return sendSuccess(res, {
      signals,
      totalSignals: signals.length,
      activeSignals: signals.length,
      lastUpdate: signals.reduce((latest, signal) => signal.updatedAt || signal.createdAt || latest, null)
    });
  } catch (error) {
    return sendError(res, error, 500);
  }
}

async function getBestSignal(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return sendUnauthorized(res);
    const bestSignal = await scalpingService.getBest(userId);
    return sendSuccess(res, bestSignal);
  } catch (error) {
    return sendError(res, error, 500);
  }
}

async function getHistory(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return sendUnauthorized(res);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const history = await scalpingService.getHistory(userId, page, limit);
    return sendSuccess(res, history);
  } catch (error) {
    return sendError(res, error, 500);
  }
}

async function getStatus(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return sendUnauthorized(res);

    const marketStatus = await resolveMarketStatus();
    let latestRun = null;

    try {
      latestRun = await scalpingService.getLatest(userId);
    } catch (error) {
      console.warn('[SCALPING CTRL] Failed to load latest scalping run:', error.message);
    }

    const latestMeta = latestRun && typeof latestRun === 'object' ? latestRun : {};
    const mergedStatus = {
      isRunning: latestMeta.status === 'running',
      lastRunId: latestMeta.id || null,
      lastStatus: latestMeta.status || null,
      lastUpdate: latestMeta.finishedAt || latestMeta.createdAt || null,
      lastUpdated: latestMeta.finishedAt || latestMeta.createdAt || null,
      statusCheckedAt: new Date().toISOString(),
      todayTrades: 0,
      activePositions: 0,
      todayPnL: 0,
      marketStatus,
      marketOpen: marketStatus.isOpen === true
    };

    return sendSuccess(res, mergedStatus);
  } catch (error) {
    return sendError(res, error, 500);
  }
}

async function start(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return sendUnauthorized(res);
    const marketStatus = await resolveMarketStatus();
    const blockedResponse = ensureMarketOpenResponse(res, marketStatus);
    if (blockedResponse) return blockedResponse;
    const result = await scalpingService.getOpportunities(userId, {});
    return sendSuccess(res, result, 'سیگنال‌های مرکزی اسکالپینگ آماده هستند');
  } catch (error) {
    console.error('[SCALPING CTRL] start failed:', error && error.stack ? error.stack : error);
    return sendError(res, error, 500);
  }
}

async function runScalping(req, res) {
  return start(req, res);
}

async function stop(req, res) {
  const userId = getUserId(req);
  if (!userId) return sendUnauthorized(res);
  return res.status(409).json({
    success: false,
    message: 'تولید اسکالپینگ به‌صورت مرکزی انجام می‌شود و توسط کاربر قابل توقف نیست',
    code: 'CENTRAL_SCALPING_WORKER'
  });
}

module.exports = {
  getSettings,
  updateSettings,
  getSignals,
  getBestSignal,
  getHistory,
  getStatus,
  runScalping,
  start,
  stop,
  getConfig: getSettings,
  saveConfig: updateSettings
};
