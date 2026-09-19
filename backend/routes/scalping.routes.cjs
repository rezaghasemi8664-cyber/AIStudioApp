'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const scalpingController = require('../controllers/scalping.controller.cjs');
const brsService = require('../services/brs.service.cjs');
const scalpingService = require('../services/scalping.service.cjs');

/*
 * Market-status compatibility bridge.
 *
 * The scalping service currently prefers brsService.getMarketStatus(), which
 * can wait on the external BRS API. The status endpoint must never block on
 * that dependency because the local Tehran trading schedule is sufficient to
 * answer whether the market window is open.
 *
 * Prefer the local schedule immediately. If it is unavailable, fall back to
 * the original BRS status with a short timeout. This also keeps the exported
 * scalpingService.getMarketStatus() safe for the controller and cron users.
 */
if (
  brsService &&
  typeof brsService.getLocalMarketWindowStatus === 'function' &&
  scalpingService &&
  !scalpingService.__marketStatusCompatibilityPatched
) {
  const originalGetMarketStatus = typeof scalpingService.getMarketStatus === 'function'
    ? scalpingService.getMarketStatus.bind(scalpingService)
    : null;
  const originalGetLocalMarketWindowStatus = brsService.getLocalMarketWindowStatus.bind(brsService);

  const withTimeout = function withTimeout(promise, timeoutMs) {
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('BRS market status timeout')), timeoutMs);
      })
    ]);
  };

  scalpingService.getMarketStatus = async function patchedScalpingMarketStatus() {
    try {
      const localStatus = originalGetLocalMarketWindowStatus();
      if (localStatus && typeof localStatus === 'object') {
        return {
          ...localStatus,
          isOpen: localStatus.isOpenBySchedule === true,
          available: true,
          source: 'local-schedule',
          reason: localStatus.isOpenBySchedule === true ? 'OPEN' : 'CLOSED'
        };
      }
    } catch (error) {
      console.warn('[SCALPING ROUTES] Local market schedule failed:', error.message);
    }

    if (originalGetMarketStatus) {
      try {
        const remoteStatus = await withTimeout(originalGetMarketStatus(), 5000);
        if (remoteStatus && typeof remoteStatus === 'object') {
          return remoteStatus;
        }
      } catch (error) {
        console.warn('[SCALPING ROUTES] BRS market status unavailable:', error.message);
      }
    }

    return {
      isOpen: false,
      available: false,
      source: 'market-status-timeout',
      reason: 'MARKET_STATUS_UNAVAILABLE',
      checkedAt: new Date().toISOString()
    };
  };

  scalpingService.__marketStatusCompatibilityPatched = true;
}

/*
 * Legacy compatibility bridge for callers that use the local schedule
 * method directly.
 */
if (
  brsService &&
  typeof brsService.getLocalMarketWindowStatus === 'function' &&
  !brsService.getLocalMarketWindowStatus.__scalpingCompatibilityPatched
) {
  const originalGetLocalMarketWindowStatus = brsService.getLocalMarketWindowStatus.bind(brsService);

  const patchedGetLocalMarketWindowStatus = function patchedGetLocalMarketWindowStatus(now) {
    const status = originalGetLocalMarketWindowStatus(now);

    if (!status || typeof status !== 'object') {
      return {
        isOpen: false,
        isOpenBySchedule: false,
        available: false,
        source: 'brs.getLocalMarketWindowStatus',
        reason: 'invalid-market-window-status'
      };
    }

    return {
      ...status,
      isOpen: status.isOpenBySchedule === true,
      available: true,
      source: 'brs.getLocalMarketWindowStatus',
      reason: status.isOpenBySchedule === true ? 'market-open' : 'market-closed'
    };
  };

  patchedGetLocalMarketWindowStatus.__scalpingCompatibilityPatched = true;
  brsService.getLocalMarketWindowStatus = patchedGetLocalMarketWindowStatus;
}

function safeHandler(fn, name) {
  if (typeof fn === 'function') return fn;
  return function (_req, res) {
    return res.status(501).json({
      success: false,
      message: 'Scalping handler not implemented: ' + name,
      code: 'SCALPING_HANDLER_MISSING'
    });
  };
}

router.get('/settings', authMiddleware, safeHandler(scalpingController.getSettings, 'getSettings'));
router.put('/settings', authMiddleware, safeHandler(scalpingController.updateSettings, 'updateSettings'));
router.get('/signals', authMiddleware, safeHandler(scalpingController.getSignals, 'getSignals'));
router.get('/best', authMiddleware, safeHandler(scalpingController.getBestSignal, 'getBestSignal'));
router.get('/history', authMiddleware, safeHandler(scalpingController.getHistory, 'getHistory'));
router.get('/status', authMiddleware, safeHandler(scalpingController.getStatus, 'getStatus'));
router.post('/start', authMiddleware, safeHandler(scalpingController.start, 'start'));
router.post('/stop', authMiddleware, safeHandler(scalpingController.stop, 'stop'));

// Backward-compatible aliases
router.get('/config', authMiddleware, safeHandler(scalpingController.getSettings, 'getSettings'));
router.put('/config', authMiddleware, safeHandler(scalpingController.updateSettings, 'updateSettings'));
router.post('/run', authMiddleware, safeHandler(scalpingController.runScalping, 'runScalping'));

module.exports = router;
