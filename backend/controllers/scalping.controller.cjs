'use strict';

const scalpingService = require('../services/scalping.service.cjs');
const brsService = require('../services/brs.service.cjs');

function getUserId(req) {
  if (!req || !req.user) {
    return null;
  }

  const rawUserId = req.user.userId || req.user.id;
  if (!rawUserId) {
    return null;
  }

  const userId = parseInt(rawUserId, 10);
  return Number.isNaN(userId) ? null : userId;
}

function sendUnauthorized(res) {
  return res.status(401).json({
    success: false,
    message: 'احراز هویت لازم است'
  });
}

function sendError(res, error, statusCode) {
  const message =
    error && error.message ? error.message : 'خطای داخلی سرور';

  return res.status(statusCode || 500).json({
    success: false,
    message
  });
}

function sendSuccess(res, data, message, statusCode) {
  return res.status(statusCode || 200).json({
    success: true,
    message: message || undefined,
    data: data === undefined ? null : data
  });
}

async function callFirstAvailable(methodNames, args) {
  for (const methodName of methodNames) {
    if (typeof scalpingService[methodName] === 'function') {
      return scalpingService[methodName](...args);
    }
  }

  throw new Error(`Methods not available: ${methodNames.join(', ')}`);
}

async function resolveMarketStatus() {
  try {
    if (typeof scalpingService.getMarketStatus === 'function') {
      const status = await scalpingService.getMarketStatus();
      if (status && typeof status === 'object') {
        return Object.assign(
          {
            isOpen: false,
            source: 'scalpingService.getMarketStatus',
            reason: 'unknown'
          },
          status
        );
      }
    }

    if (typeof brsService.getMarketStatus === 'function') {
      const status = await brsService.getMarketStatus();
      if (status && typeof status === 'object') {
        return Object.assign(
          {
            isOpen: false,
            source: 'brsService.getMarketStatus',
            reason: 'unknown'
          },
          status
        );
      }
    }

    if (typeof brsService.isMarketOpen === 'function') {
      const isOpen = await Promise.resolve(brsService.isMarketOpen());
      return {
        isOpen: !!isOpen,
        source: 'brsService.isMarketOpen',
        reason: isOpen ? 'market-open' : 'market-closed'
      };
    }
  } catch (error) {
    console.warn(
      '[SCALPING CTRL] Failed to resolve market status:',
      error && error.message ? error.message : error
    );

    return {
      isOpen: false,
      source: 'market-status-error',
      reason: error && error.message ? error.message : 'market-status-failed'
    };
  }

  return {
    isOpen: false,
    source: 'market-status-missing',
    reason: 'market-status-unavailable'
  };
}

function ensureMarketOpenResponse(res, marketStatus) {
  if (marketStatus && marketStatus.isOpen === true) {
    return null;
  }

  if (marketStatus && marketStatus.source === 'market-status-missing') {
    return res.status(503).json({
      success: false,
      message: 'وضعیت بازار قابل تشخیص نیست و اجرای اسکالپینگ متوقف شد',
      data: {
        marketStatus
      }
    });
  }

  return res.status(403).json({
    success: false,
    message: 'بازار بسته است و اجرای اسکالپینگ مجاز نیست',
    data: {
      marketStatus
    }
  });
}

async function getSettings(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendUnauthorized(res);
    }

    const config = await callFirstAvailable(['getSettings', 'getConfig'], [userId]);
    return sendSuccess(res, config);
  } catch (error) {
    return sendError(res, error, /Methods not available/.test(error.message) ? 501 : 500);
  }
}

async function updateSettings(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendUnauthorized(res);
    }

    const payload = req.body || {};
    const savedConfig = await callFirstAvailable(
      ['updateSettings', 'saveConfig'],
      [userId, payload]
    );

    return sendSuccess(res, savedConfig, 'تنظیمات اسکالپینگ با موفقیت به‌روزرسانی شد');
  } catch (error) {
    return sendError(res, error, /Methods not available/.test(error.message) ? 501 : 500);
  }
}

async function getSignals(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendUnauthorized(res);
    }

    const signals = await callFirstAvailable(
      ['getSignals', 'getScalpingSignals'],
      [userId]
    );

    return sendSuccess(res, signals);
  } catch (error) {
    return sendError(res, error, /Methods not available/.test(error.message) ? 501 : 500);
  }
}

async function getBestSignal(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendUnauthorized(res);
    }

    const bestSignal = await callFirstAvailable(
      ['getBestSignal', 'getTopSignal', 'getRecommendedSignal'],
      [userId]
    );

    return sendSuccess(res, bestSignal);
  } catch (error) {
    return sendError(res, error, /Methods not available/.test(error.message) ? 501 : 500);
  }
}

async function getHistory(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendUnauthorized(res);
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);

    const history = await callFirstAvailable(
      ['getHistory', 'getScalpingHistory'],
      [userId, page, limit]
    );

    return sendSuccess(res, history);
  } catch (error) {
    return sendError(res, error, /Methods not available/.test(error.message) ? 501 : 500);
  }
}

async function getStatus(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendUnauthorized(res);
    }

    const [status, marketStatus] = await Promise.all([
      callFirstAvailable(['getStatus', 'getEngineStatus'], [userId]),
      resolveMarketStatus()
    ]);

    const mergedStatus = Object.assign(
      {
        isRunning: false
      },
      status && typeof status === 'object' ? status : {},
      {
        marketStatus,
        marketOpen:
          marketStatus && typeof marketStatus.isOpen !== 'undefined'
            ? marketStatus.isOpen
            : false
      }
    );

    return sendSuccess(res, mergedStatus);
  } catch (error) {
    return sendError(res, error, /Methods not available/.test(error.message) ? 501 : 500);
  }
}

async function start(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendUnauthorized(res);
    }

    const marketStatus = await resolveMarketStatus();
    const blockedResponse = ensureMarketOpenResponse(res, marketStatus);
    if (blockedResponse) {
      return blockedResponse;
    }

    const result = await callFirstAvailable(
      ['startEngine', 'runEngine', 'runScalping'],
      [userId]
    );

    return sendSuccess(res, result, 'اسکالپینگ با موفقیت اجرا شد');
  } catch (error) {
    console.error(
      '[SCALPING CTRL] start failed:',
      error && error.stack ? error.stack : error
    );

    return sendError(res, error, /Methods not available/.test(error.message) ? 501 : 500);
  }
}

async function runScalping(req, res) {
  return start(req, res);
}

async function stop(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return sendUnauthorized(res);
    }

    const result = await callFirstAvailable(
      ['stopEngine', 'stopScalping'],
      [userId]
    );

    return sendSuccess(res, result, 'اسکالپینگ با موفقیت متوقف شد');
  } catch (error) {
    return sendError(res, error, /Methods not available/.test(error.message) ? 501 : 500);
  }
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

  // Backward compatibility
  getConfig: getSettings,
  saveConfig: updateSettings
};
