'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const scalpingController = require('../controllers/scalping.controller.cjs');
const brsService = require('../services/brs.service.cjs');

/*
 * Market-status compatibility bridge.
 *
 * brs.service.cjs exposes getLocalMarketWindowStatus() with the field
 * `isOpenBySchedule`, while the scalping layer expects `isOpen`.
 * Without this bridge the normalizer receives an object without `isOpen`
 * and incorrectly reports the market as closed during trading hours.
 *
 * This bridge also keeps `available` explicit, so a valid market-status
 * response is never confused with a transport/API failure.
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
