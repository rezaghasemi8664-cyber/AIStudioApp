'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const scalpingController = require('../controllers/scalping.controller.cjs');

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
